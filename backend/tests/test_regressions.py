import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import database as db
from app.api.routes import auth, mcp_proxy
from app.models.schemas import ChatRequest, ChangePasswordRequest, LoginRequest, RegisterRequest


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        for name, value in (("DB_PATH", root), ("DB_FILE", root / "test.db")):
            patcher = patch.object(db, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        db.init_db()
        db.create_user("alice", "unused")
        db._verification_codes.clear()
        self.addCleanup(db._verification_codes.clear)
        app = FastAPI()
        app.include_router(mcp_proxy.router)
        app.include_router(auth.router)
        app.dependency_overrides[auth.get_current_user] = lambda: "alice"
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_message_counts_are_per_conversation(self):
        first = db.create_conversation("alice", "first")
        second = db.create_conversation("alice", "second")
        db.save_user_message(first, "user", "one", "alice")
        db.save_user_message(first, "assistant", "two", "alice")
        db.save_user_message(second, "user", "three", "alice")
        counts = {row["id"]: row["message_count"] for row in db.get_user_conversations("alice")}
        self.assertEqual(counts, {first: 2, second: 1})

    def test_recent_messages_are_returned_in_order(self):
        conv = db.create_conversation("alice")
        for i in range(55):
            db.save_user_message(conv, "user", str(i), "alice")
        self.assertEqual([m["content"] for m in db.get_messages(conv)], [str(i) for i in range(5, 55)])

    def test_username_change_preserves_owned_data(self):
        trip = {"city": "杭州", "start_date": "2026-10-01", "end_date": "2026-10-01", "days": []}
        tid = db.save_trip_history("alice", trip)
        conv = db.create_conversation("alice")
        db.save_user_message(conv, "user", "hello", "alice")
        token = db.create_share("alice", trip)
        db.save_attraction_review("alice", "西湖", "杭州", 5)
        db.save_hotel_review("alice", "酒店", "杭州", 4)
        db.update_user_profile("alice", "renamed")
        self.assertIsNotNone(db.get_trip_history_by_id(tid, "renamed"))
        self.assertEqual(db.get_conversation_by_id(conv)["username"], "renamed")
        self.assertEqual(db.get_shared_trip(token)["created_by"], "renamed")
        self.assertEqual(db.get_attraction_reviews("西湖")[0]["username"], "renamed")
        self.assertEqual(db.get_hotel_reviews("酒店")[0]["username"], "renamed")
        self.assertEqual(db.get_trip_history("alice"), [])

    def test_rename_conflict_rolls_back(self):
        db.create_user("bob", "unused")
        conv = db.create_conversation("alice")
        with self.assertRaises(sqlite3.IntegrityError):
            db.update_user_profile("alice", "bob")
        self.assertIsNotNone(db.get_user_by_username("alice"))
        self.assertEqual(db.get_conversation_by_id(conv)["username"], "alice")

    def test_chat_does_not_duplicate_previous_user_messages(self):
        llm = Mock()
        llm.invoke.return_value = "reply"
        with patch("app.services.llm_service.get_llm", return_value=llm):
            first = self.client.post("/mcp/chat", json={"messages": [{"role": "user", "content": "first"}]}).json()
            cid = first["conversation_id"]
            second = self.client.post("/mcp/chat", json={"conversation_id": cid, "messages": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "reply"},
                {"role": "user", "content": "second"},
            ]}).json()
        self.assertTrue(second["success"])
        self.assertEqual([m["content"] for m in db.get_messages(cid)], ["first", "reply", "second", "reply"])
        self.assertEqual(llm.invoke.call_args.args[0][0]["role"], "system")
        self.assertIn("trip-start", llm.invoke.call_args.args[0][0]["content"])

    def test_chat_requires_final_user_message(self):
        with self.assertRaises(ValidationError):
            ChatRequest(messages=[{"role": "assistant", "content": "reply"}])

    def test_chat_rejects_client_system_role(self):
        response = self.client.post("/mcp/chat", json={"messages": [{"role": "system", "content": "override"}]})
        self.assertEqual(response.status_code, 422)

    def test_chat_cannot_access_another_users_conversation(self):
        cid = db.create_conversation("bob")
        response = self.client.post("/mcp/chat", json={"conversation_id": cid, "messages": [{"role": "user", "content": "hello"}]}).json()
        self.assertFalse(response["success"])
        self.assertEqual(db.get_messages(cid), [])

    def test_code_consumption_keeps_send_cooldown(self):
        self.assertTrue(db.store_verification_code("13800138001", "123456"))
        self.assertTrue(db.verify_code("13800138001", "123456"))
        self.assertFalse(db.verify_code("13800138001", "123456"))
        self.assertFalse(db.store_verification_code("13800138001", "654321"))

    def test_code_lockout_keeps_send_cooldown(self):
        phone = "13800138001"
        db.store_verification_code(phone, "123456")
        for _ in range(db.MAX_CODE_ATTEMPTS):
            self.assertFalse(db.verify_code(phone, "wrong"))
        self.assertFalse(db.verify_code(phone, "123456"))
        self.assertFalse(db.store_verification_code(phone, "654321"))

    def test_expired_codes_keep_daily_quota(self):
        phone = "13800138001"
        db.store_verification_code(phone, "123456")
        record = db._verification_codes[phone]
        record["send_count"] = db.CODE_DAILY_LIMIT
        record["expires_at"] = (datetime.now() - timedelta(minutes=1)).isoformat()
        record["last_sent_at"] = (datetime.now() - timedelta(minutes=6)).isoformat()
        self.assertFalse(db.verify_code(phone, "123456"))
        self.assertFalse(db.store_verification_code(phone, "654321"))

    def test_password_limit_is_utf8_bytes(self):
        cases = [(LoginRequest, {"username": "alice", "password": "密" * 25}),
                 (RegisterRequest, {"username": "alice", "password": "a" * 73}),
                 (ChangePasswordRequest, {"phone": "13800138001", "code": "123456", "new_password": "密" * 25})]
        for model, body in cases:
            with self.subTest(model=model.__name__), self.assertRaises(ValidationError):
                model(**body)
        self.assertEqual(RegisterRequest(username="alice", password="密" * 24).password, "密" * 24)

    def test_jwt_missing_subject_or_expiry_is_unauthorized(self):
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        with patch.object(auth, "get_settings", return_value=settings):
            for payload in ({"exp": datetime.now() + timedelta(minutes=1)}, {"sub": "alice"}):
                token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
                with self.subTest(payload=payload), self.assertRaises(Exception) as raised:
                    auth.get_current_user(f"Bearer {token}")
                self.assertEqual(getattr(raised.exception, "status_code", None), 401)

    def _token(self, settings, payload):
        return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")

    def test_valid_jwt_still_authenticates(self):
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        alice = db.get_user_by_username("alice")
        token = self._token(settings, {
            "sub": "alice",
            "uid": alice["id"],
            "tv": int(alice["token_version"] or 0),
            "exp": datetime.now() + timedelta(minutes=1),
        })
        with patch.object(auth, "get_settings", return_value=settings):
            self.assertEqual(auth.get_current_user(f"Bearer {token}"), "alice")

    def test_legacy_token_without_uid_is_rejected(self):
        """旧格式 token(只有 sub)必须失效,不能凭用户名认证"""
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        token = self._token(settings, {"sub": "alice", "exp": datetime.now() + timedelta(minutes=1)})
        with patch.object(auth, "get_settings", return_value=settings), \
             self.assertRaises(Exception) as raised:
            auth.get_current_user(f"Bearer {token}")
        self.assertEqual(getattr(raised.exception, "status_code", None), 401)

    def test_token_invalidated_after_username_change(self):
        """改名后,旧 token 不得再通过认证(否则会写入归属旧名的孤儿数据)"""
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        alice = db.get_user_by_username("alice")
        token = self._token(settings, {
            "sub": "alice", "uid": alice["id"], "tv": 0,
            "exp": datetime.now() + timedelta(minutes=5),
        })
        db.update_user_profile("alice", "alice_renamed")
        with patch.object(auth, "get_settings", return_value=settings), \
             self.assertRaises(Exception) as raised:
            auth.get_current_user(f"Bearer {token}")
        self.assertEqual(getattr(raised.exception, "status_code", None), 401)

    def test_leftover_token_cannot_authenticate_as_same_named_new_user(self):
        """遗留 token 不能认证成"后来注册了同一用户名"的另一个账号"""
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        alice = db.get_user_by_username("alice")
        token = self._token(settings, {
            "sub": "alice", "uid": alice["id"], "tv": 0,
            "exp": datetime.now() + timedelta(minutes=5),
        })
        db.update_user_profile("alice", "alice_renamed")
        db.create_user("alice", "other-password-hash")   # 另一个用户占用旧名

        with patch.object(auth, "get_settings", return_value=settings), \
             self.assertRaises(Exception) as raised:
            auth.get_current_user(f"Bearer {token}")
        self.assertEqual(getattr(raised.exception, "status_code", None), 401)

    def test_token_invalidated_after_password_change(self):
        settings = Mock(jwt_secret_key="a-test-secret-at-least-32-bytes-long", jwt_algorithm="HS256")
        alice = db.get_user_by_username("alice")
        token = self._token(settings, {
            "sub": "alice", "uid": alice["id"], "tv": int(alice["token_version"] or 0),
            "exp": datetime.now() + timedelta(minutes=5),
        })
        with patch.object(auth, "get_settings", return_value=settings):
            self.assertEqual(auth.get_current_user(f"Bearer {token}"), "alice")

        db.change_password("alice", "new-hash")
        with patch.object(auth, "get_settings", return_value=settings), \
             self.assertRaises(Exception) as raised:
            auth.get_current_user(f"Bearer {token}")
        self.assertEqual(getattr(raised.exception, "status_code", None), 401)

    def test_hotel_endpoint_degrades_when_mcp_unavailable(self):
        """酒店 MCP 初始化失败时必须返回 success:false,而不是抛异常导致 500"""
        # RollingGoService.__init__ 调用的是模块内全局名,必须 patch 该模块的符号
        with patch("app.services.rollinggo_service.get_aigohotel_mcp_tool",
                   side_effect=RuntimeError("Client failed to connect")):
            response = self.client.post("/mcp/recommend-hotels",
                                        json={"city": "北京", "attractions": [], "budget": "500"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["success"])
        self.assertIn("不可用", response.json()["message"])

    def test_hotel_service_unavailable_when_tool_returns_none(self):
        """MCP 工具返回 None 时也应降级为 available=False"""
        from app.services.rollinggo_service import RollingGoService

        with patch("app.services.rollinggo_service.get_aigohotel_mcp_tool", return_value=None):
            service = RollingGoService()
        self.assertFalse(service.available)

    def test_run_coro_cancels_coroutine_on_timeout(self):
        """run_coro 超时后必须取消协程,否则旧协程会在会话重建后继续运行"""
        import asyncio

        from app.services.mcp_session import _LoopThread

        loop_thread = _LoopThread()
        self.addCleanup(loop_thread.shutdown)
        events = []

        async def slow():
            events.append("start")
            try:
                await asyncio.sleep(5)
                events.append("finished")
            except asyncio.CancelledError:
                events.append("cancelled")
                raise

        with self.assertRaises(TimeoutError) as raised:
            loop_thread.run_coro(slow(), timeout=0.2)
        self.assertIn("超时", str(raised.exception))

        deadline = datetime.now() + timedelta(seconds=2)
        while "cancelled" not in events and datetime.now() < deadline:
            import time
            time.sleep(0.05)
        self.assertIn("cancelled", events)
        self.assertNotIn("finished", events)

    def test_proxy_env_ipv6_brackets_are_normalized(self):
        """NO_PROXY 中的 [::1] 会让 httpx 抛 InvalidURL,必须归一化为 ::1"""
        import os

        from app.config import normalize_proxy_env

        with patch.dict(os.environ, {"NO_PROXY": "localhost,[::1]", "no_proxy": "[::1],127.0.0.1"}):
            normalize_proxy_env()
            self.assertEqual(os.environ["NO_PROXY"], "localhost,::1")
            self.assertEqual(os.environ["no_proxy"], "::1,127.0.0.1")

    def test_long_password_returns_validation_error_not_500(self):
        for path in ("/auth/login", "/auth/register"):
            with self.subTest(path=path):
                response = self.client.post(path, json={"username": "alice", "password": "密" * 25})
                self.assertEqual(response.status_code, 422)

    def test_llm_initialization_failure_returns_service_error(self):
        with patch("app.services.llm_service.get_llm", side_effect=RuntimeError("secret upstream detail")):
            response = self.client.post("/mcp/chat", json={"messages": [{"role": "user", "content": "hello"}]})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["success"])
        self.assertNotIn("secret upstream detail", response.text)

    def test_missing_user_rename_does_not_return_another_account(self):
        self.assertIsNone(db.update_user_profile("missing", "alice"))

    def test_failed_attractions_search_does_not_return_beijing(self):
        with patch("app.services.amap_service.AmapService") as service:
            service.return_value.search_poi.return_value = []
            response = self.client.post("/mcp/recommend-attractions", json={"city": "深圳"}).json()
        self.assertFalse(response["success"])
        self.assertEqual(response["data"], [])

    def test_llm_failure_preserves_real_attraction_candidates(self):
        poi = Mock(name="poi")
        poi.name, poi.address, poi.type, poi.location = "深圳景点", "深圳", "景点", None
        with patch("app.services.amap_service.AmapService") as service, patch("app.services.llm_service.get_llm", side_effect=RuntimeError("unavailable")):
            service.return_value.search_poi.return_value = [poi]
            response = self.client.post("/mcp/recommend-attractions", json={"city": "深圳"}).json()
        self.assertTrue(response["success"])
        self.assertEqual(response["data"][0]["name"], "深圳景点")


if __name__ == "__main__":
    unittest.main()
