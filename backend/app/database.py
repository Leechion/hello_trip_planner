"""数据库模块 — SQLite 连接与表管理"""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent
DB_PATH = DB_DIR / "data"
DB_FILE = DB_PATH / "app.db"

# ========== 内存验证码存储 ==========
_verification_codes: dict[str, dict] = {}


def get_connection() -> sqlite3.Connection:
    DB_PATH.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """初始化所有数据库表"""
    with get_connection() as conn:
        cursor = conn.cursor()

        # ——— users ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                avatar_url      TEXT DEFAULT '',
                nickname        TEXT DEFAULT '',
                phone           TEXT DEFAULT '',
                phone_verified  INTEGER DEFAULT 0,
                token_version   INTEGER DEFAULT 0,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— trip_history ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trip_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                username    TEXT NOT NULL,
                city        TEXT NOT NULL,
                start_date  TEXT NOT NULL,
                end_date    TEXT NOT NULL,
                travel_days INTEGER NOT NULL,
                trip_data   TEXT NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— shared_trips ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS shared_trips (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                token       TEXT NOT NULL UNIQUE,
                trip_data   TEXT NOT NULL,
                created_by  TEXT NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— attraction_reviews ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attraction_reviews (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT NOT NULL,
                attraction_name TEXT NOT NULL,
                city            TEXT NOT NULL,
                rating          INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment         TEXT DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— hotel_reviews ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hotel_reviews (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                username    TEXT NOT NULL,
                hotel_name  TEXT NOT NULL,
                city        TEXT NOT NULL,
                rating      INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                comment     TEXT DEFAULT '',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— conversations ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                username    TEXT NOT NULL,
                title       TEXT DEFAULT '',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ——— messages ———
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
                content         TEXT NOT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)

        # 兼容旧表
        for col, col_def in [
            ("avatar_url", "TEXT DEFAULT ''"),
            ("nickname", "TEXT DEFAULT ''"),
            ("phone", "TEXT DEFAULT ''"),
            ("phone_verified", "INTEGER DEFAULT 0"),
            ("token_version", "INTEGER DEFAULT 0"),
        ]:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {col_def}")
            except sqlite3.OperationalError:
                pass
        conn.commit()


# ========== Users ==========

def get_user_by_username(username: str) -> dict | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, password_hash, avatar_url, nickname, phone, phone_verified, token_version, created_at "
            "FROM users WHERE username = ?", (username,)
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    """按不可变的用户 id 查询。用于校验 token 归属:
    用户名可以改名、也可以被他人重新注册，只有 id 不会复用。"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, password_hash, avatar_url, nickname, phone, phone_verified, token_version, created_at "
            "FROM users WHERE id = ?", (user_id,)
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def get_user_by_phone(phone: str) -> dict | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, password_hash, avatar_url, nickname, phone, phone_verified, token_version, created_at "
            "FROM users WHERE phone = ? AND phone_verified = 1", (phone,)
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def update_avatar(username: str, avatar_url: str):
    with get_connection() as conn:
        conn.execute("UPDATE users SET avatar_url = ? WHERE username = ?", (avatar_url, username))
        conn.commit()


def update_user_profile(
    current_username: str, new_username: str,
    avatar_url: str | None = None,
    nickname: str | None = None,
) -> dict | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        parts, params = ["username = ?"], [new_username]
        if avatar_url is not None:
            parts.append("avatar_url = ?"); params.append(avatar_url)
        if nickname is not None:
            parts.append("nickname = ?"); params.append(nickname)
        params.append(current_username)
        cursor.execute(f"UPDATE users SET {', '.join(parts)} WHERE username = ?", params)
        if cursor.rowcount == 0:
            return None
        if current_username != new_username:
            for table, column in (
                ("trip_history", "username"), ("conversations", "username"),
                ("attraction_reviews", "username"), ("hotel_reviews", "username"),
                ("shared_trips", "created_by"),
            ):
                cursor.execute(
                    f"UPDATE {table} SET {column} = ? WHERE {column} = ?",
                    (new_username, current_username),
                )
            # 改名后自增 token_version：旧 token 的 sub 已过期，
            # 且能防止他人重新注册旧用户名后用遗留 token 认证成该新账号
            cursor.execute(
                "UPDATE users SET token_version = token_version + 1 WHERE username = ?",
                (new_username,)
            )
        conn.commit()
        cursor.execute(
            "SELECT id, username, password_hash, avatar_url, nickname, phone, phone_verified, token_version, created_at "
            "FROM users WHERE username = ?", (new_username,)
        )
        row = cursor.fetchone()
    return dict(row) if row else None


def bind_phone(username: str, phone: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM users WHERE phone = ? AND phone_verified = 1 AND username != ?",
            (phone, username)
        )
        if cursor.fetchone():
            return False
        cursor.execute(
            "UPDATE users SET phone = ?, phone_verified = 1 WHERE username = ?",
            (phone, username)
        )
        conn.commit()
    return True


def change_password(username: str, new_password_hash: str):
    # 改密同时自增 token_version，使此前签发的 token 立即失效
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE username = ?",
            (new_password_hash, username)
        )
        conn.commit()


def get_token_version(username: str) -> int | None:
    """获取用户当前 token 版本；用户不存在返回 None"""
    with get_connection() as conn:
        row = conn.execute("SELECT token_version FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        return None
    return int(row["token_version"] or 0)


def create_user(username: str, password_hash: str) -> dict:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
        conn.commit()
    return {"id": cursor.lastrowid, "username": username}


def seed_test_user():
    from .config import get_settings
    if not get_settings().debug:
        return
    import bcrypt
    existing = get_user_by_username("admin")
    if existing is None:
        password_hash = bcrypt.hashpw("admin123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        create_user("admin", password_hash)
        with get_connection() as conn:
            conn.execute(
                "UPDATE users SET nickname = ?, phone = ?, phone_verified = 1 WHERE username = ?",
                ("管理员", "13800138000", "admin")
            )
            conn.commit()
        print("[DB] 测试用户已创建: admin / admin123")


# ========== 验证码 ==========
# 注意:限流与次数状态都在进程内存中。多 worker / 重启会重置,
# 生产环境应改为 Redis(带 TTL)或 SQLite 表,使状态落在进程外。

MAX_CODE_ATTEMPTS = 5        # 单个验证码允许的最大错误次数
CODE_SEND_COOLDOWN = 60      # 同一手机号重新发送的最小间隔(秒)
CODE_DAILY_LIMIT = 10        # 同一手机号每日发送上限


def store_verification_code(phone: str, code: str) -> bool:
    """发送验证码。返回 False 表示被冷却/配额拦截,未重新生成。"""
    now = datetime.now()
    record = _verification_codes.get(phone)

    if record:
        last_sent = record.get("last_sent_at")
        if last_sent and (now - datetime.fromisoformat(last_sent)).total_seconds() < CODE_SEND_COOLDOWN:
            return False
        # 跨天重置发送计数
        send_count_date = record.get("send_count_date")
        if send_count_date != now.date().isoformat():
            record["send_count"] = 0
            record["send_count_date"] = now.date().isoformat()
        if record.get("send_count", 0) >= CODE_DAILY_LIMIT:
            return False
        send_count = record.get("send_count", 0) + 1
    else:
        send_count = 1

    _verification_codes[phone] = {
        "code": code,
        "expires_at": (now + timedelta(minutes=5)).isoformat(),
        "attempts": 0,
        "last_sent_at": now.isoformat(),
        "send_count": send_count,
        "send_count_date": now.date().isoformat(),
    }
    # 明文验证码仅开发环境输出,避免生产日志泄露
    from .config import get_settings
    if get_settings().debug:
        print(f"[SMS] 验证码已发送到 {phone}：{code}")
    return True


def verify_code(phone: str, code: str) -> bool:
    record = _verification_codes.get(phone)
    if not record or not record["code"]:
        return False
    if datetime.now().isoformat() > record["expires_at"]:
        record["code"] = ""
        return False
    if record["code"] != code:
        # 累计错误次数,达到上限即作废该验证码,防止暴力枚举
        record["attempts"] = record.get("attempts", 0) + 1
        if record["attempts"] >= MAX_CODE_ATTEMPTS:
            record["code"] = ""
        return False
    # 作废验证码时保留发送记录，冷却和日配额仍须生效。
    record["code"] = ""
    return True


# ========== 旅行历史 ==========

def save_trip_history(username: str, trip_data: dict) -> int:
    """保存旅行计划到历史记录"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO trip_history (username, city, start_date, end_date, travel_days, trip_data)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (username, trip_data["city"], trip_data["start_date"], trip_data["end_date"],
             len(trip_data.get("days", [])), json.dumps(trip_data, ensure_ascii=False))
        )
        conn.commit()
        return cursor.lastrowid


def update_trip_history(trip_id: int, username: str, trip_data: dict) -> bool:
    """编辑后覆盖更新已保存的历史行程"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE trip_history
               SET city = ?, start_date = ?, end_date = ?, travel_days = ?, trip_data = ?
               WHERE id = ? AND username = ?""",
            (trip_data["city"], trip_data["start_date"], trip_data["end_date"],
             len(trip_data.get("days", [])), json.dumps(trip_data, ensure_ascii=False),
             trip_id, username)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_trip_history(username: str) -> list[dict]:
    """获取用户的所有历史行程"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, city, start_date, end_date, travel_days, trip_data, created_at "
            "FROM trip_history WHERE username = ? ORDER BY created_at DESC",
            (username,)
        )
        rows = cursor.fetchall()
    results = []
    for row in rows:
        d = dict(row)
        d["trip_data"] = json.loads(d["trip_data"])
        results.append(d)
    return results


def get_trip_history_by_id(trip_id: int, username: str) -> dict | None:
    """获取单条历史行程"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, city, start_date, end_date, travel_days, trip_data, created_at "
            "FROM trip_history WHERE id = ? AND username = ?",
            (trip_id, username)
        )
        row = cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["trip_data"] = json.loads(d["trip_data"])
    return d


def delete_trip_history(trip_id: int, username: str) -> bool:
    """删除单条历史行程"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM trip_history WHERE id = ? AND username = ?", (trip_id, username))
        conn.commit()
        return cursor.rowcount > 0


# ========== 行程分享 ==========

def create_share(username: str, trip_data: dict) -> str:
    """创建分享，返回 token"""
    import uuid
    token = uuid.uuid4().hex[:12]
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO shared_trips (token, trip_data, created_by) VALUES (?, ?, ?)",
            (token, json.dumps(trip_data, ensure_ascii=False), username)
        )
        conn.commit()
    return token


def get_shared_trip(token: str) -> dict | None:
    """根据 token 获取分享的行程"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_data, created_by, created_at FROM shared_trips WHERE token = ?", (token,))
        row = cursor.fetchone()
    if not row:
        return None
    return {"trip_data": json.loads(row["trip_data"]), "created_by": row["created_by"], "created_at": row["created_at"]}


# ========== 景点评价 ==========

def save_attraction_review(username: str, attraction_name: str, city: str, rating: int, comment: str = "") -> int:
    """保存景点评价（同一用户对同一景点只保留最新一条）"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM attraction_reviews WHERE username = ? AND attraction_name = ? AND city = ?",
            (username, attraction_name, city)
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE attraction_reviews SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (rating, comment, existing["id"])
            )
            conn.commit()
            return existing["id"]
        cursor.execute(
            "INSERT INTO attraction_reviews (username, attraction_name, city, rating, comment) VALUES (?, ?, ?, ?, ?)",
            (username, attraction_name, city, rating, comment)
        )
        conn.commit()
        return cursor.lastrowid


def get_attraction_reviews(attraction_name: str, city: str = "") -> list[dict]:
    """获取景点评价列表"""
    with get_connection() as conn:
        cursor = conn.cursor()
        if city:
            cursor.execute(
                "SELECT username, attraction_name, city, rating, comment, created_at "
                "FROM attraction_reviews WHERE attraction_name = ? AND city = ? ORDER BY created_at DESC",
                (attraction_name, city)
            )
        else:
            cursor.execute(
                "SELECT username, attraction_name, city, rating, comment, created_at "
                "FROM attraction_reviews WHERE attraction_name = ? ORDER BY created_at DESC",
                (attraction_name,)
            )
        return [dict(row) for row in cursor.fetchall()]


def get_attraction_avg_rating(attraction_name: str, city: str = "") -> dict:
    """获取景点平均评分"""
    with get_connection() as conn:
        cursor = conn.cursor()
        if city:
            cursor.execute(
                "SELECT COUNT(*) as count, AVG(rating) as avg_rating "
                "FROM attraction_reviews WHERE attraction_name = ? AND city = ?",
                (attraction_name, city)
            )
        else:
            cursor.execute(
                "SELECT COUNT(*) as count, AVG(rating) as avg_rating "
                "FROM attraction_reviews WHERE attraction_name = ?",
                (attraction_name,)
            )
        row = cursor.fetchone()
    return {"count": row["count"] or 0, "avg_rating": round(row["avg_rating"] or 0, 1)}


# ========== 酒店评价 ==========

def save_hotel_review(username: str, hotel_name: str, city: str, rating: int, comment: str = "") -> int:
    """保存酒店评价"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM hotel_reviews WHERE username = ? AND hotel_name = ? AND city = ?",
            (username, hotel_name, city)
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE hotel_reviews SET rating = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
                (rating, comment, existing["id"])
            )
            conn.commit()
            return existing["id"]
        cursor.execute(
            "INSERT INTO hotel_reviews (username, hotel_name, city, rating, comment) VALUES (?, ?, ?, ?, ?)",
            (username, hotel_name, city, rating, comment)
        )
        conn.commit()
        return cursor.lastrowid


def get_hotel_reviews(hotel_name: str, city: str = "") -> list[dict]:
    with get_connection() as conn:
        cursor = conn.cursor()
        if city:
            cursor.execute(
                "SELECT username, hotel_name, city, rating, comment, created_at "
                "FROM hotel_reviews WHERE hotel_name = ? AND city = ? ORDER BY created_at DESC",
                (hotel_name, city)
            )
        else:
            cursor.execute(
                "SELECT username, hotel_name, city, rating, comment, created_at "
                "FROM hotel_reviews WHERE hotel_name = ? ORDER BY created_at DESC",
                (hotel_name,)
            )
        return [dict(row) for row in cursor.fetchall()]


def get_hotel_avg_rating(hotel_name: str, city: str = "") -> dict:
    with get_connection() as conn:
        cursor = conn.cursor()
        if city:
            cursor.execute(
                "SELECT COUNT(*) as count, AVG(rating) as avg_rating "
                "FROM hotel_reviews WHERE hotel_name = ? AND city = ?",
                (hotel_name, city)
            )
        else:
            cursor.execute(
                "SELECT COUNT(*) as count, AVG(rating) as avg_rating "
                "FROM hotel_reviews WHERE hotel_name = ?",
                (hotel_name,)
            )
        row = cursor.fetchone()
    return {"count": row["count"] or 0, "avg_rating": round(row["avg_rating"] or 0, 1)}


# ========== 对话历史 ==========

def create_conversation(username: str, title: str = "") -> int:
    """创建新对话，返回 conversation id"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (username, title) VALUES (?, ?)",
            (username, title or f"对话 {datetime.now().strftime('%H:%M')}")
        )
        conn.commit()
        return cursor.lastrowid


def save_user_message(conversation_id: int, role: str, content: str, username: str) -> int:
    """保存用户消息到对话"""
    conversation_exists = get_conversation_by_id(conversation_id)
    if not conversation_exists or conversation_exists.get("username") != username:
        raise ValueError("对话不存在或权限不足")
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, role, content)
        )
        cursor.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND username = ?",
            (conversation_id, username)
        )
        conn.commit()
        return cursor.lastrowid


def get_messages(conversation_id: int, limit: int = 50) -> list[dict]:
    """获取对话的历史消息"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, role, content, created_at FROM messages "
            "WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
            (conversation_id, limit)
        )
        rows = cursor.fetchall()
    return [
        {"role": row["role"], "content": row["content"], "created_at": row["created_at"]}
        for row in reversed(rows)
    ]


def get_user_conversations(username: str, limit: int = 50) -> list[dict]:
    """获取用户的所有对话列表（最新的前 N 条）"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, title, created_at, updated_at, "
            "(SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) as message_count "
            "FROM conversations WHERE username = ? ORDER BY updated_at DESC LIMIT ?",
            (username, limit)
        )
        rows = cursor.fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": row["message_count"],
        }
        for row in rows
    ]


def delete_conversation(conversation_id: int, username: str) -> bool:
    """删除对话及其所有消息"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM conversations WHERE id = ? AND username = ?", (conversation_id, username))
        conn.commit()
        return cursor.rowcount > 0


def get_conversation_by_id(conversation_id: int) -> dict | None:
    """根据 id 获取对话"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, title, created_at, updated_at FROM conversations WHERE id = ?",
            (conversation_id,)
        )
        row = cursor.fetchone()
    if not row:
        return None
    return dict(row)
