"""评价路由 — 景点 / 酒店评分与查看"""
from fastapi import APIRouter, Depends, HTTPException
from ...database import (
    save_attraction_review, get_attraction_reviews, get_attraction_avg_rating,
    save_hotel_review, get_hotel_reviews, get_hotel_avg_rating,
)
from ...models.schemas import (
    AttractionReviewRequest, HotelReviewRequest, ReviewResponse, ReviewListResponse, ReviewItem,
)
from .auth import get_current_user

router = APIRouter(prefix="/review", tags=["评价"])


# ==================== 景点评价 ====================

@router.post("/attraction", response_model=ReviewResponse)
async def review_attraction(body: AttractionReviewRequest, username: str = Depends(get_current_user)):
    """提交或更新景点评价"""
    save_attraction_review(username, body.attraction_name, body.city, body.rating, body.comment)
    return ReviewResponse(success=True, message="评价已提交")


@router.get("/attraction/{city}/{attraction_name}", response_model=ReviewListResponse)
async def get_attraction_review_list(city: str, attraction_name: str):
    """获取景点的所有评价和平均分"""
    reviews = get_attraction_reviews(attraction_name, city)
    stats = get_attraction_avg_rating(attraction_name, city)
    return ReviewListResponse(
        success=True,
        attraction_name=attraction_name,
        city=city,
        avg_rating=stats["avg_rating"],
        count=stats["count"],
        reviews=[ReviewItem(**r) for r in reviews],
    )


# ==================== 酒店评价 ====================

@router.post("/hotel", response_model=ReviewResponse)
async def review_hotel(body: HotelReviewRequest, username: str = Depends(get_current_user)):
    """提交或更新酒店评价"""
    save_hotel_review(username, body.hotel_name, body.city, body.rating, body.comment)
    return ReviewResponse(success=True, message="评价已提交")


@router.get("/hotel/{city}/{hotel_name}", response_model=ReviewListResponse)
async def get_hotel_review_list(city: str, hotel_name: str):
    """获取酒店的所有评价和平均分"""
    reviews = get_hotel_reviews(hotel_name, city)
    stats = get_hotel_avg_rating(hotel_name, city)
    return ReviewListResponse(
        success=True,
        hotel_name=hotel_name,
        city=city,
        avg_rating=stats["avg_rating"],
        count=stats["count"],
        reviews=[ReviewItem(**r) for r in reviews],
    )
