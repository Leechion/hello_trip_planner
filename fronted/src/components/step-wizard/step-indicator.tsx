"use client"

import { Check, MapPin, Train, Sparkles, Building2, CalendarCheck } from "lucide-react"
import { useTripStore, type StepNumber } from "@/lib/store/trip-store"

const STEPS = [
  { step: 1 as StepNumber, label: "行程信息", icon: MapPin, desc: "目的地与偏好" },
  { step: 2 as StepNumber, label: "选择列车", icon: Train, desc: "交通方式" },
  { step: 3 as StepNumber, label: "选择景点", icon: Sparkles, desc: "想去的地方" },
  { step: 4 as StepNumber, label: "选择酒店", icon: Building2, desc: "住宿安排" },
  { step: 5 as StepNumber, label: "行程结果", icon: CalendarCheck, desc: "完整计划" },
]

export function StepIndicator() {
  const { currentStep, goToStep, fromCity, toCity, departDate, selectedTransport, selectedPois, selectedHotel, travelDays } = useTripStore()

  return (
    <div className="w-full mb-6">
      <nav className="step-navigation" aria-label="旅行规划步骤">
        {STEPS.map((s) => {
          const isActive = currentStep === s.step
          const isDone = currentStep > s.step
          return (
            <button
              key={s.step}
              onClick={() => isDone && goToStep(s.step)}
              disabled={!isDone}
              aria-current={isActive ? "step" : undefined}
              className={`${isActive ? "active-step" : ""} ${isDone ? "hover:bg-muted cursor-pointer" : "cursor-default"}`}
            >
              <span className="step-number">{isDone ? <Check className="h-3.5 w-3.5" /> : `0${s.step}`}</span>
              <span><span className={`step-label ${isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span><span className="step-description block">{s.desc}</span></span>
            </button>
          )
        })}
      </nav>

      {/* Mini summary bar for steps 2-4 */}
      {currentStep >= 2 && currentStep <= 4 && (
        <div className="flex items-center gap-2 px-1 mt-4 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 rounded-full px-2.5 py-0.5">
            <MapPin className="h-3 w-3" />
            {fromCity} → {toCity}
          </span>
          <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5">
            {departDate} · {travelDays}天
          </span>
          {selectedTransport && (
            <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5">
              {selectedTransport.selected_item?.number}
            </span>
          )}
          {selectedPois.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5">
              {selectedPois.length}个景点
            </span>
          )}
          {selectedHotel && (
            <span className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5">
              {selectedHotel.name}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
