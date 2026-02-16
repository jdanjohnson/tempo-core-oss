import * as fs from "fs";
import * as path from "path";
import {
  type TaskFrontmatter,
  type ParsedTask,
  type VaultConfig,
  parseTaskFile,
  writeTaskFile,
  listTaskFiles,
  addToBoard,
  removeFromBoard,
  moveOnBoard,
  renameOnBoard,
  sanitizeFilename,
  ensureVaultStructure,
} from "./vault-sync.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

function jsonResult(payload: Record<string, unknown>): ToolResult {
  const clean = JSON.parse(JSON.stringify(payload));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(clean, null, 2) }],
    details: clean,
  };
}

function taskToRecord(task: ParsedTask): Record<string, unknown> {
  return {
    title: task.title,
    filename: task.filename,
    status: task.frontmatter.status,
    assignee: task.frontmatter.assignee,
    priority: task.frontmatter.priority,
    project: task.frontmatter.project || null,
    due_date: task.frontmatter.due_date || null,
    blocked_by: task.frontmatter.blocked_by || null,
    follow_up_date: task.frontmatter.follow_up_date || null,
    created_at: task.frontmatter.created_at,
    completed_at: task.frontmatter.completed_at || null,
    tags: task.frontmatter.tags || [],
    description: task.body || null,
  };
}

function findTaskByTitle(config: VaultConfig, taskId: string): ParsedTask | null {
  const sanitized = sanitizeFilename(taskId);
  const directPath = path.join(config.tasksFolder, sanitized + ".md");
  if (fs.existsSync(directPath)) {
    return parseTaskFile(directPath);
  }
  const tasks = listTaskFiles(config.tasksFolder);
  const match = tasks.find(
    (t) => t.title.toLowerCase() === taskId.toLowerCase()
  );
  return match || null;
}

export function createTask(
  config: VaultConfig,
  params: {
    title: string;
    description?: string;
    assignee?: "me" | "assistant";
    status?: TaskFrontmatter["status"];
    priority?: TaskFrontmatter["priority"];
    project?: string;
    dueDate?: string;
    blockedBy?: string;
    followUpDate?: string;
  }
): ToolResult {
  ensureVaultStructure(config);
  const title = sanitizeFilename(params.title);
  const filePath = path.join(config.tasksFolder, title + ".md");

  if (fs.existsSync(filePath)) {
    return jsonResult({ error: `Task "${title}" already exists` });
  }

  const frontmatter: TaskFrontmatter = {
    status: params.status || "backlog",
    assignee: params.assignee || "me",
    priority: params.priority || "medium",
    project: params.project,
    due_date: params.dueDate,
    blocked_by: params.blockedBy,
    follow_up_date: params.followUpDate,
    created_at: new Date().toISOString(),
    tags: [],
  };

  writeTaskFile(filePath, frontmatter, params.description || "");
  addToBoard(config.boardFile, title, frontmatter.status, params.dueDate);

  const task = parseTaskFile(filePath);
  return jsonResult({
    created: true,
    task: task ? taskToRecord(task) : { title },
  });
}

export function listTasks(
  config: VaultConfig,
  params: {
    assignee?: "me" | "assistant" | "all";
    status?: string;
    project?: string;
    search?: string;
    limit?: number;
  }
): ToolResult {
  ensureVaultStructure(config);
  let tasks = listTaskFiles(config.tasksFolder);

  if (params.assignee && params.assignee !== "all") {
    tasks = tasks.filter((t) => t.frontmatter.assignee === params.assignee);
  }

  if (params.status) {
    if (params.status === "active") {
      tasks = tasks.filter((t) =>
        ["working", "next", "blocked"].includes(t.frontmatter.status)
      );
    } else if (params.status !== "all") {
      tasks = tasks.filter((t) => t.frontmatter.status === params.status);
    }
  }

  if (params.project) {
    tasks = tasks.filter((t) => t.frontmatter.project === params.project);
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
    );
  }

  tasks.sort(
    (a, b) =>
      new Date(b.frontmatter.created_at).getTime() -
      new Date(a.frontmatter.created_at).getTime()
  );

  if (params.limit) {
    tasks = tasks.slice(0, params.limit);
  }

  return jsonResult({
    count: tasks.length,
    tasks: tasks.map(taskToRecord),
  });
}

export function updateTask(
  config: VaultConfig,
  params: {
    taskId: string;
    title?: string;
    description?: string;
    assignee?: "me" | "assistant";
    status?: TaskFrontmatter["status"];
    priority?: TaskFrontmatter["priority"];
    project?: string;
    dueDate?: string;
    blockedBy?: string;
    followUpDate?: string;
  }
): ToolResult {
  const task = findTaskByTitle(config, params.taskId);
  if (!task) {
    return jsonResult({ error: `Task "${params.taskId}" not found` });
  }

  const fm = { ...task.frontmatter };
  let body = task.body;

  if (params.assignee) fm.assignee = params.assignee;
  if (params.status) fm.status = params.status;
  if (params.priority) fm.priority = params.priority;
  if (params.project !== undefined) fm.project = params.project || undefined;
  if (params.dueDate !== undefined) fm.due_date = params.dueDate || undefined;
  if (params.blockedBy !== undefined) fm.blocked_by = params.blockedBy || undefined;
  if (params.followUpDate !== undefined) fm.follow_up_date = params.followUpDate || undefined;
  if (params.description !== undefined) body = params.description;

  if (params.status === "done" && !fm.completed_at) {
    fm.completed_at = new Date().toISOString();
  }

  let currentPath = task.filePath;
  const oldTitle = task.title;

  if (params.title && params.title !== oldTitle) {
    const newTitle = sanitizeFilename(params.title);
    const newPath = path.join(config.tasksFolder, newTitle + ".md");
    writeTaskFile(newPath, fm, body);
    fs.unlinkSync(currentPath);
    renameOnBoard(config.boardFile, oldTitle, newTitle);
    currentPath = newPath;
  } else {
    writeTaskFile(currentPath, fm, body);
  }

  if (params.status && params.status !== task.frontmatter.status) {
    const title = params.title ? sanitizeFilename(params.title) : oldTitle;
    moveOnBoard(config.boardFile, title, fm.status, fm.due_date);
  }

  const updated = parseTaskFile(currentPath);
  return jsonResult({
    updated: true,
    task: updated ? taskToRecord(updated) : { title: params.taskId },
  });
}

export function completeTask(
  config: VaultConfig,
  params: { taskId: string }
): ToolResult {
  return updateTask(config, { taskId: params.taskId, status: "done" });
}

export function archiveTask(
  config: VaultConfig,
  params: { taskId: string }
): ToolResult {
  const task = findTaskByTitle(config, params.taskId);
  if (!task) {
    return jsonResult({ error: `Task "${params.taskId}" not found` });
  }

  const archiveDir = path.join(config.tasksFolder, "Archive");
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const fm = { ...task.frontmatter, status: "archived" as const };
  const archivePath = path.join(archiveDir, task.filename + ".md");
  writeTaskFile(archivePath, fm, task.body);
  fs.unlinkSync(task.filePath);
  removeFromBoard(config.boardFile, task.title);

  return jsonResult({ archived: true, task: { title: task.title } });
}

export function deleteTask(
  config: VaultConfig,
  params: { taskId: string }
): ToolResult {
  const task = findTaskByTitle(config, params.taskId);
  if (!task) {
    return jsonResult({ error: `Task "${params.taskId}" not found` });
  }

  fs.unlinkSync(task.filePath);
  removeFromBoard(config.boardFile, task.title);

  return jsonResult({ deleted: true, task: { title: task.title } });
}

export function listProjects(config: VaultConfig): ToolResult {
  const tasks = listTaskFiles(config.tasksFolder);
  const projectSet = new Set<string>();
  for (const task of tasks) {
    if (task.frontmatter.project) {
      projectSet.add(task.frontmatter.project);
    }
  }

  const projectsDir = config.projectsFolder;
  if (fs.existsSync(projectsDir)) {
    const files = fs.readdirSync(projectsDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        projectSet.add(path.basename(file, ".md"));
      }
    }
  }

  const projects = Array.from(projectSet).map((slug) => {
    const taskCount = tasks.filter(
      (t) => t.frontmatter.project === slug
    ).length;
    return { slug, taskCount };
  });

  return jsonResult({ count: projects.length, projects });
}

export function createProject(
  config: VaultConfig,
  params: { slug: string; displayName?: string; description?: string }
): ToolResult {
  if (!fs.existsSync(config.projectsFolder)) {
    fs.mkdirSync(config.projectsFolder, { recursive: true });
  }

  const filePath = path.join(config.projectsFolder, params.slug + ".md");
  if (fs.existsSync(filePath)) {
    return jsonResult({ error: `Project "${params.slug}" already exists` });
  }

  const lines: string[] = [
    "---",
    `slug: ${params.slug}`,
    `display_name: ${params.displayName || params.slug}`,
    `status: active`,
    `created_at: ${new Date().toISOString()}`,
    "---",
    "",
    params.description || "",
    "",
  ];
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

  return jsonResult({
    created: true,
    project: {
      slug: params.slug,
      displayName: params.displayName || params.slug,
    },
  });
}

export function getCurrentTime(params: { timezone?: string }): ToolResult {
  const tz = params.timezone || "UTC";
  const now = new Date();
  const formatted = now.toLocaleString("en-US", { timeZone: tz });
  return jsonResult({
    timezone: tz,
    iso: now.toISOString(),
    formatted,
    unix: Math.floor(now.getTime() / 1000),
  });
}
