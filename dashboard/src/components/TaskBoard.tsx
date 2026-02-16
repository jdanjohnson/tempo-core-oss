import { useState } from 'react'
import { Plus, ArrowRight, CheckCircle2, Clock, AlertTriangle, Inbox, Send } from 'lucide-react'
import type { Task, TaskStatus } from '../lib/types'

interface TaskBoardProps {
  tasks: Task[]
  onSendToAgent: (message: string) => void
  isConnected: boolean
  lastSync: string
}

const COLUMNS: Array<{ status: TaskStatus; label: string; icon: React.ElementType; color: string }> = [
  { status: 'backlog', label: 'Backlog', icon: Inbox, color: 'border-gray-600' },
  { status: 'next', label: 'Next', icon: ArrowRight, color: 'border-blue-600' },
  { status: 'working', label: 'Working', icon: Clock, color: 'border-amber-600' },
  { status: 'blocked', label: 'Blocked', icon: AlertTriangle, color: 'border-red-600' },
  { status: 'done', label: 'Done', icon: CheckCircle2, color: 'border-emerald-600' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/20 text-red-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low: 'bg-gray-500/20 text-gray-400',
}

export function TaskBoard({ tasks, onSendToAgent, isConnected }: TaskBoardProps) {
  const [brainDump, setBrainDump] = useState('')
  const [showBrainDump, setShowBrainDump] = useState(false)

  function handleBrainDump() {
    if (!brainDump.trim() || !isConnected) return
    onSendToAgent(`brain dump: ${brainDump}`)
    setBrainDump('')
    setShowBrainDump(false)
  }

  function handleQuickAdd(title: string) {
    if (!title.trim() || !isConnected) return
    onSendToAgent(`create task: ${title}`)
  }

  function handleMoveTask(taskTitle: string, newStatus: TaskStatus) {
    if (!isConnected) return
    onSendToAgent(`update task "${taskTitle}" status to ${newStatus}`)
  }

  function handleCompleteTask(taskTitle: string) {
    if (!isConnected) return
    onSendToAgent(`complete task "${taskTitle}"`)
  }

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter(t => t.status === status)

  const wipCount = tasks.filter(t => t.status === 'working').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <span className="text-sm text-gray-500">{tasks.length} total</span>
          {wipCount > 5 && (
            <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
              WIP limit exceeded ({wipCount}/5)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBrainDump(!showBrainDump)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-300 rounded-lg text-sm hover:bg-indigo-600/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Brain Dump
          </button>
          <button
            onClick={() => onSendToAgent('list tasks')}
            disabled={!isConnected}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {showBrainDump && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-400">Dump your thoughts and the AI will create tasks for you.</p>
          <textarea
            value={brainDump}
            onChange={e => setBrainDump(e.target.value)}
            placeholder="I need to review the PR, buy groceries, finish the slide deck by Friday..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowBrainDump(false)}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleBrainDump}
              disabled={!brainDump.trim() || !isConnected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Process
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-3">
        {COLUMNS.map(col => {
          const colTasks = tasksByStatus(col.status)
          const Icon = col.icon
          return (
            <div key={col.status} className={`bg-gray-900 rounded-lg border-t-2 ${col.color}`}>
              <div className="p-3 border-b border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium">{col.label}</span>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                    {colTasks.length}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-2 min-h-[200px]">
                {colTasks.map(task => (
                  <TaskCard
                    key={task.filename}
                    task={task}
                    onMove={handleMoveTask}
                    onComplete={handleCompleteTask}
                  />
                ))}
                {col.status === 'backlog' && (
                  <QuickAddCard onAdd={handleQuickAdd} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onMove,
  onComplete,
}: {
  task: Task
  onMove: (title: string, status: TaskStatus) => void
  onComplete: (title: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-750 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-200 leading-tight">{task.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      {task.project && (
        <span className="text-[11px] text-indigo-400 mt-1 inline-block">#{task.project}</span>
      )}
      {task.due_date && (
        <span className="text-[11px] text-gray-500 mt-1 block">
          Due: {new Date(task.due_date).toLocaleDateString()}
        </span>
      )}
      {task.assignee === 'assistant' && (
        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded mt-1 inline-block">
          AI assigned
        </span>
      )}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-700 space-y-2">
          {task.description && (
            <p className="text-xs text-gray-400">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {task.status !== 'done' && (
              <button
                onClick={e => { e.stopPropagation(); onComplete(task.title) }}
                className="text-[11px] px-2 py-0.5 bg-emerald-600/20 text-emerald-300 rounded hover:bg-emerald-600/30"
              >
                Complete
              </button>
            )}
            {task.status !== 'working' && task.status !== 'done' && (
              <button
                onClick={e => { e.stopPropagation(); onMove(task.title, 'working') }}
                className="text-[11px] px-2 py-0.5 bg-amber-600/20 text-amber-300 rounded hover:bg-amber-600/30"
              >
                Start
              </button>
            )}
            {task.status !== 'next' && task.status !== 'done' && (
              <button
                onClick={e => { e.stopPropagation(); onMove(task.title, 'next') }}
                className="text-[11px] px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30"
              >
                Move to Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickAddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left text-xs text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-gray-800/50 transition-colors"
      >
        + Add task
      </button>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-2">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && title.trim()) {
            onAdd(title.trim())
            setTitle('')
            setEditing(false)
          }
          if (e.key === 'Escape') {
            setTitle('')
            setEditing(false)
          }
        }}
        placeholder="Task title..."
        className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        autoFocus
      />
    </div>
  )
}
