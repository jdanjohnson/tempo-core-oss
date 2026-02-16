import { useState } from 'react'
import { Mail, RefreshCw, Archive, Clock, MessageSquare, Bell, Calendar, Send, Eye, Megaphone, AlertTriangle } from 'lucide-react'
import type { EmailCategory } from '../lib/types'

interface EmailSummaryProps {
  counts: Record<EmailCategory, number>
  onSendToAgent: (message: string) => void
  isConnected: boolean
}

const CATEGORY_CONFIG: Array<{
  key: EmailCategory
  label: string
  icon: React.ElementType
  color: string
  bg: string
}> = [
  { key: 'to_respond', label: 'To Respond', icon: Mail, color: 'text-red-300', bg: 'bg-red-600/20' },
  { key: 'awaiting_reply', label: 'Awaiting Reply', icon: Clock, color: 'text-blue-300', bg: 'bg-blue-600/20' },
  { key: 'fyi', label: 'FYI', icon: Eye, color: 'text-cyan-300', bg: 'bg-cyan-600/20' },
  { key: 'comment', label: 'Comment', icon: MessageSquare, color: 'text-purple-300', bg: 'bg-purple-600/20' },
  { key: 'notification', label: 'Notification', icon: Bell, color: 'text-amber-300', bg: 'bg-amber-600/20' },
  { key: 'meeting_update', label: 'Meeting Update', icon: Calendar, color: 'text-green-300', bg: 'bg-green-600/20' },
  { key: 'actioned', label: 'Actioned', icon: Send, color: 'text-emerald-300', bg: 'bg-emerald-600/20' },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, color: 'text-gray-400', bg: 'bg-gray-600/20' },
]

export function EmailSummary({ counts, onSendToAgent, isConnected }: EmailSummaryProps) {
  const [triaging, setTriaging] = useState(false)

  const totalTriaged = Object.values(counts).reduce((a, b) => a + b, 0)
  const actionNeeded = (counts.to_respond || 0) + (counts.awaiting_reply || 0)

  function handleRunTriage() {
    if (!isConnected) return
    setTriaging(true)
    onSendToAgent('triage my inbox')
    setTimeout(() => setTriaging(false), 5000)
  }

  function handleArchiveMarketing() {
    if (!isConnected) return
    onSendToAgent('triage my inbox archiveMarketing:true')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Email</h2>
          {totalTriaged > 0 && (
            <span className="text-sm text-gray-500">{totalTriaged} triaged</span>
          )}
          {actionNeeded > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              {actionNeeded} need attention
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunTriage}
            disabled={!isConnected || triaging}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 rounded-lg text-sm hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${triaging ? 'animate-spin' : ''}`} />
            {triaging ? 'Triaging...' : 'Run Triage'}
          </button>
          {(counts.marketing || 0) > 0 && (
            <button
              onClick={handleArchiveMarketing}
              disabled={!isConnected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              Archive Marketing
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-sm text-gray-400 mb-3">
          Emails are categorized directly in your Gmail inbox using labels.
          Click &quot;Run Triage&quot; to categorize unread emails.
        </p>
        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Open Gmail to view labeled emails →
        </a>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {CATEGORY_CONFIG.map(cat => {
          const count = counts[cat.key] || 0
          const Icon = cat.icon
          return (
            <div
              key={cat.key}
              className={`${cat.bg} rounded-lg p-4 border border-gray-800`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${cat.color}`} />
                <span className={`text-2xl font-bold ${cat.color}`}>{count}</span>
              </div>
              <span className="text-xs text-gray-400">{cat.label}</span>
            </div>
          )
        })}
      </div>

      {totalTriaged === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No triage results yet.</p>
          <p className="text-xs mt-1">Click &quot;Run Triage&quot; to categorize your unread emails.</p>
        </div>
      )}
    </div>
  )
}
