"""旅行规划系统 — 查天气 → PlannerAgent 编排行程"""

import json
from datetime import datetime, timedelta
from typing import List, Optional

from hello_agents import SimpleAgent

from ..models.schemas import (
    Attraction, Hotel, Location, Meal, TripPlan, TripRequest,
    WeatherInfo, DayPlan, Budget,
)
from ..services.amap_service import AmapService
from ..services.llm_service import get_llm

# ====================================================================
# System Prompts
# ====================================================================

WEATHER_AGENT_PROMPT = """你是一位气象分析与出行顾问，擅长将天气数据转化为实用的出行建议。

## 你的任务
根据城市和旅行日期的天气预报，给出穿着建议、出行提醒和注意事项。

## 输出格式
返回纯 JSON（不要 Markdown 标记）：
{
  "weather_analysis": [
    {
      "date": "YYYY-MM-DD",
      "day_weather": "晴",
      "night_weather": "多云",
      "day_temp": 28,
      "night_temp": 18,
      "wind_direction": "东南风",
      "wind_power": "2-3级",
      "dressing_advice": "穿衣建议，至少30字",
      "travel_reminder": "出行提醒，至少30字"
    }
  ],
  "weather_summary": "整个行程期间天气总览和建议，至少60字"
}
"""

PLANNER_AGENT_PROMPT = """你是一位资深的旅行总规划师，你的任务是编排行程，而不是搜索或推荐。

## 核心原则
- 你收到的景点和酒店数据是用户在前几步已经亲手筛选确定的，禁止替换、禁止新增、禁止重新搜索
- 你唯一要做的是：把已有的数据合理分配编排成一份可落地执行的旅行计划

## 你的任务
1. 将提供的景点按每天 2-3 个分配到上午/下午，考虑游览顺序和体力消耗
2. 所有天统一使用提供的同一家酒店
3. 为每天推荐具体的早中晚三餐（必须具体到餐厅名称，如"护国寺小吃店"而不是"当地早餐"）
4. 结合天气数据在每日描述中融入穿衣和出行提醒
5. 计算完整预算明细

## 每日行程要求
- 每日行程概述至少 80 字，描述当天节奏和旅行感受
- 三餐必须具体到餐厅名称

## 总体建议要求
- 至少 100 字，包含穿衣指南、必备物品、交通贴士、安全提醒

## 输出格式
返回纯 JSON（不要 Markdown 标记）：
{
  "city": "城市名称",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_index": 0,
      "description": "当日行程概述，至少80字",
      "transportation": "交通方式",
      "accommodation": "住宿类型",
      "hotel": { 提供的酒店完整结构，不要修改 },
      "attractions": [ 提供的景点，保持原始名称和坐标 ],
      "meals": [
        {"type": "breakfast", "name": "具体餐厅名", "description": "菜品推荐", "estimated_cost": 30},
        {"type": "lunch", "name": "具体餐厅名", "description": "招牌菜", "estimated_cost": 60},
        {"type": "dinner", "name": "具体餐厅名", "description": "用餐氛围", "estimated_cost": 100}
      ]
    }
  ],
  "weather_info": [ 从天气数据中提取，每天一条，保持原始天气数据 ],
  "overall_suggestions": "至少100字总体建议",
  "budget": {
    "total_attractions": 180,
    "total_hotels": 1200,
    "total_meals": 480,
    "total_transportation": 200,
    "total": 2060
  }
}
"""


# ====================================================================
# TripPlanner
# ====================================================================

class MultiAgentTripPlanner:
    """旅行规划系统：查天气 → PlannerAgent 编排行程"""

    def __init__(self):
        print("🔄 初始化旅行规划系统...")
        self.llm = get_llm()
        self.amap_service = AmapService()
        self.weather_agent = SimpleAgent(name="天气分析专家", llm=self.llm, system_prompt=WEATHER_AGENT_PROMPT)
        self.planner_agent = SimpleAgent(name="旅行总规划师", llm=self.llm, system_prompt=PLANNER_AGENT_PROMPT)
        print("✅ 旅行规划系统初始化成功")

    def plan_trip(self, request: TripRequest, selected_attractions: list = None, selected_hotel: dict = None) -> TripPlan:
        """生成旅行计划：查天气 → PlannerAgent 编排"""
        try:
            print(f"\n{'=' * 60}")
            print(f"🚀 开始规划: {request.city} | {request.start_date}~{request.end_date} | {request.travel_days}天")
            print(f"{'=' * 60}\n")

            # 1. 查天气
            print("🌤️  查询天气...")
            weather_raw = self._fetch_weather_raw(request)
            weather_result = self._run_weather_agent(request, weather_raw)
            print(f"   → 已获取\n")

            # 2. 构建 prompt
            attrs = selected_attractions or []
            hotel = selected_hotel or {}
            print(f"📋 PlannerAgent: {len(attrs)} 个景点 + {hotel.get('name', '酒店')}")

            prompt = self._build_planner_prompt(request, attrs, hotel, weather_result)

            response = self.planner_agent.run(prompt)
            print(f"   [PlannerAgent 响应: {len(response)} 字符]")
            print(f"   [响应前500字]: {response[:500]}")

            data = self._extract_json(response)
            if data is None:
                print(f"   ❌ _extract_json 返回 None，原始响应后500字: {response[-500:]}")
            elif not isinstance(data, dict):
                print(f"   ❌ 解析结果不是 dict，类型: {type(data)}")
            elif "city" not in data:
                print(f"   ❌ JSON 缺少 city 字段，keys: {list(data.keys())[:10]}")
            else:
                try:
                    # 补缺失的必填字段默认值
                    for day in data.get("days", []):
                        for attr in day.get("attractions", []):
                            attr.setdefault("visit_duration", 120)
                            attr.setdefault("description", attr.get("address", ""))
                            if "location" not in attr:
                                attr["location"] = {"longitude": 0, "latitude": 0}
                    plan = TripPlan(**data)
                    plan.weather_info = self._align_weather_to_trip(request, plan.weather_info)
                    plan.budget = self._recalc_budget(plan, len(plan.days))
                    print(f"✅ 行程生成完成!\n")
                    return plan
                except Exception as e:
                    print(f"   ❌ TripPlan 构造失败: {e}")
                    import traceback
                    traceback.print_exc()

            print(f"   ⚠️ 使用兜底方案")
            return self._create_fallback_plan(request, weather_info=weather_raw)

        except Exception as e:
            print(f"❌ 规划失败: {str(e)}")
            return self._create_fallback_plan(request)

    # ================ 数据获取 ================

    def _fetch_weather_raw(self, request: TripRequest) -> List[WeatherInfo]:
        weather_info = self.amap_service.get_weather(request.city)
        if not weather_info:
            return self._build_empty_weather(request)
        return self._align_weather_to_trip(request, weather_info)

    def _run_weather_agent(self, request: TripRequest, weather_data: List[WeatherInfo]) -> dict:
        weather_list = [item.model_dump() for item in weather_data]
        prompt = f"""请分析{request.city}的{request.travel_days}天天气预报，并给出行建议。

旅行日期: {request.start_date} 至 {request.end_date}
天气预报:
{json.dumps(weather_list, ensure_ascii=False, indent=2)}
"""
        response = self.weather_agent.run(prompt)
        print(f"   [WeatherAgent 响应: {len(response)} 字符]")
        result = self._parse_json_safe(response, {"weather_analysis": weather_list})
        if not result.get("weather_analysis") and weather_list:
            result["weather_analysis"] = weather_list
        return result

    # ================ Planner prompt ================

    def _build_planner_prompt(self, request, attrs, hotel, weather_result):
        # Extract weather analysis data for the response
        weather_analysis = weather_result.get("weather_analysis", [])
        
        return f"""目的地: {request.city} | {request.start_date}~{request.end_date} | {request.travel_days}天
交通: {request.transportation}

## 用户选择的景点
```json
{json.dumps(attrs, ensure_ascii=False, indent=2)}
```

## 用户选择的酒店
```json
{json.dumps(hotel, ensure_ascii=False, indent=2)}
```

## 天气数据（必须包含在输出的 weather_info 字段中）
```json
{json.dumps(weather_analysis, ensure_ascii=False, indent=2)}
```

## 重要提示
你必须在输出的 JSON 中包含 "weather_info" 字段，值为上面的天气数据数组。这是必须的字段，不要省略。"""

    # ================ 预算 ================

    def _recalc_budget(self, plan: TripPlan, n_days: int) -> Budget:
        total_a = sum(a.ticket_price or 0 for day in plan.days for a in day.attractions)
        total_m = sum(m.estimated_cost or 0 for day in plan.days for m in day.meals)
        seen_hotels = set()
        total_h = 0
        for day in plan.days:
            if day.hotel and day.hotel.name not in seen_hotels:
                seen_hotels.add(day.hotel.name)
                total_h += (day.hotel.estimated_cost or 0) * n_days
        total_t = max(50, n_days * 30)
        return Budget(total_attractions=total_a, total_hotels=total_h, total_meals=total_m, total_transportation=total_t, total=total_a + total_h + total_m + total_t)

    # ================ 天气工具 ================

    def _build_empty_weather(self, request: TripRequest) -> List[WeatherInfo]:
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        return [WeatherInfo(date=(start_date + timedelta(days=i)).strftime("%Y-%m-%d"), day_weather="待查询", night_weather="待查询", day_temp=0, night_temp=0, wind_direction="", wind_power="") for i in range(request.travel_days)]

    def _align_weather_to_trip(self, request: TripRequest, weather_info: List[WeatherInfo]) -> List[WeatherInfo]:
        if not weather_info:
            return self._build_empty_weather(request)
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        aligned = []
        weather_by_date = {item.date: item for item in weather_info if item.date}
        sorted_weather = sorted(weather_info, key=lambda item: item.date or "")
        for i in range(request.travel_days):
            target_date = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
            matched = weather_by_date.get(target_date)
            if matched is not None:
                aligned.append(WeatherInfo(**{**matched.model_dump(), "date": target_date}))
            else:
                fallback = sorted_weather[min(i, len(sorted_weather) - 1)]
                aligned.append(WeatherInfo(**{**fallback.model_dump(), "date": target_date}))
        return aligned

    # ================ JSON 解析 ================

    def _parse_json_safe(self, response: str, default: dict) -> dict:
        try:
            if "```json" in response:
                s, e = response.find("```json") + 7, response.find("```", response.find("```json") + 7)
                return json.loads(response[s:e].strip())
            if "{" in response:
                s, e = response.find("{"), response.rfind("}") + 1
                return json.loads(response[s:e])
        except Exception as e:
            print(f"   ⚠️ JSON 解析失败: {str(e)[:80]}")
        return default

    @staticmethod
    def _extract_json(response: str) -> dict | None:
        try:
            if "```json" in response:
                s = response.find("```json") + 7
                e = response.find("```", s)
                return json.loads(response[s:e].strip())
            if "```" in response:
                s = response.find("```") + 3
                e = response.find("```", s)
                return json.loads(response[s:e].strip())
            if "{" in response:
                s = response.find("{")
                e = response.rfind("}") + 1
                return json.loads(response[s:e])
        except Exception:
            return None

    # ================ 兜底方案 ================

    def _create_fallback_plan(self, request: TripRequest, weather_info: Optional[List[WeatherInfo]] = None) -> TripPlan:
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        weather_info = weather_info or self._build_empty_weather(request)

        days: List[DayPlan] = []
        for i in range(request.travel_days):
            current_date = start_date + timedelta(days=i)
            w = weather_info[i] if i < len(weather_info) else None
            weather_note = ""
            if w and w.day_weather != "待查询":
                weather_note = f"天气{w.day_weather}、气温{w.day_temp}°C，"
                if "雨" in str(w.day_weather):
                    weather_note += "请备好雨具，"
                elif int(w.day_temp or 0) > 30:
                    weather_note += "注意防晒补水，"
                elif int(w.day_temp or 0) < 10:
                    weather_note += "注意保暖，"

            day_attrs = [
                Attraction(
                    name=f"{request.city}经典景点",
                    address=f"{request.city}市中心",
                    location=Location(longitude=0, latitude=0),
                    visit_duration=120,
                    description=f"{request.city}最具代表性的景点之一。",
                    category=request.preferences[0] if request.preferences else "景点",
                    ticket_price=0,
                )
            ]

            days.append(DayPlan(
                date=current_date.strftime("%Y-%m-%d"),
                day_index=i,
                description=f"第{i + 1}天{'精彩开局' if i == 0 else '深度探索' if i < request.travel_days - 1 else '完美收官'}。{weather_note}全天以{request.transportation}为主，张弛有度。",
                transportation=request.transportation,
                accommodation=request.accommodation,
                hotel=None,
                attractions=day_attrs,
                meals=[
                    Meal(type="breakfast", name="当地早点", description=f"{request.city}特色早点", estimated_cost=25),
                    Meal(type="lunch", name=f"{request.city}特色餐厅", description="地道午餐", estimated_cost=55),
                    Meal(type="dinner", name=f"{request.city}人气餐厅", description="丰盛晚餐", estimated_cost=85),
                ],
            ))

        budget = Budget(
            total_attractions=0,
            total_hotels=0,
            total_meals=sum(meal.estimated_cost for day in days for meal in day.meals),
            total_transportation=max(50, request.travel_days * 30),
            total=sum(meal.estimated_cost for day in days for meal in day.meals) + max(50, request.travel_days * 30),
        )

        return TripPlan(
            city=request.city,
            start_date=request.start_date,
            end_date=request.end_date,
            days=days,
            weather_info=weather_info[:request.travel_days],
            overall_suggestions=f"欢迎来到{request.city}！请根据天气预报准备合适衣物。携带身份证、充电宝、舒适步行鞋、常用药品。市内以{request.transportation}为主。祝旅途愉快！",
            budget=budget,
        )


# ====================================================================
# 单例
# ====================================================================

_planner = None

def get_trip_planner_agent() -> MultiAgentTripPlanner:
    global _planner
    if _planner is None:
        _planner = MultiAgentTripPlanner()
    return _planner
