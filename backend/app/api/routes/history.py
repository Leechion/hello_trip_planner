"""旅行历史路由 — 保存 / 查看 / 更新 / 删除历史行程"""
from fastapi import APIRouter, Depends, HTTPException
from ...database import save_trip_history, update_trip_history, get_trip_history, get_trip_history_by_id, delete_trip_history
from ...models.schemas import TripHistoryItem, TripHistoryListResponse
from .auth import get_current_user

router = APIRouter(prefix="/history", tags=["旅行历史"])


@router.get("", response_model=TripHistoryListResponse)
async def list_history(username: str = Depends(get_current_user)):
    """获取当前用户的所有历史行程"""
    items = get_trip_history(username)
    return TripHistoryListResponse(
        success=True,
        total=len(items),
        items=[TripHistoryItem(**item) for item in items],
    )


@router.get("/{trip_id}")
async def get_history(trip_id: int, username: str = Depends(get_current_user)):
    """获取单条历史行程详情"""
    item = get_trip_history_by_id(trip_id, username)
    if item is None:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return {"success": True, "data": item}


@router.put("/{trip_id}")
async def update_history(trip_id: int, data: dict, username: str = Depends(get_current_user)):
    """编辑后覆盖更新单条历史行程"""
    trip_data = data.get("trip_data")
    if not trip_data:
        raise HTTPException(status_code=400, detail="缺少行程数据")
    ok = update_trip_history(trip_id, username, trip_data)
    if not ok:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return {"success": True, "message": "已更新"}


@router.delete("/{trip_id}")
async def delete_history(trip_id: int, username: str = Depends(get_current_user)):
    """删除单条历史行程"""
    ok = delete_trip_history(trip_id, username)
    if not ok:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return {"success": True, "message": "已删除"}
