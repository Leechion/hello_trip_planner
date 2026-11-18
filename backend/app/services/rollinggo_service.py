"""AigoHotel 酒店服务 — 通过 MCP (STDIO) 调用"""

import json, re
from typing import List
from ..config import get_settings
from ..models.schemas import Hotel, Location
from .mcp_session import PersistentMCPTool, register_session

_aigohotel_mcp_tool = None


def get_aigohotel_mcp_tool():
    global _aigohotel_mcp_tool
    if _aigohotel_mcp_tool is not None:
        return _aigohotel_mcp_tool

    settings = get_settings()
    if not settings.aigohotel_mcp_key:
        print("⚠️  AigoHotel MCP Key 未配置，酒店搜索不可用")
        return None

    # 初始化失败(如 aigohotel-mcp 未安装)必须降级为 None，
    # 不能让异常冒泡到路由 —— 否则 RollingGoService() 构造即抛错，
    # mcp_proxy 里 "if not service.available" 的优雅降级分支永远不可达，请求变成 500。
    try:
        tool = register_session(PersistentMCPTool(
            name="aigohotel",
            server_command=["aigohotel-mcp"],
            env={"AIGOHOTEL_API_KEY": settings.aigohotel_mcp_key},
        ))
        print(f"✅ AigoHotel MCP 初始化成功（{len(tool.available_tools)} tools）")
        _aigohotel_mcp_tool = tool
        return _aigohotel_mcp_tool
    except Exception as e:
        print(f"⚠️  AigoHotel MCP 初始化失败，酒店搜索不可用: {e}")
        return None


class RollingGoService:

    def __init__(self):
        # 再兜一层:即使 get_aigohotel_mcp_tool 意外抛错(例如未来改动),
        # 构造也不能失败 —— 否则路由里的 "if not service.available" 降级分支不可达,请求变 500。
        try:
            self.mcp_tool = get_aigohotel_mcp_tool()
        except Exception as e:
            print(f"⚠️  AigoHotel MCP 初始化异常，酒店搜索不可用: {e}")
            self.mcp_tool = None
        self.available = self.mcp_tool is not None

    def _extract_json(self, result) -> dict | None:
        if isinstance(result, dict):
            return result
        if not isinstance(result, str):
            return None
        m = re.search(r"```(?:json)?\s*(.*?)```", result, re.DOTALL)
        if m:
            try: return json.loads(m.group(1))
            except: pass
        m = re.search(r"\{.*\}", result, re.DOTALL)
        if m:
            try: return json.loads(m.group())
            except: pass
        return None

    def search_hotels(self, city: str, keyword: str = "", limit: int = 10,
                      check_in: str = "", stay_nights: int = 1,
                      place: str = "", star_rating: str = "") -> List[Hotel]:
        if not self.available:
            return []

        if place:
            args = {"place": place, "placeType": "景点", "originQuery": keyword or "找酒店", "size": min(limit, 20)}
        else:
            args = {"place": city, "placeType": "城市", "originQuery": keyword or "找酒店", "size": min(limit, 20)}
        if star_rating and star_rating.isdigit():
            price_max = int(star_rating)
            args["hotelTags"] = {"maxPricePerNight": float(price_max)}
        if check_in or stay_nights > 1:
            args["checkInParam"] = {}
            if check_in:
                args["checkInParam"]["checkInDate"] = check_in
            if stay_nights > 1:
                args["checkInParam"]["stayNights"] = stay_nights

        try:
            raw = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": "searchHotels",
                "arguments": args,
            })
        except Exception as e:
            print(f"❌ AigoHotel 调用失败: {e}")
            return []

        data = self._extract_json(raw)
        if not data or not isinstance(data, dict):
            return []

        hotels_data = data.get("hotelInformationList", data.get("hotels", []))
        hotels: List[Hotel] = []
        for h in (hotels_data if isinstance(hotels_data, list) else []):
            price_info = h.get("price", {})
            lng = float(h.get("longitude", 0) or 0)
            lat = float(h.get("latitude", 0) or 0)
            price = int(price_info.get("lowestPrice", 0) or 0)
            dist_m = h.get("distanceInMeters", 0)

            hotels.append(Hotel(
                name=h.get("name", ""),
                address=h.get("address", ""),
                location=Location(longitude=lng, latitude=lat) if (lng or lat) else None,
                price_range=f"¥{price}" if price else "",
                rating=str(h.get("starRating", "")),
                distance=f"距市中心{format(dist_m/1000, '.1f')}km" if dist_m else "",
                type=keyword or "酒店",
                estimated_cost=price,
            ))
        if hotels:
            print(f"✅ AigoHotel 搜索到 {len(hotels)} 家酒店（最低 ¥{min(h.estimated_cost for h in hotels)}）")
        return hotels
