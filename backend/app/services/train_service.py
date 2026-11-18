"""12306 火车票服务 — 通过 MCP (STDIO) 调用"""

import json, re
from typing import List, Optional
from .mcp_session import PersistentMCPTool, register_session

_train_mcp_tool = None


def get_train_mcp_tool():
    global _train_mcp_tool
    if _train_mcp_tool is not None:
        return _train_mcp_tool

    try:
        tool = register_session(PersistentMCPTool(
            name="12306",
            server_command=["12306-mcp"],
        ))
        print(f"✅ 12306 MCP 初始化成功（{len(tool.available_tools)} tools）")
        _train_mcp_tool = tool
        return _train_mcp_tool
    except Exception as e:
        print(f"⚠️  12306 MCP 初始化失败: {e}")
        _train_mcp_tool = None
        return None


class TrainService:

    def __init__(self):
        self.mcp_tool = None
        self.available = True

    def _ensure_tool(self) -> PersistentMCPTool | None:
        if self.mcp_tool is None:
            self.mcp_tool = get_train_mcp_tool()
            self.available = self.mcp_tool is not None
        return self.mcp_tool

    def _extract_json(self, result) -> dict | list | None:
        if isinstance(result, (dict, list)):
            return result
        if not isinstance(result, str):
            return None
        payload = result.split("\n", 1)[1] if result.startswith("工具 ") else result
        try:
            data = json.loads(payload)
            if isinstance(data, (dict, list)):
                return data
        except (TypeError, ValueError):
            pass
        m = re.search(r"```(?:json)?\s*(.*?)```", result, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
        m = re.search(r"\[.*\]|\{.*\}", result, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
        return None

    def get_city_stations(self, city: str) -> list[dict]:
        """查询城市所有火车站"""
        tool = self._ensure_tool()
        if not tool:
            return []
        try:
            raw = tool.run({
                "action": "call_tool",
                "tool_name": "get-stations-code-in-city",
                "arguments": {"city": city},
            })
            data = self._extract_json(raw)
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"❌ 12306 车站查询失败: {e}")
            return []

    def search_tickets(
        self,
        from_city: str,
        to_city: str,
        date: str,
        train_filter: str = "G",
        earliest_time: int = 6,
        latest_time: int = 22,
        limit: int = 5,
    ) -> dict:
        """搜索余票。

        返回 {"ok": bool, "data": str, "reason": str}：
        - ok=True  : data 为格式化文本(格式与旧版一致)
        - ok=False : data 为 ""，reason 说明失败原因(unavailable / station_not_found / query_failed)
        调用方必须检查 ok，不要对失败结果返回 success=True。
        """
        tool = self._ensure_tool()
        if not tool:
            return {"ok": False, "data": "", "reason": "unavailable"}

        from_station = ""
        to_station = ""
        try:
            raw_from = tool.run({
                "action": "call_tool",
                "tool_name": "get-station-code-of-citys",
                "arguments": {"citys": from_city},
            })
            data_from = self._extract_json(raw_from) or {}
            if from_city in data_from and "station_code" in data_from[from_city]:
                from_station = data_from[from_city]["station_code"]
        except Exception:
            pass

        try:
            raw_to = tool.run({
                "action": "call_tool",
                "tool_name": "get-station-code-of-citys",
                "arguments": {"citys": to_city},
            })
            data_to = self._extract_json(raw_to) or {}
            if to_city in data_to and "station_code" in data_to[to_city]:
                to_station = data_to[to_city]["station_code"]
        except Exception:
            pass

        if not from_station or not to_station:
            print(f"⚠️  未找到车站编码: {from_city} -> {to_city}")
            return {"ok": False, "data": "", "reason": "station_not_found"}

        try:
            raw = tool.run({
                "action": "call_tool",
                "tool_name": "get-tickets",
                "arguments": {
                    "date": date,
                    "fromStation": from_station,
                    "toStation": to_station,
                    "trainFilterFlags": train_filter,
                    "earliestStartTime": earliest_time,
                    "latestStartTime": latest_time,
                    "sortFlag": "startTime",
                    "limitedNum": limit,
                    "format": "text",
                },
            })
            text = raw if isinstance(raw, str) else str(raw) if raw is not None else ""
            payload = text.split("\n", 1)[1] if text.startswith("工具 ") else text
            payload = payload.strip()
            if not payload or payload == "None" or payload.startswith((
                "Error:", "MCP 连接失败:", "异步操作失败:", "错误：",
            )):
                return {"ok": False, "data": "", "reason": "query_failed"}
            return {"ok": True, "data": text, "reason": ""}
        except Exception as e:
            print(f"❌ 12306 余票查询失败: {e}")
            return {"ok": False, "data": "", "reason": "query_failed"}
