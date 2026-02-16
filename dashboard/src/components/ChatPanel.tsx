import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import type { AgentMessage } from '../lib/types'

interface ChatPanelProps {
  messages: AgentMessage[]
  onSendMessage: (message: string) => boolean
  isConnected: boolean
}

const QUICK_COMMANDS = [
  { label: 'List tasks', command: 'list tasks' },
  { label: 'Triage inbox', command: 'triage my inbox' },
  { label: 'Check follow-ups', command: 'check follow-ups' },
  { label: 'What\'s due today?', command: 'what tasks are due today?' },
]

export function ChatPanel({ messages, onSendMessage, isConnected }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || !isConnected) return
    onSendMessage(input.trim())
    setInput('')
    inputRef.current?.focus()
  }

  function handleQuickCommand(command: string) {
    onSendMessage(command)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Chat</h2>
        <span className="text-xs text-gray-500">
          {isConnected ? 'Connected to agent' : 'Connecting...'}
        </span>
      </div>

      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
          <Bot className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-sm mb-6">Start a conversation with your agent.</p>
          <div className="flex flex-wrap gap-2 max-w-md justify-center">
            {QUICK_COMMANDS.map(cmd => (
              <button
                key={cmd.command}
                onClick={() => handleQuickCommand(cmd.command)}
                disabled={!isConnected}
                className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-indigo-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600/20 text-indigo-200'
                    : 'bg-gray-800 text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <span className="text-[10px] text-gray-600 mt-1 block">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="border-t border-gray-800 pt-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSend()
            }}
            placeholder={isConnected ? 'Type a message or brain dump...' : 'Connecting to agent...'}
            disabled={!isConnected}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected}
            className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {messages.length > 0 && (
          <div className="flex gap-2 mt-2">
            {QUICK_COMMANDS.map(cmd => (
              <button
                key={cmd.command}
                onClick={() => handleQuickCommand(cmd.command)}
                disabled={!isConnected}
                className="px-2 py-1 bg-gray-800/50 text-gray-500 rounded text-[11px] hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
