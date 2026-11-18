import { Link } from "react-router-dom"
import { Compass, Train, Building2, Calendar, ArrowRight, Route, Leaf, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/lib/store/auth-store"
import { useTripStore } from "@/lib/store/trip-store"
import { StepIndicator } from "@/components/step-wizard/step-indicator"
import { Step1IntentForm } from "@/components/step-wizard/step1-intent-form"
import { Step2Transport } from "@/components/step-wizard/step2-transport"
import { Step3Pois } from "@/components/step-wizard/step3-pois"
import { Step4Hotels } from "@/components/step-wizard/step4-hotels"
import { Timeline } from "@/components/generative-ui/timeline"
import journeyLandscape from "@/assets/journey-landscape.svg"

function TripSummarySidebar() {
  const { currentStep, fromCity, toCity, departDate, returnDate, travelDays, budgetLevel, preferences, selectedTransport, selectedPois, selectedHotel } = useTripStore()

  const budgetLabels: Record<string, string> = { budget: "经济型", comfort: "舒适型", luxury: "豪华型" }

  return (
    <Card className="travel-summary sticky top-24">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Compass className="h-4 w-4" />
          </div>
          <div><p className="editorial-label mb-1">Your itinerary</p><span className="font-semibold text-sm">我的旅行手记</span></div>
        </div>

        <Separator />

        {/* Route */}
        {(fromCity || toCity) && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">路线</span>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <span>{fromCity || "?"}</span>
              <ArrowRight className="h-3 w-3 text-brand-500" />
              <span>{toCity || "?"}</span>
            </div>
          </div>
        )}

        {/* Dates */}
        {departDate && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">日期</span>
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{departDate} — {returnDate}</span>
            </div>
            <p className="text-xs text-muted-foreground">{travelDays}天行程</p>
          </div>
        )}

        {/* Budget */}
        {budgetLevel && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">预算</span>
            <p className="text-sm">{budgetLabels[budgetLevel] || budgetLevel}</p>
          </div>
        )}

        {/* Preferences */}
        {preferences.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">偏好</span>
            <div className="flex flex-wrap gap-1">
              {preferences.map((p) => (
                <span key={p} className="text-xs bg-white border rounded-full px-2 py-0.5">{p}</span>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Transport */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">交通</span>
          {selectedTransport ? (
            <div className="flex items-center gap-1.5 text-sm">
              <Train className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-medium">{selectedTransport.selected_item?.number}</span>
              <span className="text-xs text-muted-foreground">
                {selectedTransport.selected_item?.departure_time} → {selectedTransport.selected_item?.arrival_time}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {currentStep >= 2 ? "待选择" : "—"}
            </p>
          )}
        </div>

        {/* POIs */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            景点 ({selectedPois.length})
          </span>
          {selectedPois.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedPois.slice(0, 5).map((p) => (
                <span key={p} className="text-xs bg-white border rounded-full px-2 py-0.5">{p}</span>
              ))}
              {selectedPois.length > 5 && (
                <span className="text-xs text-muted-foreground">+{selectedPois.length - 5}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {currentStep >= 3 ? "待选择" : "—"}
            </p>
          )}
        </div>

        {/* Hotel */}
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">住宿</span>
          {selectedHotel ? (
            <div className="flex items-center gap-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5 text-brand-600" />
              <span>{selectedHotel.name}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {currentStep >= 4 ? "待选择" : "—"}
            </p>
          )}
        </div>

        {/* Progress indicator */}
        <Separator />
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">完成度</span>
            <span className="font-medium text-brand-600">{Math.round(((currentStep - 1) / 5) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-primary rounded-full transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 5) * 100}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const { currentStep, itinerary, toCity } = useTripStore()

  if (!isLoggedIn) {
    return (
      <div className="travel-workspace">
        <section className="workspace-hero py-8 sm:py-16">
          <div>
            <span className="editorial-label">A little planning. A world of possibility.</span>
            <h1>把向往的远方，<br />写成下一段旅程。</h1>
            <p>从一张车票到一条小巷，让 TripBuddy 和你一起，找到属于自己的旅行节奏。</p>
            <div className="flex gap-3 mt-7">
              <Link to="/login"><Button size="lg" className="h-12 px-6 rounded-full">开始我的旅行 <ArrowRight className="ml-2" /></Button></Link>
              <Link to="/login?tab=register"><Button variant="ghost" size="lg" className="h-12 px-4">创建账户</Button></Link>
            </div>
          </div>
          <div className="landscape-frame"><img src={journeyLandscape} alt="山峦、古塔与蜿蜒旅途的风景插画" /><div className="landscape-caption"><span>TAKE THE SCENIC ROUTE</span><span>TRIPBUDDY</span></div></div>
        </section>
        <div className="grid sm:grid-cols-3 gap-6 border-t pt-8">
          {[{ icon: Train, number: "01", title: "从出发开始", description: "查询列车，找到合适的出发时间。" }, { icon: Compass, number: "02", title: "遇见城市", description: "根据你的偏好，挑选值得停留的地方。" }, { icon: Building2, number: "03", title: "安心停靠", description: "选择住宿，把零散灵感串成完整行程。" }].map(({ icon: Icon, number, title, description }) => (
            <div key={number} className="p-4"><Icon className="h-5 w-5 text-primary mb-5" /><span className="editorial-label">{number}</span><h2 className="text-lg font-medium mt-2 mb-2">{title}</h2><p className="text-sm text-muted-foreground leading-7">{description}</p></div>
          ))}
        </div>
      </div>
    )
  }

  if (currentStep === 5 && itinerary) {
    return (
      <div className="travel-workspace">
        <div className="workspace-hero-compact"><div><span className="editorial-label">Ready for the journey</span><h1>一份行程，许多种可能。</h1></div></div>
        <StepIndicator />
        <Timeline data={{ data: itinerary }} />
      </div>
    )
  }

  return (
    <div className="travel-workspace">
      {currentStep === 1 ? (
        <section className="workspace-hero">
          <div><span className="editorial-label">Journey studio / 旅行规划室</span><h1>下一站，<br />去心动的地方。</h1><p>你决定出发的方向，我们帮你照顾沿途的细节。<br />从列车、景点到住宿，慢慢勾勒你的理想旅程。</p></div>
          <div className="landscape-frame"><img src={journeyLandscape} alt="山峦、古塔与蜿蜒旅途的风景插画" /><div className="landscape-caption"><span>LET CURIOSITY LEAD THE WAY</span><span>01 / DEPARTURE</span></div></div>
        </section>
      ) : (
        <section className="workspace-hero-compact"><div><span className="editorial-label">Journey studio / 旅行规划室</span><h1>{toCity || "远方"}，值得慢慢遇见。</h1></div><span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground"><Leaf className="h-4 w-4" /> 把每一站，安排成喜欢的样子</span></section>
      )}
      <StepIndicator />

      {/* Two-panel layout for steps 1-4 */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {currentStep === 1 && <Step1IntentForm />}
          {currentStep === 2 && <Step2Transport />}
          {currentStep === 3 && <Step3Pois />}
          {currentStep === 4 && <Step4Hotels />}
          {currentStep === 5 && !itinerary && <Step4Hotels />}
        </div>

        {currentStep === 1 && (
          <aside className="travel-note hidden lg:block">
            <span className="editorial-label">A note before you go</span>
            <h2>不必赶路，<br />去感受路。</h2>
            <p className="text-xs text-muted-foreground leading-7">好的旅行，从留一点期待开始。告诉我们你的喜好，让计划也带一点你的性格。</p>
            <div className="travel-note-line"><span className="travel-note-number">01</span><div><span className="text-sm font-medium">先选一座城市</span><p>是惦记已久的远方，还是临时起意的小城？</p></div></div>
            <div className="travel-note-line"><Route className="h-5 w-5 text-primary shrink-0" /><div><span className="text-sm font-medium">再决定旅行的节奏</span><p>预算与偏好，会成为安排沿途的线索。</p></div></div>
            <div className="flex items-center gap-2 mt-8 editorial-label"><Sparkles className="h-3 w-3" /> Made for your kind of journey</div>
          </aside>
        )}
        {/* Trip summary */}
        {currentStep >= 2 && currentStep <= 4 && (
          <div className="hidden lg:block min-w-0">
            <TripSummarySidebar />
          </div>
        )}
      </div>
    </div>
  )
}
