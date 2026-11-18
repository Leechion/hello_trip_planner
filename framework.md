# TripBuddy — 项目技术文档

## 全景架构

```
helloagents-trip-planner/
├── CLAUDE.md                                 # 编码规范
├── framework.md                              # 本文档
├── backend/                                  # Python FastAPI（MCP + LLM 引擎）
│   ├── .env                                  # LLM / Amap / JWT 密钥
│   ├── run.py                                # 启动入口：python run.py
│   └── app/
│       ├── config.py                         # Settings（pydantic-settings）
│       ├── database.py                       # SQLite（users / trip_history / shared_trips / reviews）
│       ├── agents/
│       │   └── trip_planner_agent.py         # 旅行规划系统（~260 行）
│       │                                       WeatherAgent + PlannerAgent
│       ├── api/
│       │   ├── main.py                       # FastAPI 应用 + 注册 8 个路由
│       │   └── routes/
│       │       ├── mcp_proxy.py              # /api/mcp/* 智能代理端点（主接口）
│       │       ├── auth.py                   # /api/auth/* 认证 + 头像 + 密码
│       │       ├── trip.py                   # /api/trip/*
│       │       ├── poi.py                    # /api/poi/* Unsplash 图片
│       │       ├── map.py                    # /api/map/* 地图查询
│       │       ├── history.py                # /api/history/*
│       │       ├── review.py                 # /api/review/*
│       │       └── share.py                  # /api/share/*
│       ├── services/
│       │   ├── llm_service.py                # SimpleLLM（httpx 直调 DashScope）
│       │   ├── amap_service.py               # 高德 MCP（uvx STDIO，16 tools）
│       │   ├── rollinggo_service.py          # AigoHotel MCP（STDIO，3 tools）
│       │   ├── train_service.py              # 12306 MCP（STDIO，8 tools）
│       │   └── unsplash_service.py           # Unsplash 图片搜索
│       └── models/
│           └── schemas.py                    # Pydantic 数据模型
├── vite-react/                               # Vite + React 19 前端
│   ├── .env                                  # VITE_PYTHON_BACKEND_URL
│   ├── package.json                          # 轻量依赖（无 AI SDK，无 Next.js）
│   ├── vite.config.ts                        # Tailwind + @ alias + /api → 8000 proxy
│   ├── index.html
│   └── src/
│       ├── main.tsx                          # 入口：BrowserRouter + 路由表
│       ├── layout.tsx                        # Header + <Outlet/>
│       ├── index.css                         # Tailwind v4 + 品牌 tokens
│       ├── pages/
│       │   ├── home.tsx                      # 首页：5 步行程向导
│       │   ├── login.tsx                     # 登录/注册
│       │   ├── history.tsx                   # 历史列表
│       │   ├── history-detail.tsx            # 历史详情
│       │   └── share.tsx                     # 公开分享
│       ├── components/
│       │   ├── providers.tsx                 # TooltipProvider + auth sync
│       │   ├── layout/
│       │   │   ├── header.tsx                # 导航栏 + 用户菜单 + 助手 + 个人中心
│       │   │   └── profile-dialog.tsx        # 个人中心弹窗（头像/资料/密码）
│       │   ├── chat/
│       │   │   └── chat-panel.tsx            # 右侧助手聊天面板（fetch → Python LLM）
│       │   ├── step-wizard/                  # 5 步向导
│       │   │   ├── step-indicator.tsx        # 步骤进度条
│       │   │   ├── step1-intent-form.tsx     # S1：出发地/目的地/日期/偏好
│       │   │   ├── step2-transport.tsx       # S2：12306 列车（真实数据解析）
│       │   │   ├── step3-pois.tsx            # S3：AttractionAgent 推荐景点
│       │   │   └── step4-hotels.tsx          # S4：AigoHotel 搜酒店 + 生成行程
│       │   ├── generative-ui/
│       │   │   └── timeline.tsx              # S5：完整行程时间轴
│       │   ├── trip/                         # 展示子组件
│       │   │   ├── attraction-card.tsx       # 景点卡片（Unsplash 图片）
│       │   │   ├── hotel-card.tsx            # 酒店卡片
│       │   │   ├── meal-entry.tsx            # 餐饮条目
│       │   │   ├── weather-header.tsx        # 天气头
│       │   │   ├── budget-breakdown.tsx      # 预算明细
│       │   │   ├── map-preview.tsx           # 高德地图（标记 + 路线）
│       │   │   └── trip-actions.tsx          # 保存/分享/导出
│       │   └── ui/                           # shadcn/ui（13 个基础组件）
│       ├── lib/
│       │   ├── store/
│       │   │   ├── auth-store.ts             # Zustand：认证状态（persist）
│       │   │   └── trip-store.ts             # Zustand：5 步行程状态（persist）
│       │   ├── api/
│       │   │   └── python-backend.ts         # Python 后端 fetch 封装 + 工具函数
│       │   ├── types/index.ts                # TS 类型（对应 Pydantic schemas）
│       │   └── utils/
│       │       ├── cn.ts                     # clsx + tailwind-merge
│       │       └── formatters.ts             # 日期/货币/时长
└── 12306-mcp/                                # 12306 MCP Server（npm link 全局安装）
```

---

## 双服务启动

```bash
# 终端 1：Python 后端（8000）
cd backend && python run.py

# 终端 2：Vite 前端（3000）
cd vite-react && npm run dev
```

Vite 代理：`/api/*` → `localhost:8000`

---

## 5 步行程规划流程

```
用户 → S1 填表单 → S2 选列车 → S3 选景点 → S4 选酒店 → S5 查看行程
         │              │             │             │
     setStep1()    selectTransport()  goToStep(4)   selectHotel()
         │              │             │             │
    /mcp/          /mcp/          /mcp/          /mcp/
  transportation  recommend-      recommend-     trip/plan
  (12306 MCP)    attractions      hotels         (PlannerAgent)
                 (Amap +          (AigoHotel
                  AttractionAgent)  MCP)
```

### Step 1 — 行程信息
- **组件**: `step1-intent-form.tsx`
- **存入**: `trip-store.setStep1()` → fromCity/toCity/departDate/travelDays/budgetLevel/preferences

### Step 2 — 列车选择
- **组件**: `step2-transport.tsx`
- **API**: `GET /api/mcp/transportation` → `TrainService.search_tickets()` → 12306 MCP
- **解析**: `parse12306Text()` 解析 12306 文本 → 车次/站点/时间/所有座位
- **存入**: `selectTransport()` → selectedTransport

### Step 3 — 景点推荐
- **组件**: `step3-pois.tsx`
- **API**: `POST /api/mcp/recommend-attractions` → AmapService POI + AttractionAgent LLM 筛选
- **存入**: `setPoiOptions()` / `addPoi()` / `removePoi()` / `addCustomPoi()`

### Step 4 — 酒店选择
- **组件**: `step4-hotels.tsx`
- **API**: `POST /api/mcp/recommend-hotels` → AigoHotel MCP（按景点+价位搜）
- **存入**: `selectHotel()` → `POST /api/mcp/trip/plan`（带 selected_attractions + selected_hotel）

### Step 5 — 行程结果
- **后端**: `plan_trip()` → 查天气 → WeatherAgent → PlannerAgent 编排 → TripPlan
- **前端**: `Timeline` 组件（地图 + 天 Tab + 景点卡片/酒店/餐饮 + 预算 + 操作栏）

---

## 智能 Agent（2 个）

| Agent | 位置 | 职责 |
|-------|------|------|
| WeatherAgent | `trip_planner_agent.py` | 天气分析 → 穿衣建议 |
| PlannerAgent | `trip_planner_agent.py` | 编排行程：分配景点到每天、推荐三餐、预算 |

AttractionAgent 在 `mcp_proxy.py` 中独立创建，用于 Step3 的景点筛选推荐。

---

## MCP 代理端点（`mcp_proxy.py`）

| 端点 | 调用链 | 用途 |
|------|--------|------|
| `POST /api/mcp/transportation` | TrainService → 12306 MCP | S2 列车搜索 |
| `POST /api/mcp/recommend-attractions` | AmapService + AttractionAgent LLM | S3 智能景点推荐 |
| `POST /api/mcp/recommend-hotels` | RollingGoService → AigoHotel MCP | S4 酒店搜索 |
| `POST /api/mcp/weather` | AmapService | 天气查询 |
| `POST /api/mcp/trip/plan` | WeatherAgent + PlannerAgent | S5 总规划 |
| `POST /api/mcp/chat` | SimpleLLM | 聊天助手 |

所有端点含 mock 兜底（北京/上海/杭州/武汉/成都 5 市）。

---

## 数据模型（`schemas.py`）

| 模型 | 核心字段 |
|------|---------|
| TripRequest | city, start_date, end_date, travel_days, transportation, accommodation, preferences, free_text_input |
| TripPlan | city, start/end_date, days[], weather_info[], overall_suggestions, budget |
| DayPlan | date, day_index, description, transportation, hotel, attractions[], meals[] |
| Attraction | name, address, location, visit_duration, description, category, ticket_price |
| Hotel | name, address, location, price_range, rating, distance, type, estimated_cost |
| Meal | type, name, description, estimated_cost |
| WeatherInfo | date, day/night_weather, day/night_temp, wind_direction, wind_power |
| Budget | total_attractions, total_hotels, total_meals, total_transportation, total |

---

## 数据库表（SQLite）

| 表 | 用途 |
|----|------|
| users | username, password_hash, nickname, phone, avatar_url |
| trip_history | username, city, start/end_date, travel_days, trip_data(JSON) |
| shared_trips | token, trip_data(JSON), created_by |
| attraction_reviews | username, attraction_name, city, rating, comment |
| hotel_reviews | username, hotel_name, city, rating, comment |

---

## 认证

- JWT（bcrypt + PyJWT），`sessionStorage` 持久化
- 端点：`/api/auth/login`, `register`, `profile`(GET/PUT), `avatar`(POST), `change-password`(POST)
- Header 显示头像/首字母，下拉菜单 → 个人中心（头像上传/编辑资料/修改密码）

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vite 8 + React 19 + TypeScript |
| UI | shadcn/ui v4 (@base-ui/react) + Tailwind CSS v4 |
| 图标 | lucide-react |
| 状态 | Zustand (persist) |
| 路由 | React Router v7 |
| 地图 | 高德 JS API 2.0 |
| 后端 | Python FastAPI |
| LLM | deepseek-v4-pro（DashScope 兼容模式，httpx 直调） |
| Agent | hello-agents (SimpleAgent + MCPTool) |
| MCP | 高德(16t) + AigoHotel(3t) + 12306(8t) |
| 数据库 | SQLite (WAL) |

---

## 对比旧架构（Vue 3）

| | 旧（Vue） | 新（Vite React） |
|---|---|---|
| 打包 | Vite 6 | Vite 8 |
| 组件 | Ant Design Vue | shadcn/ui |
| 状态 | sessionStorage 手写 | Zustand persist |
| 路由守卫 | router.beforeEach | authStore.isLoggedIn |
| 聊天 | 无 | ChatPanel（SimpleLLM） |
| 地图 | Result.vue 专有 | MapPreview 组件 |
| CPU | 正常 | 正常（相比 Next.js 极低） |
