export type TaskStatus = 'working' | 'next' | 'done' | 'blocked' | 'backlog' | 'archived'
export type TaskAssignee = 'me' | 'assistant'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  title: string
  filename: string
  status: TaskStatus
  assignee: TaskAssignee
  priority: TaskPriority
  project: string | null
  due_date: string | null
  blocked_by: string | null
  follow_up_date: string | null
  created_at: string
  completed_at: string | null
  tags: string[]
  description: string | null
}

export type EmailCategory =
  | 'to_respond'
  | 'fyi'
  | 'comment'
  | 'notification'
  | 'meeting_update'
  | 'awaiting_reply'
  | 'actioned'
  | 'marketing'

export interface TriagedEmail {
  messageId: string
  from: string
  fromName: string
  subject: string
  snippet: string
  category: EmailCategory
  draftReply?: string
}

export interface FollowUpStats {
  needsReply: number
  awaitingReply: number
  needsAction: number
  overdue: number
}

export interface EmailSummaryData {
  counts: Record<EmailCategory, number>
  followUps: FollowUpStats
  lastTriage?: string
}

export interface SyncStatus {
  lastSync: string
  tasksCount: number
  boardSynced: boolean
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
