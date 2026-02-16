import { Type } from "@sinclair/typebox";
import {
  type VaultConfig,
  getDefaultVaultConfig,
  syncBoardWithFiles,
  getLastSyncTime,
} from "../../lib/vault-sync.js";
import {
  createTask,
  listTasks,
  updateTask,
  completeTask,
  archiveTask,
  deleteTask,
  listProjects,
  createProject,
  getCurrentTime,
} from "../../lib/vault-tasks.js";
import {
  runEmailTriage,
  listEmails,
  readEmail,
  sendEmail,
  createDraft,
} from "../../lib/gmail-email.js";
import { createGmailAdapter } from "../../lib/gmail-adapter.js";
import {
  refreshFollowUps,
  getFollowUpSummary,
} from "../../lib/follow-up-tracker.js";

interface PluginApi {
  registerTool: (
    tool: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (
        id: string,
        params: Record<string, unknown>
      ) => Promise<unknown>;
    },
    options?: { optional?: boolean }
  ) => void;
}

function getVaultConfig(): VaultConfig {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    throw new Error(
      "VAULT_PATH environment variable is required. Set it to your Obsidian vault path."
    );
  }
  return getDefaultVaultConfig(vaultPath);
}

function getGmailAdapter() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN."
    );
  }

  return createGmailAdapter({ clientId, clientSecret, refreshToken });
}

function jsonResult(payload: Record<string, unknown>) {
  const clean = JSON.parse(JSON.stringify(payload));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(clean, null, 2) }],
    details: clean,
  };
}

export default function corePlugin(api: PluginApi) {
  // ── Task Tools ──

  api.registerTool({
    name: "create_task",
    description:
      "Create a new task in the Obsidian vault. Use assignee 'me' for user tasks, 'assistant' for tasks the AI should handle.",
    parameters: Type.Object({
      title: Type.String({ description: "Task title — concise and actionable" }),
      description: Type.Optional(
        Type.String({ description: "Additional details about the task" })
      ),
      assignee: Type.Optional(
        Type.Union([Type.Literal("me"), Type.Literal("assistant")], {
          description: "Who should work on this task",
          default: "me",
        })
      ),
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("working"),
            Type.Literal("next"),
            Type.Literal("blocked"),
            Type.Literal("backlog"),
            Type.Literal("done"),
          ],
          { description: "Task status", default: "backlog" }
        )
      ),
      priority: Type.Optional(
        Type.Union(
          [
            Type.Literal("low"),
            Type.Literal("medium"),
            Type.Literal("high"),
          ],
          { description: "Task priority", default: "medium" }
        )
      ),
      project: Type.Optional(
        Type.String({ description: "Project slug (e.g., 'product-launch')" })
      ),
      dueDate: Type.Optional(
        Type.String({ description: "Due date in ISO format" })
      ),
      blockedBy: Type.Optional(
        Type.String({ description: "What/who is blocking this task" })
      ),
      followUpDate: Type.Optional(
        Type.String({ description: "Follow-up date for blocked tasks" })
      ),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return createTask(config, params as Parameters<typeof createTask>[1]);
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "list_tasks",
    description:
      "List tasks from the Obsidian vault. With no status filter, returns all open tasks. Use status 'active' for working/next/blocked only.",
    parameters: Type.Object({
      assignee: Type.Optional(
        Type.Union(
          [
            Type.Literal("me"),
            Type.Literal("assistant"),
            Type.Literal("all"),
          ],
          { description: "Filter by assignee" }
        )
      ),
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("working"),
            Type.Literal("next"),
            Type.Literal("blocked"),
            Type.Literal("backlog"),
            Type.Literal("done"),
            Type.Literal("active"),
            Type.Literal("all"),
          ],
          { description: "Filter by status" }
        )
      ),
      project: Type.Optional(
        Type.String({ description: "Filter by project slug" })
      ),
      search: Type.Optional(
        Type.String({
          description: "Search tasks by title (case-insensitive)",
        })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max tasks to return", default: 50 })
      ),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return listTasks(config, params as Parameters<typeof listTasks>[1]);
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "update_task",
    description:
      "Update an existing task in the vault. Pass the task title (or filename) as taskId.",
    parameters: Type.Object({
      taskId: Type.String({
        description: "Task title or filename to update",
      }),
      title: Type.Optional(Type.String({ description: "New task title" })),
      description: Type.Optional(
        Type.String({ description: "New description" })
      ),
      assignee: Type.Optional(
        Type.Union([Type.Literal("me"), Type.Literal("assistant")])
      ),
      status: Type.Optional(
        Type.Union([
          Type.Literal("working"),
          Type.Literal("next"),
          Type.Literal("blocked"),
          Type.Literal("backlog"),
          Type.Literal("done"),
        ])
      ),
      priority: Type.Optional(
        Type.Union([
          Type.Literal("low"),
          Type.Literal("medium"),
          Type.Literal("high"),
        ])
      ),
      project: Type.Optional(Type.String()),
      dueDate: Type.Optional(Type.String()),
      blockedBy: Type.Optional(Type.String()),
      followUpDate: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return updateTask(config, params as Parameters<typeof updateTask>[1]);
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "complete_task",
    description: "Mark a task as done.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task title or filename to complete" }),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return completeTask(config, { taskId: params.taskId as string });
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "archive_task",
    description:
      "Archive a task. Moves the file to Tasks/Archive/ and removes it from the board.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task title or filename to archive" }),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return archiveTask(config, { taskId: params.taskId as string });
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "delete_task",
    description:
      "Permanently delete a task. This cannot be undone — prefer archive_task.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task title or filename to delete" }),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return deleteTask(config, { taskId: params.taskId as string });
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "list_projects",
    description: "List all projects found in the vault.",
    parameters: Type.Object({}),
    async execute() {
      try {
        const config = getVaultConfig();
        return listProjects(config);
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "create_project",
    description: "Create a new project in the vault's Projects/ folder.",
    parameters: Type.Object({
      slug: Type.String({ description: "Project identifier (e.g., 'product-launch')" }),
      displayName: Type.Optional(
        Type.String({ description: "Human-readable project name" })
      ),
      description: Type.Optional(
        Type.String({ description: "Project description" })
      ),
    }),
    async execute(_id, params) {
      try {
        const config = getVaultConfig();
        return createProject(
          config,
          params as Parameters<typeof createProject>[1]
        );
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "sync_board",
    description:
      "Synchronize the Kanban Board.md with individual task files. Run this if the board gets out of sync.",
    parameters: Type.Object({}),
    async execute() {
      try {
        const config = getVaultConfig();
        const result = syncBoardWithFiles(config);
        const lastSync = getLastSyncTime(config);
        return jsonResult({ synced: true, lastSync, ...result });
      } catch (e) {
        return jsonResult({
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
  });

  api.registerTool({
    name: "get_current_time",
    description: "Get the current date and time.",
    parameters: Type.Object({
      timezone: Type.Optional(
        Type.String({
          description: "IANA timezone (e.g., 'America/New_York')",
          default: "UTC",
        })
      ),
    }),
    async execute(_id, params) {
      return getCurrentTime({ timezone: params.timezone as string });
    },
  });

  // ── Email Tools ──

  api.registerTool(
    {
      name: "run_email_triage",
      description:
        "Triage unread emails: categorize and apply Gmail labels. Categories: to_respond, fyi, comment, notification, meeting_update, awaiting_reply, actioned, marketing.",
      parameters: Type.Object({
        limit: Type.Optional(
          Type.Number({
            description: "Max emails to triage",
            default: 20,
          })
        ),
        timeframe: Type.Optional(
          Type.String({
            description: "Gmail time filter (e.g., '1d', '3d', '1w')",
            default: "1d",
          })
        ),
        applyLabels: Type.Optional(
          Type.Boolean({
            description: "Apply Gmail labels after categorizing",
            default: true,
          })
        ),
        archiveMarketing: Type.Optional(
          Type.Boolean({
            description: "Auto-archive marketing emails",
            default: false,
          })
        ),
        dryRun: Type.Optional(
          Type.Boolean({
            description: "Preview categorization without applying labels",
            default: false,
          })
        ),
      }),
      async execute(_id, params) {
        try {
          const gmail = getGmailAdapter();
          const model = {
            async generateText(input: {
              system: string;
              user: string;
            }): Promise<{ text: string }> {
              const apiKey = process.env.GOOGLE_API_KEY;
              if (!apiKey)
                throw new Error(
                  "GOOGLE_API_KEY not set. Required for email categorization."
                );
              const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [
                      {
                        role: "user",
                        parts: [{ text: `${input.system}\n\n${input.user}` }],
                      },
                    ],
                  }),
                }
              );
              const data = (await resp.json()) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                }>;
              };
              const text =
                data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
              return { text };
            },
          };

          return await runEmailTriage(
            gmail,
            model,
            params as Parameters<typeof runEmailTriage>[2]
          );
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "list_emails",
      description:
        "Search Gmail for emails matching a query. Uses Gmail search syntax.",
      parameters: Type.Object({
        query: Type.String({
          description:
            "Gmail search query (e.g., 'is:unread', 'from:alice@example.com', 'label:To-Respond')",
        }),
        maxResults: Type.Optional(
          Type.Number({ description: "Max results", default: 10 })
        ),
      }),
      async execute(_id, params) {
        try {
          const gmail = getGmailAdapter();
          return await listEmails(
            gmail,
            params as Parameters<typeof listEmails>[1]
          );
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "read_email",
      description: "Read the full content of a specific email by ID.",
      parameters: Type.Object({
        emailId: Type.String({ description: "Gmail message ID" }),
      }),
      async execute(_id, params) {
        try {
          const gmail = getGmailAdapter();
          return await readEmail(gmail, {
            emailId: params.emailId as string,
          });
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "send_email",
      description:
        "Create an email draft in Gmail. Does NOT auto-send — the user must review and send manually.",
      parameters: Type.Object({
        to: Type.String({ description: "Recipient email address" }),
        subject: Type.String({ description: "Email subject line" }),
        body: Type.String({ description: "Email body text" }),
      }),
      async execute(_id, params) {
        try {
          const gmail = getGmailAdapter();
          return await sendEmail(
            gmail,
            params as Parameters<typeof sendEmail>[1]
          );
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "create_draft",
      description:
        "Create an email draft in Gmail. Recipient is optional for drafts you want to fill in later.",
      parameters: Type.Object({
        to: Type.Optional(
          Type.String({ description: "Recipient email address" })
        ),
        subject: Type.String({ description: "Email subject line" }),
        body: Type.String({ description: "Email body text" }),
      }),
      async execute(_id, params) {
        try {
          const gmail = getGmailAdapter();
          return await createDraft(
            gmail,
            params as Parameters<typeof createDraft>[1]
          );
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );

  // ── Follow-up Tools ──

  api.registerTool(
    {
      name: "check_follow_ups",
      description:
        "Refresh follow-up tracking by scanning Gmail labels and updating Follow-Ups.md in the vault.",
      parameters: Type.Object({}),
      async execute() {
        try {
          const config = getVaultConfig();
          const gmail = getGmailAdapter();
          const result = await refreshFollowUps(gmail, config);
          const summary = getFollowUpSummary(config.followUpsFile);
          return jsonResult({ ...result, summary });
        } catch (e) {
          return jsonResult({
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      },
    },
    { optional: true }
  );
}
