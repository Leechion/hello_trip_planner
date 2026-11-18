"""MCP 代理端点 — 供 Vite 前端调用"""

from fastapi import APIRouter, Depends
from ...database import (
    create_conversation,
    save_user_message,
    get_messages,
    get_user_conversations,
    delete_conversation,
    get_conversation_by_id,
)
from .auth import get_current_user
from ...models.schemas import ChatRequest

router = APIRouter(tags=["mcp-proxy"])

CHAT_SYSTEM_PROMPT = """你是 TripBuddy，一个专业的 AI 旅行规划助手。你热情、简练，帮助用户规划旅行。

## 组件能力

当用户表达了旅行意图（比如提到想去某个城市、想规划旅行），你可以在回复中嵌入交互式组件来引导用户操作。

### 可用组件

1. **trip-start** — 旅行规划启动卡片。当用户提到想去某个城市时，在回复中嵌入此组件。

使用方式：在回复文本中插入 ```component 代码块，内容为 JSON：

```component
{"type":"trip-start","props":{"city":"城市名","message":"一句引导语"}}
```

### 使用规则

- 只在用户明确表达了旅行意图时才嵌入组件，不要每次对话都嵌入
- 组件前后仍然需要有文字回复，让对话自然流畅
- 每条回复最多嵌入一个组件
- 城市名使用中文（如"武汉"、"上海"）

### 示例对话

用户：我想去武汉玩
助手：武汉是个很棒的城市！美食和历史文化都非常丰富。让我帮你规划一下行程吧，先填写一下出发信息：

```component
{"type":"trip-start","props":{"city":"武汉","message":"填写出发信息，开始规划你的武汉之旅"}}
```

填完后点击"开始规划"，我会帮你搜索列车、推荐景点、查找酒店，生成完整的旅行计划。"""


@router.post("/mcp/transportation")
def search_transportation(data: dict, username: str = Depends(get_current_user)):
    """搜索火车票：包装 TrainService → 12306 MCP"""
    from ...services.train_service import TrainService

    from_city = data.get("from_city", "")
    to_city = data.get("to_city", "")
    date = data.get("date", "")
    mode = data.get("mode", "train")

    service = TrainService()
    if not service.available:
        return {"success": False, "message": "12306 MCP 服务不可用", "data": []}

    filter_flag = "G" if mode == "train" else ""
    result = service.search_tickets(
        from_city=from_city, to_city=to_city, date=date,
        train_filter=filter_flag, limit=10,
    )
    # 失败必须如实上报，避免前端把 mock 假车次当成真实数据
    if not result.get("ok"):
        reason_msg = {
            "unavailable": "12306 MCP 服务不可用",
            "station_not_found": f"未找到车站编码：{from_city} / {to_city}",
            "query_failed": "12306 余票查询失败",
        }.get(result.get("reason"), "12306 查询失败")
        return {"success": False, "message": reason_msg, "data": []}
    return {"success": True, "data": result["data"]}


@router.post("/mcp/recommend-attractions")
def recommend_attractions(data: dict, username: str = Depends(get_current_user)):
    """景点推荐：AmapService 搜原始 POI → AttractionAgent LLM 智能筛选"""
    from ...services.amap_service import AmapService
    from ...services.llm_service import get_llm
    from hello_agents import SimpleAgent
    import json

    city = data.get("city", "")
    preferences = data.get("preferences", [])
    travel_days = data.get("travel_days", 3)

    # Step 1: 从高德获取原始 POI 数据
    amap = AmapService()
    raw_pois = []
    seen = set()
    keywords = preferences[:3] if preferences else ["热门景点", "著名景点"]

    for keyword in keywords:
        for poi in amap.search_poi(keyword, city):
            if poi.name not in seen:
                seen.add(poi.name)
                raw_pois.append({
                    "name": poi.name,
                    "address": poi.address or "",
                    "category": poi.type or keyword,
                    "location": poi.location.model_dump() if poi.location else None,
                })
            if len(raw_pois) >= 20:
                break
        if len(raw_pois) >= 20:
            break

    if not raw_pois:
        return {"success": False, "message": "未获取到目的地景点，请稍后重试", "data": []}

    # Step 2: AttractionAgent 智能筛选
    prompt = f"""你是景点推荐专家。根据用户偏好，从候选景点中筛选最合适的 {min(6, travel_days * 2)} 个景点。

目的地: {city}
旅行天数: {travel_days}天
用户偏好: {', '.join(preferences) if preferences else '综合体验'}

候选景点（{len(raw_pois)}个，高德地图真实数据）:
{json.dumps(raw_pois, ensure_ascii=False, indent=2)}

要求:
1. 优先选择匹配用户偏好的景点（如偏好"历史文化"则多选博物馆、古迹）
2. 每天安排 2-3 个景点，{travel_days}天共选 {min(6, travel_days * 2)} 个左右
3. 景点地理分布合理（不要全在同一个角落）
4. 返回纯 JSON 数组，不要 Markdown：
[
  {{"name": "景点名（高德原名）", "reason": "15字推荐理由", "category": "类别"}}
]"""

    try:
        llm = get_llm()
        agent = SimpleAgent(name="景点推荐专家", llm=llm, system_prompt="你是景点推荐专家，用户偏好是你筛选的唯一标准。只返回纯JSON数组。")
        response = agent.run(prompt)

        # Parse JSON from response
        json_str = response
        if "```" in response:
            start = response.find("[")
            end = response.rfind("]") + 1
            json_str = response[start:end]
        parsed = json.loads(json_str)
        recommended_names = [item["name"] for item in parsed if isinstance(item, dict) and "name" in item]

        # Filter raw POIs to only include recommended ones
        result = []
        for name in recommended_names:
            for poi in raw_pois:
                if poi["name"] == name:
                    reason = next((item.get("reason", "") for item in parsed if item.get("name") == name), "")
                    result.append({**poi, "reason": reason})
                    break

        if not result:
            # Fallback: return top raw POIs
            result = raw_pois[:min(8, travel_days * 3)]

        print(f"✅ AttractionAgent 从 {len(raw_pois)} 个POI中推荐了 {len(result)} 个景点")
        return {"success": True, "data": result}

    except Exception as e:
        print(f"⚠️ AttractionAgent 失败: {e}，使用高德候选景点")
        return {"success": True, "data": raw_pois[:min(8, travel_days * 3)], "source": "amap"}


@router.post("/mcp/recommend-hotels")
def recommend_hotels(data: dict, username: str = Depends(get_current_user)):
    """酒店推荐：AigoHotel MCP 按景点+价位搜索附近酒店"""
    from ...services.rollinggo_service import RollingGoService

    city = data.get("city", "")
    attractions = data.get("attractions", [])  # 用户选中的景点名列表
    budget = data.get("budget", "500")  # 价位上限（元/晚）

    # 预算是用户可控输入，非数字不应导致 500
    try:
        budget_limit = int(budget)
    except (TypeError, ValueError):
        return {"success": False, "message": f"预算格式不正确：{budget!r}，应为整数金额", "data": []}
    if budget_limit <= 0:
        return {"success": False, "message": "预算必须大于 0", "data": []}

    service = RollingGoService()
    if not service.available:
        # MCP 不可用时如实上报，由前端决定如何提示（不冒充真实结果）
        return {"success": False, "message": "酒店服务暂时不可用，请稍后重试", "data": []}

    all_hotels = []
    seen_names = set()

    # 每个景点搜附近酒店（MCP 连接复用，开销很小）
    for attr_name in attractions[:3]:
        hotels = service.search_hotels(
            city=city,
            keyword="",
            limit=5,
            place=attr_name,
            star_rating=budget,
        )
        for h in hotels:
            if h.name in seen_names:
                continue
            seen_names.add(h.name)
            if h.estimated_cost and h.estimated_cost <= budget_limit:
                all_hotels.append({
                    "name": h.name,
                    "address": h.address or "",
                    "price_range": h.price_range or f"¥{h.estimated_cost}",
                    "rating": h.rating or "4.0",
                    "distance": h.distance or f"距{attr_name}附近",
                    "type": h.type or "酒店",
                    "estimated_cost": h.estimated_cost or 0,
                })

    all_hotels.sort(key=lambda h: h["estimated_cost"])
    result = all_hotels[:8]

    print(f"✅ 酒店推荐: {len(result)}家 (预算≤¥{budget}, 搜了{len(attractions[:3])}个景点附近)")
    return {"success": True, "data": result}


@router.post("/mcp/weather")
def get_weather(data: dict, username: str = Depends(get_current_user)):
    """查询天气"""
    from ...services.amap_service import AmapService

    city = data.get("city", "")
    amap = AmapService()
    weather = amap.get_weather(city)
    return {"success": True, "data": [w.model_dump() for w in weather]}


@router.post("/mcp/chat")
def chat_with_llm(request: ChatRequest, username: str = Depends(get_current_user)):
    """带对话历史的聊天：自动管理 conversation + messages

    request 经 Pydantic 校验:role 仅允许 user/assistant(客户端不能注入 system),
    且限制消息条数与单条长度。LLM 调用为同步阻塞,故本端点为 def(交由线程池)。
    """
    from ...services.llm_service import get_llm

    messages = [m.model_dump() for m in request.messages]

    # 获取或创建 conversation
    conversation_id = request.conversation_id
    if conversation_id:
        conv = get_conversation_by_id(conversation_id)
        if not conv or conv.get("username") != username:
            return {"success": False, "message": "对话不存在"}
    else:
        # 从 user message 中提取标题
        first_user_msg = next((m for m in messages if m["role"] == "user"), None)
        title = first_user_msg["content"][:30] if first_user_msg else None
        conversation_id = create_conversation(username, title)

    # 请求携带历史上下文，只有最后一条是本轮新增消息。
    save_user_message(conversation_id, "user", messages[-1]["content"], username)

    # 调 LLM
    try:
        llm = get_llm()
        response = llm.invoke([{"role": "system", "content": CHAT_SYSTEM_PROMPT}, *messages])
    except Exception as e:
        # 详细错误只进服务端日志：异常文本可能包含上游响应体/base_url
        print(f"❌ LLM 调用失败: {type(e).__name__}: {e}")
        return {"success": False, "message": "AI 服务暂时不可用，请稍后重试", "data": "抱歉，AI 暂时不可用。"}

    # 保存助手回复
    try:
        save_user_message(conversation_id, "assistant", response, username)
    except ValueError:
        pass

    return {"success": True, "data": response, "conversation_id": conversation_id}


@router.get("/mcp/conversations")
async def list_conversations(username: str = Depends(get_current_user)):
    """获取用户的对话列表"""
    conversations = get_user_conversations(username)
    return {"success": True, "conversations": conversations}


@router.get("/mcp/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: int, username: str = Depends(get_current_user)):
    """获取对话消息历史"""
    conv = get_conversation_by_id(conversation_id)
    if not conv or conv.get("username") != username:
        return {"success": False, "message": "对话不存在"}
    
    messages = get_messages(conversation_id)
    return {"success": True, "messages": messages}


@router.delete("/mcp/conversations/{conversation_id}")
async def remove_conversation(conversation_id: int, username: str = Depends(get_current_user)):
    """删除对话"""
    conv = get_conversation_by_id(conversation_id)
    if not conv or conv.get("username") != username:
        return {"success": False, "message": "对话不存在"}
    
    ok = delete_conversation(conversation_id, username)
    return {"success": ok, "message": "已删除" if ok else "删除失败"}


@router.post("/mcp/trip/plan")
def plan_trip_proxy(data: dict, username: str = Depends(get_current_user)):
    """总规划 Agent：查天气 → PlannerAgent 编排行程"""
    from ...models.schemas import TripRequest
    from ...agents.trip_planner_agent import get_trip_planner_agent

    try:
        request = TripRequest(
            city=data.get("city", ""),
            start_date=data.get("start_date", ""),
            end_date=data.get("end_date", ""),
            travel_days=data.get("travel_days", 3),
            transportation=data.get("transportation", "公共交通"),
            accommodation=data.get("accommodation", "500"),
            preferences=data.get("preferences", []),
            free_text_input=data.get("free_text_input", ""),
        )

        selected_attractions = data.get("selected_attractions")
        selected_hotel = data.get("selected_hotel")

        agent = get_trip_planner_agent()
        plan = agent.plan_trip(request, selected_attractions, selected_hotel)

        return {
            "success": True,
            "message": "旅行计划生成成功",
            "data": plan.model_dump(),
        }
    except Exception as e:
        # 详细错误只进服务端日志，不返回给客户端
        print(f"❌ 行程生成失败: {type(e).__name__}: {e}")
        return {"success": False, "message": "行程生成失败，请稍后重试", "data": None}
