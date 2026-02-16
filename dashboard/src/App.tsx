import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckSquare, Mail, MessageSquare, Activity, Wifi, WifiOff } from 'lucide-react'
import { TaskBoard } from './components/TaskBoard'
import { EmailSummary } from './components/EmailSummary'
import { ChatPanel } from './components/ChatPanel'
import { HeartbeatStatus } from './components/HeartbeatStatus'
import { connectToAgent, sendMessage } from './lib/agent-api'
import type { Task, AgentMessage, EmailCategory } from './lib/types'

type TabId = 'tasks' | 'email' | 'chat'

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
]

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'ws://localhost:18789'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('tasks')
  const [connected, setConnected] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [emailCounts, setEmailCounts] = useState<Record<EmailCategory, number>>({
    to_respond: 0, fyi: 0, comment: 0, notification: 0,
    meeting_update: 0, awaiting_reply: 0, actioned: 0, marketing: 0,
  })
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [lastSync, setLastSync] = useState<string>('')
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('')
  const disconnectRef = useRef<(() => void) | null>(null)

  const handleAgentMessage = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'chat.message' || data.type === 'chat.partial') {
      const content = (data.content as string) || (data.text as string) || ''
      if (content) {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && data.type === 'chat.partial') {
            return [...prev.slice(0, -1), { ...last, content: last.content + content }]
          }
          return [...prev, { role: 'assistant', content, timestamp: new Date().toISOString() }]
        })
      }
    }

    if (data.type === 'tool_result') {
      const toolName = data.toolName as string
      const details = data.details as Record<string, unknown>

      if (toolName === 'list_tasks' && details?.tasks) {
        setTasks(details.tasks as Task[])
        setLastSync(new Date().toISOString())
      }

      if (toolName === 'run_email_triage' && details?.summary) {
        setEmailCounts(details.summary as Record<EmailCategory, number>)
      }
    }

    if (data.type === 'heartbeat') {
      setLastHeartbeat(new Date().toISOString())
    }

    if (data.type === 'sync_status') {
      setLastSync((data as { lastSync?: string }).lastSync || new Date().toISOString())
    }
  }, [])

  useEffect(() => {
    disconnectRef.current = connectToAgent(
      GATEWAY_URL,
      handleAgentMessage,
      setConnected,
    )
    return () => {
      if (disconnectRef.current) disconnectRef.current()
    }
  }, [handleAgentMessage])

  const handleSendMessage = useCallback((message: string) => {
    const sent = sendMessage(message)
    if (sent) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ])
    }
    return sent
  }, [])

  const handleSendToAgent = useCallback((message: string) => {
    handleSendMessage(message)
  }, [handleSendMessage])

  function formatSyncTime(iso: string): string {
    if (!iso) return 'never'
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-indigo-400" />
            <h1 className="text-lg font-semibold tracking-tight">Tempo Core</h1>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <HeartbeatStatus lastHeartbeat={lastHeartbeat} />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Synced: {formatSyncTime(lastSync)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <><Wifi className="w-4 h-4 text-emerald-400" /><span className="text-xs text-emerald-400">Connected</span></>
              ) : (
                <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-xs text-red-400">Disconnected</span></>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'tasks' && (
          <TaskBoard
            tasks={tasks}
            onSendToAgent={handleSendToAgent}
            isConnected={connected}
            lastSync={lastSync}
          />
        )}
        {activeTab === 'email' && (
          <EmailSummary
            counts={emailCounts}
            onSendToAgent={handleSendToAgent}
            isConnected={connected}
          />
        )}
        {activeTab === 'chat' && (
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            isConnected={connected}
          />
        )}
      </main>
    </div>
  )
}
