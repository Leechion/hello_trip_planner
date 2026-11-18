"use client"

import { useState, useEffect, useCallback } from "react"
import { Train, ArrowRight, MapPin, Loader2, Circle, Clock, Ticket, AlertCircle, RotateCw } from "lucide-react"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useTripStore } from "@/lib/store/trip-store"
import { formatCurrency } from "@/lib/utils/formatters"
import type { TransportOption, SeatInfo } from "@/lib/types"
import { pythonBackend } from "@/lib/api/python-backend"

function parse12306Text(text: string): TransportOption[] {
  const lines = text.split("\n")
  const results: TransportOption[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const headerMatch = line.match(/^(\w+)\s+(.+?)\s*->\s*(.+?)\s+(\d{2}:\d{2})\s*->\s*(\d{2}:\d{2})\s*历时[：:]\s*(\d{2}:\d{2})/)
    if (!headerMatch) continue

    const [, number, fromStationRaw, toStationRaw, departure_time, arrival_time, duration] = headerMatch
    const fromStation = fromStationRaw.replace(/\(telecode:\w+\)/, "").trim()
    const toStation = toStationRaw.replace(/\(telecode:\w+\)/, "").trim()

    const seats: SeatInfo[] = []
    for (let j = i + 1; j < lines.length && lines[j].trim().startsWith("-"); j++) {
      const seatMatch = lines[j].trim().match(/^-\s*(.+?)[：:]\s*(.+?)\s+(\d+(?:\.\d+)?)元/)
      if (seatMatch) {
        const [, name, status, priceStr] = seatMatch
        seats.push({ name: name.trim(), status: status.trim(), price: parseFloat(priceStr) })
      }
    }

    const available = seats.filter((s) => !s.status.includes("无票") && !s.status.includes("候补"))
    const mainSeat = available.find((s) => s.name.includes("二等座")) || available[0] || seats[0]
    const price = mainSeat?.price || 0

    results.push({
      id: `train-${number}-${departure_time}`,
      type: "train" as const,
      number,
      departure_time,
      arrival_time,
      departure_station: fromStation,
      arrival_station: toStation,
      duration,
      // 票价/席别只按实际解析到的值展示，不要用 500/二等座 之类的默认值冒充真实数据
      price,
      seat_class: mainSeat?.name,
      seats,
    })
  }

  return results.slice(0, 10)
}


function SeatBadge({ seat, selected, onSelect }: { seat: SeatInfo & { trainId: string }; selected: boolean; onSelect: () => void }) {
  const isAvailable = !seat.status.includes("无票") && !seat.status.includes("候补")
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (isAvailable) onSelect() }}
      disabled={!isAvailable}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all ${
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : isAvailable
          ? "border-border hover:border-brand-300 hover:bg-brand-50"
          : "border-border bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60"
      }`}
    >
      <Circle className={`h-2 w-2 fill-current ${selected ? "" : isAvailable ? "text-green-500" : "text-muted-foreground/40"}`} />
      <span className="font-medium">{seat.name}</span>
      <span className="font-semibold">{formatCurrency(seat.price)}</span>
      <span className="text-[10px] opacity-70">{seat.status}</span>
    </button>
  )
}

function TransportCard({
  item,
  selected,
  selectedSeat,
  onSelectTrain,
  onSelectSeat,
}: {
  item: TransportOption
  selected: boolean
  selectedSeat: string | null
  onSelectTrain: () => void
  onSelectSeat: (seatName: string) => void
}) {
  return (
    <div
      onClick={onSelectTrain}
      className={`rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
        selected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border hover:border-brand-200 hover:bg-brand-50/30"
      }`}
    >
      {/* Train header */}
      <div className="flex items-center gap-4 p-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          <Train className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={selected ? "default" : "outline"} className="text-xs font-mono font-semibold">{item.number}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{item.duration}
            </span>
          </div>
          <div className="flex items-center gap-2 text-base font-bold">
            <span>{item.departure_time}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>{item.arrival_time}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />{item.departure_station} → {item.arrival_station}
          </div>
        </div>
        {!selected && (
          <div className="text-right shrink-0">
            {item.price > 0
              ? <p className="text-lg font-bold text-brand-600">{formatCurrency(item.price)}</p>
              : <p className="text-xs text-muted-foreground">票价待查</p>}
            {item.seat_class && <p className="text-[10px] text-muted-foreground">{item.seat_class}</p>}
          </div>
        )}
      </div>

      {/* Seat selection */}
      {selected && item.seats.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Ticket className="h-3.5 w-3.5" />
              选择座位类型
            </div>
            <div className="flex flex-wrap gap-2">
              {item.seats.map((seat) => (
                <SeatBadge
                  key={seat.name}
                  seat={{ ...seat, trainId: item.id }}
                  selected={selectedSeat === seat.name}
                  onSelect={() => onSelectSeat(seat.name)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function Step2Transport() {
  const { fromCity, toCity, departDate, selectTransport, goToStep } = useTripStore()
  const [options, setOptions] = useState<TransportOption[]>([])
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null)
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 只负责发请求；重置动作放在事件回调里。
  // 在 effect 体内同步 setState 会触发 react-hooks/set-state-in-effect(级联渲染)。
  // 组件随 currentStep 变更重新挂载，初始 state 本就是干净的。
  const loadTrains = useCallback(() => {
    let cancelled = false

    pythonBackend
      .searchTransportation({ from_city: fromCity, to_city: toCity, date: departDate, mode: "train" })
      .then((json) => {
        if (cancelled) return
        // 后端会明确返回 success:false + message，必须如实展示，不能拿假车次冒充结果
        if (json?.success === false) {
          setError(json.message || "车票查询失败，请稍后重试")
          return
        }
        if (json?.data && typeof json.data === "string") {
          const parsed = parse12306Text(json.data)
          if (parsed.length > 0) { setOptions(parsed); return }
          // 后端明确表示"没有查询到车次"时才当作空结果；
          // 否则说明返回格式变了(解析失败)，必须报错，不能谎报"未找到列车"
          if (!json.data.includes("没有查询到相关车次信息")) {
            setError("车次数据解析失败，可能是 12306 返回格式变化，请稍后重试")
            return
          }
          return
        }
        if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
          setOptions(json.data as TransportOption[])
          return
        }
        // 查询成功但没有车次：是真实结果，不是错误
      })
      .catch(() => {
        if (!cancelled) setError("无法连接到服务器，请检查网络后重试")
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [fromCity, toCity, departDate])

  useEffect(() => loadTrains(), [loadTrains, reloadKey])

  const selectedTrain = options.find((i) => i.id === selectedTrainId)

  const handleConfirm = () => {
    if (!selectedTrain || !selectedSeat) return
    const seat = selectedTrain.seats.find((s) => s.name === selectedSeat)
    selectTransport({
      mode: selectedTrain.type,
      selected_item: { ...selectedTrain, price: seat?.price || selectedTrain.price, seat_class: selectedSeat },
    })
  }

  const handleSelectTrain = (id: string) => {
    setSelectedTrainId(id)
    setSelectedSeat(null)
  }

  return (
    <Card className="wizard-card">
      <div className="wizard-card-heading">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Train className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{fromCity} → {toCity}</CardTitle>
            <CardDescription>{departDate} 出发 · 共 {options.length || "—"} 趟列车</CardDescription>
          </div>
        </div>
      </div>

      <CardContent className="p-6 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm text-muted-foreground">正在查询列车信息...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">列车信息查询失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">{error}</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => {
                  setLoading(true); setError(null); setOptions([])
                  setSelectedTrainId(null); setSelectedSeat(null)
                  setReloadKey((k) => k + 1)
                }}>
                <RotateCw className="h-4 w-4 mr-1.5" />
                重试
              </Button>
              <Button variant="outline" size="sm" onClick={() => goToStep(1)}>返回修改</Button>
            </div>
          </div>
        ) : options.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            未找到 {fromCity} 到 {toCity} 的列车
          </div>
        ) : (
          <>
            {options.map((item) => (
              <TransportCard
                key={item.id}
                item={item}
                selected={selectedTrainId === item.id}
                selectedSeat={selectedSeat}
                onSelectTrain={() => handleSelectTrain(item.id)}
                onSelectSeat={(seatName) => setSelectedSeat(seatName)}
              />
            ))}
            <div className="flex gap-3 pt-3">
              <Button variant="outline" onClick={() => goToStep(1)} className="flex-1 h-11">返回修改</Button>
              <Button onClick={handleConfirm} disabled={!selectedTrainId || !selectedSeat} className="flex-1 h-11">
                确认选择，下一步
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
