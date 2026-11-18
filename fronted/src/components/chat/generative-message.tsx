import { TripStartCard } from "./trip-start-card"

interface ComponentBlock {
  type: string
  props: Record<string, unknown>
}

function parseComponentBlocks(text: string): (string | ComponentBlock)[] {
  const parts: (string | ComponentBlock)[] = []
  const regex = /```component\s*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before this block
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim()
      if (before) parts.push(before)
    }
    // Parse the JSON block
    try {
      const block = JSON.parse(match[1].trim()) as ComponentBlock
      parts.push(block)
    } catch {
      // If JSON is invalid, treat as plain text
      parts.push(match[0])
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim()
    if (remaining) parts.push(remaining)
  }

  return parts
}

function ComponentRenderer({ block }: { block: ComponentBlock }) {
  switch (block.type) {
    case "trip-start":
      return (
        <TripStartCard
          city={(block.props.city as string) || ""}
          message={block.props.message as string | undefined}
        />
      )
    default:
      return (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          未知组件: {block.type}
        </div>
      )
  }
}

export function GenerativeMessage({ text }: { text: string }) {
  const parts = parseComponentBlocks(text)

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") {
          return <span key={i}>{part}</span>
        }
        return <ComponentRenderer key={i} block={part} />
      })}
    </>
  )
}
