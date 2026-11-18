"""POI相关API路由"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from ...config import get_settings
from ...services.amap_service import get_amap_service
from ...services.unsplash_service import get_unsplash_service
from .auth import get_current_user

router = APIRouter(prefix="/poi", tags=["POI"])

# 景点图片缓存: (name, city) -> photo_url,避免重复渲染时反复消耗搜索配额
_photo_cache: dict[tuple[str, str], Optional[str]] = {}


async def _get_amap_poi_photo(name: str, city: str) -> Optional[str]:
    """
    从高德Place API获取POI真实照片

    extensions=all 时返回的 pois 带 photos 字段(高德图床,覆盖中国地区POI)
    """
    settings = get_settings()
    if not settings.amap_api_key:
        return None

    params = {
        "key": settings.amap_api_key,
        "keywords": name,
        "extensions": "all",
        "offset": 3,
    }
    if city:
        params["city"] = city
        params["citylimit"] = "true"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get("https://restapi.amap.com/v3/place/text", params=params)
            response.raise_for_status()

        pois = response.json().get("pois") or []
        for poi in pois:
            for photo in poi.get("photos") or []:
                url = photo.get("url")
                if url:
                    # 高德部分图片链接是http,升级为https避免混合内容被浏览器拦截
                    return url.replace("http://", "https://", 1)
    except Exception as e:
        print(f"⚠️ 高德POI照片获取失败: {e}")

    return None


class POIDetailResponse(BaseModel):
    """POI详情响应"""
    success: bool
    message: str
    data: Optional[dict] = None


@router.get(
    "/detail/{poi_id}",
    response_model=POIDetailResponse,
    summary="获取POI详情",
    description="根据POI ID获取详细信息,包括图片"
)
def get_poi_detail(poi_id: str, username: str = Depends(get_current_user)):
    """
    获取POI详情
    
    Args:
        poi_id: POI ID
        
    Returns:
        POI详情响应
    """
    try:
        amap_service = get_amap_service()
        
        # 调用高德地图POI详情API
        result = amap_service.get_poi_detail(poi_id)
        
        return POIDetailResponse(
            success=True,
            message="获取POI详情成功",
            data=result
        )
        
    except Exception as e:
        print(f"❌ 获取POI详情失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="获取POI详情失败"
        )


@router.get(
    "/search",
    summary="搜索POI",
    description="根据关键词搜索POI"
)
def search_poi(keywords: str, city: str = "北京", username: str = Depends(get_current_user)):
    """
    搜索POI

    Args:
        keywords: 搜索关键词
        city: 城市名称

    Returns:
        搜索结果
    """
    try:
        amap_service = get_amap_service()
        result = amap_service.search_poi(keywords, city)

        return {
            "success": True,
            "message": "搜索成功",
            "data": result
        }

    except Exception as e:
        print(f"❌ 搜索POI失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="搜索POI失败"
        )


@router.get(
    "/photo",
    summary="获取景点图片",
    description="优先从高德获取中国景点真实照片,无结果时回退Unsplash"
)
async def get_attraction_photo(name: str, city: str = "", username: str = Depends(get_current_user)):
    """
    获取景点图片

    Args:
        name: 景点名称
        city: 目的地城市(可选,提高高德检索准确度)

    Returns:
        图片URL
    """
    try:
        cache_key = (name, city)
        if cache_key in _photo_cache:
            photo_url = _photo_cache[cache_key]
        else:
            # 优先高德:中国景点有真实照片,且不同景点不会重图
            photo_url = await _get_amap_poi_photo(name, city)

            # 高德无照片时回退Unsplash
            if not photo_url:
                unsplash_service = get_unsplash_service()
                photo_url = await unsplash_service.get_photo_url(f"{name} China landmark")
                if not photo_url:
                    photo_url = await unsplash_service.get_photo_url(name)

            _photo_cache[cache_key] = photo_url

        return {
            "success": True,
            "message": "获取图片成功",
            "data": {
                "name": name,
                "photo_url": photo_url
            }
        }

    except Exception as e:
        print(f"❌ 获取景点图片失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="获取景点图片失败"
        )

