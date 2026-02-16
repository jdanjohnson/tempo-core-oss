# Heartbeat Check

Run these 5 priority checks every 30 minutes during active hours. Report only items that need attention — if everything is clear, send a brief "all clear" message.

## 1. Approaching Deadlines

Check for tasks with `due_date` within the next 24 hours that are not `done` or `archived`.
If found, alert: "⏰ {count} task(s) due within 24h: {titles}"

## 2. Blocked Tasks

Check for tasks with `status: blocked`.
If found, alert: "🚧 {count} blocked task(s): {titles} — consider unblocking or reassigning"

## 3. Overdue Follow-ups

Check Follow-Ups.md for items marked as overdue.
If found, alert: "📬 {count} overdue follow-up(s) — {summary}"

## 4. WIP Overflow

Check for tasks with `status: working`. If more than 5, alert:
"🔥 {count} tasks in progress (limit is 5) — consider completing or moving some back to Next"

## 5. Unread To-Respond Emails

Check Gmail for unread emails with the "To Respond" label.
If found, alert: "✉️ {count} email(s) waiting for your reply"

## Output Format

Send a single consolidated message via Telegram:

```
🫀 Heartbeat — {time}

{findings or "All clear — no items need attention."}
```
