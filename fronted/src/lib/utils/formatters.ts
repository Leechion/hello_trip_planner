export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("zh-CN")}`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr)
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`
}

export function budgetLevelLabel(level: string): string {
  const map: Record<string, string> = {
    budget: "经济实惠",
    comfort: "舒适型",
    luxury: "高端奢华",
  }
  return map[level] || level
}
