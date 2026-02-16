import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

export interface TaskFrontmatter {
  status: "backlog" | "next" | "working" | "blocked" | "done" | "archived";
  assignee: "me" | "assistant";
  priority: "low" | "medium" | "high";
  project?: string;
  due_date?: string;
  blocked_by?: string;
  follow_up_date?: string;
  created_at: string;
  completed_at?: string;
  tags?: string[];
}

export interface ParsedTask {
  filename: string;
  title: string;
  frontmatter: TaskFrontmatter;
  body: string;
  filePath: string;
}

export interface BoardColumn {
  name: string;
  items: Array<{ title: string; completed: boolean; date?: string }>;
}

export interface VaultConfig {
  vaultPath: string;
  tasksFolder: string;
  boardFile: string;
  projectsFolder: string;
  templateFile: string;
  followUpsFile: string;
}

const STATUS_TO_COLUMN: Record<TaskFrontmatter["status"], string> = {
  backlog: "Backlog",
  next: "Next",
  working: "Working",
  blocked: "Blocked",
  done: "Done",
  archived: "Done",
};

const COLUMN_TO_STATUS: Record<string, TaskFrontmatter["status"]> = {
  Backlog: "backlog",
  Next: "next",
  Working: "working",
  Blocked: "blocked",
  Done: "done",
};

export function getDefaultVaultConfig(vaultPath: string): VaultConfig {
  return {
    vaultPath,
    tasksFolder: path.join(vaultPath, "Tasks"),
    boardFile: path.join(vaultPath, "Tasks", "Board.md"),
    projectsFolder: path.join(vaultPath, "Projects"),
    templateFile: path.join(vaultPath, "Templates", "Task.md"),
    followUpsFile: path.join(vaultPath, "Follow-Ups.md"),
  };
}

export function ensureVaultStructure(config: VaultConfig): void {
  const dirs = [
    config.tasksFolder,
    config.projectsFolder,
    path.join(config.vaultPath, "Templates"),
    path.join(config.tasksFolder, "Archive"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  if (!fs.existsSync(config.boardFile)) {
    const defaultBoard = [
      "---",
      "kanban-plugin: basic",
      "---",
      "",
      "## Backlog",
      "",
      "",
      "## Next",
      "",
      "",
      "## Working",
      "",
      "",
      "## Blocked",
      "",
      "",
      "## Done",
      "",
      "**Complete**",
      "",
    ].join("\n");
    fs.writeFileSync(config.boardFile, defaultBoard, "utf-8");
  }
}

export function parseTaskFile(filePath: string): ParsedTask | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  const filename = path.basename(filePath, ".md");
  const fm = parsed.data as Partial<TaskFrontmatter>;
  const frontmatter: TaskFrontmatter = {
    status: fm.status || "backlog",
    assignee: fm.assignee || "me",
    priority: fm.priority || "medium",
    project: fm.project || undefined,
    due_date: fm.due_date || undefined,
    blocked_by: fm.blocked_by || undefined,
    follow_up_date: fm.follow_up_date || undefined,
    created_at: fm.created_at || new Date().toISOString(),
    completed_at: fm.completed_at || undefined,
    tags: fm.tags || [],
  };
  return {
    filename,
    title: filename,
    frontmatter,
    body: parsed.content.trim(),
    filePath,
  };
}

export function writeTaskFile(
  filePath: string,
  frontmatter: TaskFrontmatter,
  body: string
): void {
  const cleanFm: Record<string, unknown> = {
    status: frontmatter.status,
    assignee: frontmatter.assignee,
    priority: frontmatter.priority,
  };
  if (frontmatter.project) cleanFm.project = frontmatter.project;
  if (frontmatter.due_date) cleanFm.due_date = frontmatter.due_date;
  if (frontmatter.blocked_by) cleanFm.blocked_by = frontmatter.blocked_by;
  if (frontmatter.follow_up_date)
    cleanFm.follow_up_date = frontmatter.follow_up_date;
  cleanFm.created_at = frontmatter.created_at;
  if (frontmatter.completed_at)
    cleanFm.completed_at = frontmatter.completed_at;
  if (frontmatter.tags && frontmatter.tags.length > 0)
    cleanFm.tags = frontmatter.tags;

  const output = matter.stringify(body ? "\n" + body + "\n" : "\n", cleanFm);
  fs.writeFileSync(filePath, output, "utf-8");
}

export function listTaskFiles(tasksFolder: string): ParsedTask[] {
  if (!fs.existsSync(tasksFolder)) return [];
  const files = fs.readdirSync(tasksFolder);
  const tasks: ParsedTask[] = [];
  for (const file of files) {
    if (!file.endsWith(".md") || file === "Board.md") continue;
    const filePath = path.join(tasksFolder, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;
    const task = parseTaskFile(filePath);
    if (task) tasks.push(task);
  }
  return tasks;
}

export function parseBoardFile(boardPath: string): BoardColumn[] {
  if (!fs.existsSync(boardPath)) return [];
  const raw = fs.readFileSync(boardPath, "utf-8");
  const parsed = matter(raw);
  const content = parsed.content;
  const columns: BoardColumn[] = [];
  let currentColumn: BoardColumn | null = null;

  for (const line of content.split("\n")) {
    const columnMatch = line.match(/^## (.+)$/);
    if (columnMatch) {
      if (currentColumn) columns.push(currentColumn);
      currentColumn = { name: columnMatch[1].trim(), items: [] };
      continue;
    }
    if (!currentColumn) continue;
    const itemMatch = line.match(/^- \[([ x])\] \[\[(.+?)\]\](?:\s*@\{(.+?)\})?/);
    if (itemMatch) {
      currentColumn.items.push({
        title: itemMatch[2],
        completed: itemMatch[1] === "x",
        date: itemMatch[3] || undefined,
      });
    }
  }
  if (currentColumn) columns.push(currentColumn);
  return columns;
}

export function writeBoardFile(boardPath: string, columns: BoardColumn[]): void {
  const lines: string[] = [
    "---",
    "kanban-plugin: basic",
    "---",
    "",
  ];
  for (const col of columns) {
    lines.push(`## ${col.name}`);
    lines.push("");
    for (const item of col.items) {
      const check = item.completed ? "x" : " ";
      const datePart = item.date ? ` @{${item.date}}` : "";
      lines.push(`- [${check}] [[${item.title}]]${datePart}`);
    }
    if (col.name === "Done") {
      lines.push("");
      lines.push("**Complete**");
    }
    lines.push("");
  }
  fs.writeFileSync(boardPath, lines.join("\n"), "utf-8");
}

export function addToBoard(
  boardPath: string,
  title: string,
  status: TaskFrontmatter["status"],
  dueDate?: string
): void {
  const columns = parseBoardFile(boardPath);
  const targetCol = STATUS_TO_COLUMN[status] || "Backlog";
  let column = columns.find((c) => c.name === targetCol);
  if (!column) {
    column = { name: targetCol, items: [] };
    columns.push(column);
  }
  const alreadyExists = column.items.some((i) => i.title === title);
  if (!alreadyExists) {
    column.items.push({
      title,
      completed: status === "done" || status === "archived",
      date: dueDate,
    });
  }
  writeBoardFile(boardPath, columns);
}

export function removeFromBoard(boardPath: string, title: string): void {
  const columns = parseBoardFile(boardPath);
  for (const col of columns) {
    col.items = col.items.filter((i) => i.title !== title);
  }
  writeBoardFile(boardPath, columns);
}

export function moveOnBoard(
  boardPath: string,
  title: string,
  newStatus: TaskFrontmatter["status"],
  dueDate?: string
): void {
  removeFromBoard(boardPath, title);
  addToBoard(boardPath, title, newStatus, dueDate);
}

export function renameOnBoard(
  boardPath: string,
  oldTitle: string,
  newTitle: string
): void {
  const columns = parseBoardFile(boardPath);
  for (const col of columns) {
    for (const item of col.items) {
      if (item.title === oldTitle) {
        item.title = newTitle;
      }
    }
  }
  writeBoardFile(boardPath, columns);
}

export function syncBoardWithFiles(
  config: VaultConfig
): { added: number; moved: number; removed: number } {
  ensureVaultStructure(config);
  const tasks = listTaskFiles(config.tasksFolder);
  const columns = parseBoardFile(config.boardFile);
  const boardTitles = new Set<string>();
  for (const col of columns) {
    for (const item of col.items) {
      boardTitles.add(item.title);
    }
  }
  const fileTitles = new Set(tasks.map((t) => t.title));
  let added = 0;
  let moved = 0;
  let removed = 0;

  for (const task of tasks) {
    if (!boardTitles.has(task.title)) {
      addToBoard(config.boardFile, task.title, task.frontmatter.status, task.frontmatter.due_date);
      added++;
    } else {
      const expectedCol = STATUS_TO_COLUMN[task.frontmatter.status] || "Backlog";
      let currentCol: string | null = null;
      const refreshedColumns = parseBoardFile(config.boardFile);
      for (const col of refreshedColumns) {
        if (col.items.some((i) => i.title === task.title)) {
          currentCol = col.name;
          break;
        }
      }
      if (currentCol && currentCol !== expectedCol) {
        moveOnBoard(config.boardFile, task.title, task.frontmatter.status, task.frontmatter.due_date);
        moved++;
      }
    }
  }

  const finalColumns = parseBoardFile(config.boardFile);
  for (const col of finalColumns) {
    for (const item of col.items) {
      if (!fileTitles.has(item.title)) {
        removeFromBoard(config.boardFile, item.title);
        removed++;
      }
    }
  }

  return { added, moved, removed };
}

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLastSyncTime(config: VaultConfig): string {
  if (!fs.existsSync(config.boardFile)) return "never";
  const stat = fs.statSync(config.boardFile);
  return stat.mtime.toISOString();
}
