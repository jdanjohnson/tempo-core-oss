# Task Planner

## Purpose
Parse brain dumps (freeform text) into discrete, actionable tasks in the Obsidian vault.

## When to Use
- User sends a brain dump or stream-of-consciousness list
- User says "plan", "break down", or "create tasks from..."
- Heartbeat detects WIP overflow and user wants to reorganize

## Process

1. **Parse** — Extract individual action items from the input text
2. **Classify** — For each item, determine:
   - `title`: Short, imperative phrase (e.g., "Review PR for auth module")
   - `assignee`: `me` (human does it) or `assistant` (AI can handle it)
   - `priority`: `low`, `medium`, or `high`
   - `project`: Extract hashtag if present (e.g., #blog-redesign → project: blog-redesign)
   - `due_date`: Extract any dates or relative deadlines ("by Friday" → next Friday's date)
   - `status`: Default to `backlog` unless urgency suggests `next`
3. **Create** — Use `create_task` tool for each task
4. **Summarize** — Report back what was created

## Rules

- Never create duplicate tasks — check existing tasks first with `list_tasks`
- Respect the WIP limit: do NOT set status to `working` if there are already 5 working tasks
- If a task seems too large, suggest breaking it down but don't auto-split without asking
- Always confirm the final list with the user before creating tasks in bulk
- Use `assistant` assignee only for tasks the AI can realistically do (drafting, researching, summarizing)

## Example

Input: "I need to review the PR, buy groceries, finish the slide deck by Friday, and have the AI draft a follow-up email to Sarah"

Output:
1. `Review the PR` — assignee: me, priority: medium, status: next
2. `Buy groceries` — assignee: me, priority: low, status: backlog
3. `Finish slide deck` — assignee: me, priority: high, due_date: [Friday], status: next
4. `Draft follow-up email to Sarah` — assignee: assistant, priority: medium, status: next
