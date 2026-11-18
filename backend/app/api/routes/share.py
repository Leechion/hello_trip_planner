"""行程分享路由"""
from fastapi import APIRouter, Depends, HTTPException
from ...database import create_share, get_shared_trip
from .auth import get_current_user

router = APIRouter(prefix="/share", tags=["行程分享"])


@router.post("")
async def share_trip(data: dict, username: str = Depends(get_current_user)):
    """创建分享链接"""
    trip = data.get("trip_data")
    if not trip:
        raise HTTPException(status_code=400, detail="缺少行程数据")
    token = create_share(username, trip)
    share_path = f"/share/{token}"
    return {"success": True, "token": token, "url": share_path, "share_url": share_path}


@router.get("/{token}")
async def view_shared_trip(token: str):
    """查看分享的行程（无需登录）"""
    item = get_shared_trip(token)
    if not item:
        raise HTTPException(status_code=404, detail="分享不存在或已过期")
    return {
        "success": True,
        "data": item["trip_data"],
        "trip_data": item["trip_data"],
        "created_by": item["created_by"],
        "created_at": item["created_at"],
    }
