"""认证路由 — 登录 / 注册 / 个人信息 / 头像上传 / 手机号绑定 / 修改密码"""
import os
import random
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Header
from ...config import get_settings
from ...database import (
    get_user_by_username, get_user_by_id, get_user_by_phone, create_user,
    update_avatar, update_user_profile, bind_phone, change_password,
    store_verification_code, verify_code,
)
from ...models.schemas import (
    LoginRequest, RegisterRequest, AuthResponse,
    UserProfileResponse, UserProfileUpdateRequest,
    SendCodeRequest, BindPhoneRequest, ChangePasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["认证"])

# 头像存储目录
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "static" / "avatars"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _create_token(user: dict) -> str:
    """按用户记录签发 token。

    payload 里同时带上不可复用的 uid 与 token_version：
    - uid  : 用户 id 永不复用，可区分"本人"与"恰好同名的另一个用户"
    - tv   : 改名/改密后自增，使此前签发的 token 立即失效
    """
    settings = get_settings()
    payload = {
        "sub": user["username"],
        "uid": user["id"],
        "tv": int(user.get("token_version") or 0),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(authorization: str = Header(None)) -> str:
    """JWT 鉴权依赖 — 校验签名、有效期、用户身份与 token 版本，返回当前用户名"""
    if not authorization:
        raise HTTPException(status_code=401, detail="请先登录")
    try:
        scheme, token = authorization.split(" ", 1)
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="认证格式错误")
    except ValueError:
        raise HTTPException(status_code=401, detail="认证格式错误")

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm],
                             options={"require": ["sub", "exp"]})
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的认证信息")

    stale = HTTPException(status_code=401, detail="登录状态已失效，请重新登录")

    # 按不可变的 uid 定位用户：用户名可被改名，也可被他人重新注册，
    # 仅凭 sub 查询会把"旧用户的遗留 token"错认成"同名的新用户"。
    user_id = payload.get("uid")
    if not isinstance(user_id, int):
        raise stale
    user = get_user_by_id(user_id)
    if user is None:
        raise stale
    # 改名后 sub 与当前用户名不一致，同样视为失效
    if user["username"] != payload["sub"]:
        raise stale
    if int(payload.get("tv", 0)) != int(user.get("token_version") or 0):
        raise stale
    return user["username"]


def _user_to_response(user: dict, token: str | None = None, message: str = "") -> AuthResponse:
    """将 user dict 转为 AuthResponse"""
    return AuthResponse(
        success=True,
        message=message,
        token=token,
        username=user.get("username") or "",
        nickname=user.get("nickname") or "",
        avatar_url=user.get("avatar_url") or "",
    )


# ==================== 登录 ====================

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    user = get_user_by_username(body.username)
    if user is None:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if not bcrypt.checkpw(body.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = _create_token(user)
    return _user_to_response(user, token=token, message="登录成功")


# ==================== 注册 ====================

@router.post("/register", response_model=AuthResponse)
async def register(body: RegisterRequest):
    existing = get_user_by_username(body.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="用户名已存在")

    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    created = create_user(body.username, password_hash)
    created.setdefault("token_version", 0)
    token = _create_token(created)
    return AuthResponse(
        success=True,
        message="注册成功",
        token=token,
        username=body.username,
        nickname="",
        avatar_url="",
    )


# ==================== 个人信息 ====================

@router.get("/profile", response_model=UserProfileResponse)
async def profile(username: str = Depends(get_current_user)):
    user = get_user_by_username(username)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserProfileResponse(
        success=True,
        username=username,
        nickname=user.get("nickname") or "",
        phone=user.get("phone") or "",
        phone_verified=bool(user.get("phone_verified")),
        avatar_url=user.get("avatar_url") or "",
    )


@router.put("/profile", response_model=AuthResponse)
async def update_profile(body: UserProfileUpdateRequest, username: str = Depends(get_current_user)):
    new_username = body.username.strip()
    if not new_username:
        raise HTTPException(status_code=400, detail="用户名不能为空")

    existing = get_user_by_username(new_username)
    if existing is not None and existing["username"] != username:
        raise HTTPException(status_code=409, detail="用户名已存在")

    current_user = get_user_by_username(username)
    if current_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    avatar_url = body.avatar_url if body.avatar_url is not None else current_user.get("avatar_url") or ""
    nickname = body.nickname if body.nickname is not None else current_user.get("nickname") or ""

    try:
        updated_user = update_user_profile(username, new_username, avatar_url, nickname)
    except Exception:
        raise HTTPException(status_code=409, detail="用户名已存在")

    if updated_user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    return _user_to_response(
        updated_user,
        token=_create_token(updated_user),
        message="个人信息已保存",
    )


# ==================== 头像上传 ====================

@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    username: str = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="请选择文件")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"仅支持 {', '.join(ALLOWED_EXTENSIONS)} 格式")

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像大小不能超过 2MB")

    # 纵深防御:即使 username 校验被绕过,也只取基名并强制落在 UPLOAD_DIR 内
    safe_username = Path(username).name
    filename = f"{safe_username}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = UPLOAD_DIR / filename
    if filepath.resolve().parent != UPLOAD_DIR.resolve():
        raise HTTPException(status_code=400, detail="非法的用户名")
    filepath.write_bytes(contents)

    avatar_url = f"/static/avatars/{filename}"
    update_avatar(username, avatar_url)

    return {"success": True, "avatar_url": avatar_url}


# ==================== 手机号绑定 ====================

@router.post("/send-code")
async def send_code(body: SendCodeRequest):
    """发送短信验证码（开发环境打印到控制台）"""
    phone = body.phone.strip()
    if not phone.isdigit() or len(phone) != 11:
        raise HTTPException(status_code=400, detail="请输入正确的11位手机号")

    # 生成 6 位验证码;冷却期内或超出日配额时不重新生成
    code = "".join(str(random.randint(0, 9)) for _ in range(6))
    if not store_verification_code(phone, code):
        raise HTTPException(status_code=429, detail="验证码发送过于频繁，请稍后再试")

    return {"success": True, "message": "验证码已发送", "phone": phone}


@router.post("/bind-phone")
async def bind_phone_route(body: BindPhoneRequest, username: str = Depends(get_current_user)):
    """绑定手机号（需验证码）"""
    phone = body.phone.strip()
    if not phone.isdigit() or len(phone) != 11:
        raise HTTPException(status_code=400, detail="请输入正确的11位手机号")

    if not verify_code(phone, body.code):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    ok = bind_phone(username, phone)
    if not ok:
        raise HTTPException(status_code=409, detail="该手机号已被其他账号绑定")

    return {"success": True, "message": "手机号绑定成功", "phone": phone}


# ==================== 修改密码 ====================

@router.post("/change-password")
async def change_password_route(body: ChangePasswordRequest, username: str = Depends(get_current_user)):
    """修改密码（需已绑定手机号 + 短信验证码）"""
    user = get_user_by_username(username)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 校验手机号是否与当前用户绑定的一致
    if not user.get("phone") or not user.get("phone_verified"):
        raise HTTPException(status_code=400, detail="请先绑定手机号")
    if user["phone"] != body.phone:
        raise HTTPException(status_code=400, detail="手机号与绑定号码不一致")

    if not verify_code(body.phone, body.code):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    new_hash = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    change_password(username, new_hash)

    return {"success": True, "message": "密码修改成功"}
