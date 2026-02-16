import * as fs from "fs";
import { type GmailAdapter, type GmailMessage } from "./gmail-adapter.js";
import { type VaultConfig } from "./vault-sync.js";

export interface FollowUp {
  type: "needs_reply" | "awaiting_reply" | "needs_action";
  subject: string;
  from?: string;
  to?: string;
  messageId: string;
  threadId?: string;
  date: string;
  daysAgo: number;
  overdue: boolean;
}

const OVERDUE_THRESHOLDS: Record<FollowUp["type"], number> = {
  needs_reply: 1,
  awaiting_reply: 3,
  needs_action: 2,
};

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(type: FollowUp["type"], dateStr: string): boolean {
  return daysAgo(dateStr) > OVERDUE_THRESHOLDS[type];
}

export async function refreshFollowUps(
  gmail: GmailAdapter,
  config: VaultConfig
): Promise<{ pending: number; resolved: number; overdue: number }> {
  const followUps: FollowUp[] = [];

  const toRespondMessages = await gmail.search("label:To-Respond", {
    limit: 50,
  });
  for (const msg of toRespondMessages) {
    const days = daysAgo(msg.date || new Date().toISOString());
    const type = "needs_reply" as const;
    followUps.push({
      type,
      subject: msg.subject || "(no subject)",
      from: `${msg.fromName || ""} <${msg.from || ""}>`.trim(),
      messageId: msg.id,
      threadId: msg.threadId,
      date: msg.date || new Date().toISOString(),
      daysAgo: days,
      overdue: isOverdue(type, msg.date || new Date().toISOString()),
    });
  }

  const awaitingMessages = await gmail.search("label:Awaiting-Reply", {
    limit: 50,
  });
  for (const msg of awaitingMessages) {
    const days = daysAgo(msg.date || new Date().toISOString());
    const type = "awaiting_reply" as const;
    followUps.push({
      type,
      subject: msg.subject || "(no subject)",
      to: msg.to || "",
      messageId: msg.id,
      threadId: msg.threadId,
      date: msg.date || new Date().toISOString(),
      daysAgo: days,
      overdue: isOverdue(type, msg.date || new Date().toISOString()),
    });
  }

  const pending = followUps.filter((f) => !f.overdue).length;
  const overdue = followUps.filter((f) => f.overdue).length;

  writeFollowUpsFile(config.followUpsFile, followUps);

  return { pending, resolved: 0, overdue };
}

function writeFollowUpsFile(filePath: string, followUps: FollowUp[]): void {
  const needsReply = followUps.filter((f) => f.type === "needs_reply");
  const awaitingReply = followUps.filter((f) => f.type === "awaiting_reply");
  const needsAction = followUps.filter((f) => f.type === "needs_action");

  const lines: string[] = [
    "---",
    `updated_at: ${new Date().toISOString()}`,
    "---",
    "",
    "## Needs Reply",
    "",
  ];

  for (const f of needsReply) {
    const overdueTag = f.overdue ? " ⚠️ overdue" : "";
    lines.push(
      `- [ ] **${f.subject}** from ${f.from} — ${f.daysAgo} day${f.daysAgo !== 1 ? "s" : ""} ago${overdueTag}`
    );
  }

  lines.push("", "## Awaiting Reply", "");

  for (const f of awaitingReply) {
    const overdueTag = f.overdue ? " ⚠️ overdue" : "";
    lines.push(
      `- [ ] **${f.subject}** to ${f.to} — sent ${f.daysAgo} day${f.daysAgo !== 1 ? "s" : ""} ago${overdueTag}`
    );
  }

  lines.push("", "## Needs Action", "");

  for (const f of needsAction) {
    const overdueTag = f.overdue ? " ⚠️ overdue" : "";
    lines.push(
      `- [ ] **${f.subject}** — ${f.daysAgo} day${f.daysAgo !== 1 ? "s" : ""} ago${overdueTag}`
    );
  }

  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

export function readFollowUpsFromVault(
  followUpsPath: string
): { needsReply: number; awaitingReply: number; needsAction: number; overdue: number } {
  if (!fs.existsSync(followUpsPath)) {
    return { needsReply: 0, awaitingReply: 0, needsAction: 0, overdue: 0 };
  }

  const content = fs.readFileSync(followUpsPath, "utf-8");
  const lines = content.split("\n");
  let section = "";
  let needsReply = 0;
  let awaitingReply = 0;
  let needsAction = 0;
  let overdue = 0;

  for (const line of lines) {
    if (line.startsWith("## Needs Reply")) {
      section = "needs_reply";
    } else if (line.startsWith("## Awaiting Reply")) {
      section = "awaiting_reply";
    } else if (line.startsWith("## Needs Action")) {
      section = "needs_action";
    } else if (line.startsWith("- [ ]")) {
      if (section === "needs_reply") needsReply++;
      else if (section === "awaiting_reply") awaitingReply++;
      else if (section === "needs_action") needsAction++;
      if (line.includes("overdue")) overdue++;
    }
  }

  return { needsReply, awaitingReply, needsAction, overdue };
}

export function getFollowUpSummary(
  followUpsPath: string
): string {
  const stats = readFollowUpsFromVault(followUpsPath);
  const parts: string[] = [];
  if (stats.needsReply > 0)
    parts.push(`${stats.needsReply} need${stats.needsReply === 1 ? "s" : ""} reply`);
  if (stats.awaitingReply > 0)
    parts.push(`${stats.awaitingReply} awaiting reply`);
  if (stats.needsAction > 0)
    parts.push(`${stats.needsAction} need${stats.needsAction === 1 ? "s" : ""} action`);
  if (stats.overdue > 0)
    parts.push(`${stats.overdue} overdue`);

  if (parts.length === 0) return "No pending follow-ups.";
  return parts.join(", ");
}
