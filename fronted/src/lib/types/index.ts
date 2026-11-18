// ========== 基础数据模型 ==========

export interface Location {
  longitude: number
  latitude: number
}

export interface Attraction {
  name: string
  address: string
  location: Location
  visit_duration: number
  description: string
  category?: string
  rating?: number
  image_url?: string
  ticket_price?: number
}

export interface Meal {
  type: "breakfast" | "lunch" | "dinner" | "snack"
  name: string
  address?: string
  location?: Location
  description?: string
  estimated_cost?: number
}

export interface Hotel {
  name: string
  address: string
  location?: Location
  price_range: string
  rating: string
  distance: string
  type: string
  estimated_cost?: number
}

export interface Budget {
  total_attractions: number
  total_hotels: number
  total_meals: number
  total_transportation: number
  total: number
}

export interface DayPlan {
  date: string
  day_index: number
  description: string
  transportation: string
  accommodation: string
  hotel?: Hotel
  attractions: Attraction[]
  meals: Meal[]
}

export interface WeatherInfo {
  date: string
  day_weather: string
  night_weather: string
  day_temp: number
  night_temp: number
  wind_direction: string
  wind_power: string
}

export interface TripPlan {
  city: string
  start_date: string
  end_date: string
  days: DayPlan[]
  weather_info?: WeatherInfo[]
  overall_suggestions: string
  budget?: Budget
}

// ========== AG-UI Stage Types ==========

export type StageNumber = 1 | 2 | 3 | 4

export type BudgetLevel = "budget" | "comfort" | "luxury"

export interface TripIntent {
  departure_city: string
  destination_city: string
  start_date: string
  end_date: string
  travel_days: number
  budget_level: BudgetLevel
  preferences: string[]
  free_text_notes?: string
}

export interface SeatInfo {
  name: string
  price: number
  status: string
}

export interface TransportOption {
  id: string
  type: "train" | "flight"
  number: string
  departure_time: string
  arrival_time: string
  departure_station: string
  arrival_station: string
  duration: string
  price: number
  seat_class?: string
  seats: SeatInfo[]
}

export interface TransportSelection {
  mode: string
  selected_item: TransportOption | null
}

export interface PoiOption {
  id: string
  name: string
  category: string
  address: string
  location?: Location
}

// ========== API Response Types ==========

export interface TripPlanResponse {
  success: boolean
  message: string
  data?: TripPlan
  alternatives?: TripPlan[]
}

export interface AuthResponse {
  success: boolean
  message: string
  token?: string
  username?: string
  nickname?: string
  avatar_url?: string
}

export interface UserProfileResponse {
  success: boolean
  username?: string
  nickname?: string
  phone?: string
  phone_verified?: boolean
  avatar_url?: string
}

// ========== Trip History ==========

export interface TripHistoryItem {
  id: number
  city: string
  start_date: string
  end_date: string
  travel_days: number
  trip_data: TripPlan
  created_at: string
}

export interface TripHistoryListResponse {
  success: boolean
  total: number
  items: TripHistoryItem[]
}

// ========== Chat Conversations ==========

export interface ConversationItem {
  id: number
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

// ========== Reviews ==========

export interface ReviewItem {
  username: string
  rating: number
  comment: string
  created_at: string
}

export interface ReviewListResponse {
  success: boolean
  attraction_name?: string
  hotel_name?: string
  city: string
  avg_rating: number
  count: number
  reviews: ReviewItem[]
}
