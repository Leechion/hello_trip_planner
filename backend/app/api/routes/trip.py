"""旅行规划API路由"""

from fastapi import APIRouter, Depends, HTTPException
from ...models.schemas import TripRequest, TripPlanResponse
from ...agents.trip_planner_agent import get_trip_planner_agent
from ...database import save_trip_history
from .auth import get_current_user

router = APIRouter(prefix="/trip", tags=["旅行规划"])


@router.post("/plan", response_model=TripPlanResponse)
async def plan_trip(request: TripRequest, username: str = Depends(get_current_user)):
    """生成 3 套旅行计划（不自动保存，等用户选择后保存）"""
    try:
        agent = get_trip_planner_agent()
        trip_plan = agent.plan_trip(request)
        alternatives = agent._last_alternatives if hasattr(agent, '_last_alternatives') else []

        return TripPlanResponse(
            success=True,
            message="旅行计划生成成功",
            data=trip_plan,
            alternatives=alternatives
        )
    except Exception as e:
        print(f"❌ 生成旅行计划失败: {str(e)}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail="生成旅行计划失败")


@router.post("/select")
async def select_plan(data: dict, username: str = Depends(get_current_user)):
    """用户选定一套方案后保存到历史"""
    trip_data = data.get("trip_data")
    if not trip_data:
        raise HTTPException(status_code=400, detail="缺少行程数据")
    hid = save_trip_history(username, trip_data)
    return {"success": True, "message": "已保存到历史记录", "id": hid}


@router.get("/health")
async def health_check():
    agent = get_trip_planner_agent()
    return {"status": "healthy", "service": "trip-planner", "agent_name": agent.planner_agent.name, "tools_count": agent.amap_service._get_available_tools_count()}
