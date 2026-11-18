"""高德地图MCP服务封装"""

import json
import re
from typing import List, Dict, Any, Optional
from ..config import get_settings
from ..models.schemas import Location, POIInfo, WeatherInfo
from .mcp_session import PersistentMCPTool, register_session

# 全局MCP工具实例
_amap_mcp_tool = None


def get_amap_mcp_tool() -> PersistentMCPTool:
    """
    获取高德地图MCP工具实例(单例模式)
    
    Returns:
        PersistentMCPTool实例
    """
    global _amap_mcp_tool
    
    if _amap_mcp_tool is None:
        settings = get_settings()
        
        if not settings.amap_api_key:
            raise ValueError("高德地图API Key未配置,请在.env文件中设置AMAP_API_KEY")
        
        # 创建MCP工具(长驻会话:避免每次调用都重新 spawn uvx 子进程)
        _amap_mcp_tool = register_session(PersistentMCPTool(
            name="amap",
            server_command=["uvx", "--no-refresh", "amap-mcp-server"],
            env={"AMAP_MAPS_API_KEY": settings.amap_api_key},
        ))

        print(f"✅ 高德地图MCP工具初始化成功")

        # 打印可用工具列表(首次会触发连接)
        try:
            tools = _amap_mcp_tool.available_tools
            print(f"   工具数量: {len(tools)}")
            for tool in tools[:5]:
                print(f"     - {tool.get('name', 'unknown')}")
            if len(tools) > 5:
                print(f"     ... 还有 {len(tools) - 5} 个工具")
        except Exception as e:
            print(f"   ⚠️  工具列表获取失败(调用时重试): {e}")
    
    return _amap_mcp_tool


class AmapService:
    """高德地图服务封装类"""
    
    def __init__(self):
        """初始化服务"""
        self.mcp_tool = get_amap_mcp_tool()
        self._geo_cache: dict[str, tuple[float, float]] = {}

    def _extract_json_payload(self, result: Any) -> Any:
        """尽量从 MCP 返回值里提取 JSON 数据"""
        if isinstance(result, (dict, list)):
            return result

        if not isinstance(result, str):
            return None

        fenced_match = re.search(r"```(?:json)?\s*(.*?)```", result, re.DOTALL)
        if fenced_match:
            candidate = fenced_match.group(1).strip()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

        for pattern in (r"\{.*\}", r"\[.*\]"):
            json_match = re.search(pattern, result, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    continue

        return None

    def _get_available_tools_count(self) -> int:
        tools = getattr(self.mcp_tool, "_available_tools", None) or []
        return len(tools)
    
    def search_poi(self, keywords: str, city: str, citylimit: bool = True) -> List[POIInfo]:
        """
        搜索POI
        
        Args:
            keywords: 搜索关键词
            city: 城市
            citylimit: 是否限制在城市范围内
            
        Returns:
            POI信息列表
        """
        try:
            # 调用MCP工具
            result = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": "maps_text_search",
                "arguments": {
                    "keywords": keywords,
                    "city": city,
                    "citylimit": str(citylimit).lower()
                }
            })
            
            print(f"POI搜索结果: {result[:200]}...")  # 打印前200字符
            
            data = self._extract_json_payload(result)
            if not isinstance(data, dict):
                print("❌ 无法从结果中提取JSON数据")
                return []

            pois_data = data.get("pois", [])
            
            # 转换为POIInfo对象列表
            pois = []
            for poi_data in pois_data:
                name = poi_data.get("name", "")
                address = poi_data.get("address", "")

                # 先尝试 text_search 的 location 字段
                location_str = poi_data.get("location", "")
                longitude, latitude = 0.0, 0.0
                if location_str and "," in location_str:
                    try:
                        parts = location_str.split(",")
                        longitude = float(parts[0].strip())
                        latitude = float(parts[1].strip())
                    except (ValueError, IndexError):
                        pass

                # text_search 无坐标时，有限度地用 maps_geo 反查，避免主流程被大量串行请求拖慢
                geo_cache_key = f"{city}|{address}"
                if (longitude == 0.0 and latitude == 0.0) and geo_cache_key in self._geo_cache:
                    longitude, latitude = self._geo_cache[geo_cache_key]

                if (longitude == 0.0 and latitude == 0.0) and address and len(self._geo_cache) < 3:
                    try:
                        geo_result = self.mcp_tool.run({
                            "action": "call_tool",
                            "tool_name": "maps_geo",
                            "arguments": {"address": f"{city}{address}", "city": city}
                        })
                        geo_data = self._extract_json_payload(geo_result)
                        geocodes = geo_data.get("return", []) if isinstance(geo_data, dict) else []
                        if geocodes:
                            loc = geocodes[0].get("location", "")
                            if loc and "," in loc:
                                parts = loc.split(",")
                                longitude = float(parts[0].strip())
                                latitude = float(parts[1].strip())
                                self._geo_cache[geo_cache_key] = (longitude, latitude)
                    except Exception:
                        pass

                pois.append(POIInfo(
                    id=poi_data.get("id", ""),
                    name=name,
                    type=poi_data.get("type", ""),
                    address=address,
                    location=Location(longitude=longitude, latitude=latitude),
                    tel=poi_data.get("tel")
                ))
            
            print(f"✅ 成功解析 {len(pois)} 个POI")
            return pois
            
        except Exception as e:
            print(f"❌ POI搜索失败: {str(e)}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_weather(self, city: str) -> List[WeatherInfo]:
        """
        查询天气
        
        Args:
            city: 城市名称
            
        Returns:
            天气信息列表
        """
        try:
            # 调用MCP工具
            result = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": "maps_weather",
                "arguments": {
                    "city": city
                }
            })
            
            print(f"天气查询结果: {result[:200]}...")

            data = self._extract_json_payload(result)
            if not isinstance(data, dict):
                return []

            forecasts = []
            if isinstance(data.get("forecasts"), list):
                # 4天预报：forecasts 直接是 [{date, dayweather, ...}, ...]
                if data["forecasts"] and isinstance(data["forecasts"][0], dict) and "dayweather" in data["forecasts"][0]:
                    forecasts = data["forecasts"]
                # 旧格式：forecasts[0].casts
                elif data["forecasts"] and isinstance(data["forecasts"][0], dict):
                    casts = data["forecasts"][0].get("casts", [])
                    if isinstance(casts, list):
                        forecasts = casts
            if not forecasts and isinstance(data.get("lives"), list):
                forecasts = data["lives"]

            weather_list = []
            for item in forecasts:
                if not isinstance(item, dict):
                    continue
                weather_list.append(
                    WeatherInfo(
                        date=item.get("date") or item.get("reporttime", "").split(" ")[0] or "",
                        day_weather=item.get("dayweather") or item.get("weather") or "",
                        night_weather=item.get("nightweather") or item.get("weather") or "",
                        day_temp=item.get("daytemp") or item.get("temperature") or 0,
                        night_temp=item.get("nighttemp") or item.get("temperature_float") or item.get("temperature") or 0,
                        wind_direction=item.get("daywind") or item.get("winddirection") or "",
                        wind_power=item.get("daypower") or item.get("windpower") or "",
                    )
                )

            return weather_list
            
        except Exception as e:
            print(f"❌ 天气查询失败: {str(e)}")
            return []
    
    def plan_route(
        self,
        origin_address: str,
        destination_address: str,
        origin_city: Optional[str] = None,
        destination_city: Optional[str] = None,
        route_type: str = "walking"
    ) -> Optional[Dict[str, Any]]:
        """
        规划路线
        
        Args:
            origin_address: 起点地址
            destination_address: 终点地址
            origin_city: 起点城市
            destination_city: 终点城市
            route_type: 路线类型 (walking/driving/transit)
            
        Returns:
            路线信息
        """
        try:
            # 根据路线类型选择工具
            tool_map = {
                "walking": "maps_direction_walking_by_address",
                "driving": "maps_direction_driving_by_address",
                "transit": "maps_direction_transit_integrated_by_address"
            }
            
            tool_name = tool_map.get(route_type, "maps_direction_walking_by_address")
            
            # 构建参数
            arguments = {
                "origin_address": origin_address,
                "destination_address": destination_address
            }
            
            # 公共交通需要城市参数
            if route_type == "transit":
                if origin_city:
                    arguments["origin_city"] = origin_city
                if destination_city:
                    arguments["destination_city"] = destination_city
            else:
                # 其他路线类型也可以提供城市参数提高准确性
                if origin_city:
                    arguments["origin_city"] = origin_city
                if destination_city:
                    arguments["destination_city"] = destination_city
            
            # 调用MCP工具
            result = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": tool_name,
                "arguments": arguments
            })
            
            print(f"路线规划结果: {result[:200]}...")

            data = self._extract_json_payload(result)
            if not isinstance(data, dict):
                return None

            route = None
            if isinstance(data.get("route"), dict):
                route = data["route"]
            elif isinstance(data.get("data"), dict):
                route = data["data"]

            paths = []
            if isinstance(route, dict):
                if isinstance(route.get("paths"), list):
                    paths = route["paths"]
                elif isinstance(route.get("transits"), list):
                    paths = route["transits"]

            first_path = paths[0] if paths and isinstance(paths[0], dict) else route if isinstance(route, dict) else {}
            distance = first_path.get("distance") or 0
            duration = first_path.get("duration") or 0

            try:
                distance = float(distance)
                duration = int(float(duration))
            except (TypeError, ValueError):
                return None

            if distance <= 0 and duration <= 0:
                return None

            return {
                "distance": distance,
                "duration": duration,
                "route_type": route_type,
                "description": f"{route_type} 路线, 约 {distance:.0f} 米, {duration // 60 if duration else 0} 分钟"
            }
            
        except Exception as e:
            print(f"❌ 路线规划失败: {str(e)}")
            return None
    
    def geocode(self, address: str, city: Optional[str] = None) -> Optional[Location]:
        """
        地理编码(地址转坐标)

        Args:
            address: 地址
            city: 城市

        Returns:
            经纬度坐标
        """
        try:
            arguments = {"address": address}
            if city:
                arguments["city"] = city

            result = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": "maps_geo",
                "arguments": arguments
            })

            print(f"地理编码结果: {result[:200]}...")

            data = self._extract_json_payload(result)
            if not isinstance(data, dict):
                return None

            geocodes = data.get("geocodes", [])
            first = geocodes[0] if isinstance(geocodes, list) and geocodes else data
            location = first.get("location", "")
            if isinstance(location, str) and "," in location:
                longitude, latitude = location.split(",", 1)
                return Location(longitude=float(longitude), latitude=float(latitude))

            return None

        except Exception as e:
            print(f"❌ 地理编码失败: {str(e)}")
            return None

    def get_poi_detail(self, poi_id: str) -> Dict[str, Any]:
        """
        获取POI详情

        Args:
            poi_id: POI ID

        Returns:
            POI详情信息
        """
        try:
            result = self.mcp_tool.run({
                "action": "call_tool",
                "tool_name": "maps_search_detail",
                "arguments": {
                    "id": poi_id
                }
            })

            print(f"POI详情结果: {result[:200]}...")

            data = self._extract_json_payload(result)
            if isinstance(data, dict):
                return data

            return {"raw": result}

        except Exception as e:
            print(f"❌ 获取POI详情失败: {str(e)}")
            return {}


# 创建全局服务实例
_amap_service = None


def get_amap_service() -> AmapService:
    """获取高德地图服务实例(单例模式)"""
    global _amap_service
    
    if _amap_service is None:
        _amap_service = AmapService()
    
    return _amap_service
