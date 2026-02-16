import { Heart } from 'lucide-react'

interface HeartbeatStatusProps {
  lastHeartbeat: string
}

export function HeartbeatStatus({ lastHeartbeat }: HeartbeatStatusProps) {
  if (!lastHeartbeat) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <Heart className="w-3.5 h-3.5" />
        <span>No heartbeat</span>
      </div>
    )
  }

  const diff = Math.floor((Date.now() - new Date(lastHeartbeat).getTime()) / 1000)
  const isRecent = diff < 1800
  const timeStr = diff < 60
    ? 'just now'
    : diff < 3600
      ? `${Math.floor(diff / 60)}m ago`
      : `${Math.floor(diff / 3600)}h ago`

  return (
    <div className={`flex items-center gap-1.5 text-xs ${isRecent ? 'text-emerald-400' : 'text-gray-500'}`}>
      <Heart className={`w-3.5 h-3.5 ${isRecent ? 'animate-pulse' : ''}`} />
      <span>{timeStr}</span>
    </div>
  )
}
