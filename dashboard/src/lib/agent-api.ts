import type { Task, EmailSummaryData, SyncStatus } from './types'

type MessageHandler = (data: Record<string, unknown>) => void

interface AgentConnection {
  ws: WebSocket | null
  connected: boolean
  onMessage: MessageHandler | null
  onStatusChange: ((connected: boolean) => void) | null
}

const connection: AgentConnection = {
  ws: null,
  connected: false,
  onMessage: null,
  onStatusChange: null,
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export function connectToAgent(
  gatewayUrl: string,
  onMessage: MessageHandler,
  onStatusChange: (connected: boolean) => void
): () => void {
  connection.onMessage = onMessage
  connection.onStatusChange = onStatusChange

  function connect() {
    if (connection.ws) {
      connection.ws.close()
    }

    const ws = new WebSocket(gatewayUrl)
    connection.ws = ws

    ws.onopen = () => {
      connection.connected = true
      onStatusChange(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (connection.onMessage) {
          connection.onMessage(data)
        }
      } catch {
        if (connection.onMessage) {
          connection.onMessage({ type: 'raw', text: event.data })
        }
      }
    }

    ws.onclose = () => {
      connection.connected = false
      onStatusChange(false)
      reconnectTimer = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  connect()

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (connection.ws) connection.ws.close()
    connection.ws = null
    connection.connected = false
  }
}

export function sendMessage(message: string): boolean {
  if (!connection.ws || !connection.connected) return false
  connection.ws.send(JSON.stringify({
    type: 'chat.send',
    content: message,
  }))
  return true
}

export function isConnected(): boolean {
  return connection.connected
}

export function sendCommand(command: string): boolean {
  return sendMessage(command)
}

export function requestTasks(filters?: {
  status?: string
  assignee?: string
  project?: string
}): boolean {
  const parts = ['list tasks']
  if (filters?.status) parts.push(`status:${filters.status}`)
  if (filters?.assignee) parts.push(`assignee:${filters.assignee}`)
  if (filters?.project) parts.push(`project:${filters.project}`)
  return sendMessage(parts.join(' '))
}

export function requestEmailSummary(): boolean {
  return sendMessage('show email summary')
}

export function requestTriage(opts?: {
  limit?: number
  timeframe?: string
}): boolean {
  const parts = ['triage my inbox']
  if (opts?.limit) parts.push(`limit:${opts.limit}`)
  if (opts?.timeframe) parts.push(`timeframe:${opts.timeframe}`)
  return sendMessage(parts.join(' '))
}

export function requestFollowUps(): boolean {
  return sendMessage('check follow-ups')
}

export function parseTasksFromResponse(data: Record<string, unknown>): Task[] | null {
  if (data.type === 'tool_result' && data.toolName === 'list_tasks') {
    const details = data.details as { tasks?: Task[] }
    return details?.tasks || null
  }
  return null
}

export function parseEmailSummaryFromResponse(data: Record<string, unknown>): EmailSummaryData | null {
  if (data.type === 'tool_result' && data.toolName === 'run_email_triage') {
    const details = data.details as { summary?: Record<string, number> }
    if (details?.summary) {
      return {
        counts: details.summary as Record<string, number> as EmailSummaryData['counts'],
        followUps: { needsReply: 0, awaitingReply: 0, needsAction: 0, overdue: 0 },
      }
    }
  }
  return null
}

export function parseSyncStatus(data: Record<string, unknown>): SyncStatus | null {
  if (data.type === 'sync_status') {
    return data as unknown as SyncStatus
  }
  return null
}
