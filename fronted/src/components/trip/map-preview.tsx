import { useEffect, useRef } from "react"
import type { DayPlan } from "@/lib/types"

const AMAP_JS_KEY = import.meta.env.VITE_AMAP_JS_KEY || ""

const DAY_COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C", "#E67E22", "#34495E"]

/** 转义 HTML，避免景点名/地址中的用户可控文本被 InfoWindow 当作 HTML 解析 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  )
}

export function MapPreview({ days }: { days: DayPlan[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current || !containerRef.current) return
    if (!AMAP_JS_KEY) return  // 未配置 JS API Key 时优雅降级，不加载 SDK
    loadedRef.current = true

    const script = document.createElement("script")
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}&plugin=AMap.Polyline,AMap.Marker`
    script.onload = () => initMap()
    script.onerror = () => console.error("高德地图 JS SDK 加载失败")
    document.head.appendChild(script)

    return () => {
      if (mapRef.current) mapRef.current.destroy()
    }
  }, [])

  const initMap = () => {
    const AMap = (window as any).AMap
    if (!AMap || !containerRef.current) return

    const allAttractions = days.flatMap((d) => d.attractions)
    const validPoints = allAttractions.filter(
      (a) => a.location?.longitude != null && a.location?.latitude != null && !(a.location.longitude === 0 && a.location.latitude === 0)
    )

    if (validPoints.length === 0) return

    const map = new AMap.Map(containerRef.current, {
      zoom: 12,
      center: [validPoints[0].location.longitude, validPoints[0].location.latitude],
    })
    mapRef.current = map

    // 景点 markers
    days.forEach((day, di) => {
      const color = DAY_COLORS[di % DAY_COLORS.length]
      day.attractions.forEach((attr, ai) => {
        if (!attr.location?.longitude || !attr.location?.latitude) return
        const content = `<div style="background:${color};color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${ai + 1}</div>`
        const marker = new AMap.Marker({
          position: [attr.location.longitude, attr.location.latitude],
          content,
          offset: new AMap.Pixel(-12, -12),
        })
        marker.setMap(map)
        marker.on("click", () => {
          const info = new AMap.InfoWindow({
            content: `<div style="padding:4px 8px;font-size:13px"><b>${escapeHtml(attr.name)}</b><br/><span style="color:#666">${escapeHtml(attr.address || "")}</span></div>`,
            offset: new AMap.Pixel(0, -30),
          })
          info.open(map, marker.getPosition())
        })
      })
    })

    // 路线
    days.forEach((day, di) => {
      const path = day.attractions
        .filter((a) => a.location?.longitude && a.location?.latitude)
        .map((a) => [a.location.longitude, a.location.latitude])
      if (path.length < 2) return
      const polyline = new AMap.Polyline({
        path,
        strokeColor: DAY_COLORS[di % DAY_COLORS.length],
        strokeWeight: 4,
        strokeOpacity: 0.6,
        showDir: true,
      })
      polyline.setMap(map)
    })

    map.setFitView()
  }

  return (
    <div className="rounded-xl overflow-hidden border">
      <div ref={containerRef} className="w-full h-[400px]" />
      <div className="flex gap-3 px-3 py-2 bg-muted/30 text-xs">
        {days.map((_, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: DAY_COLORS[i % DAY_COLORS.length] }} />
            第{i + 1}天
          </span>
        ))}
      </div>
    </div>
  )
}
