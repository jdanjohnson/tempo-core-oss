import {
  type GmailAdapter,
  type GmailMessage,
  sanitizeEmailContent,
} from "./gmail-adapter.js";

export type EmailCategory =
  | "to_respond"
  | "fyi"
  | "comment"
  | "notification"
  | "meeting_update"
  | "awaiting_reply"
  | "actioned"
  | "marketing";

const CATEGORY_TO_LABEL: Record<EmailCategory, string> = {
  to_respond: "To Respond",
  fyi: "FYI",
  comment: "Comment",
  notification: "Notification",
  meeting_update: "Meeting Update",
  awaiting_reply: "Awaiting Reply",
  actioned: "Actioned",
  marketing: "Marketing",
};

const ALL_CATEGORIES: EmailCategory[] = [
  "to_respond",
  "fyi",
  "comment",
  "notification",
  "meeting_update",
  "awaiting_reply",
  "actioned",
  "marketing",
];

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

export interface TriageResult {
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  category: EmailCategory;
  draftReply?: string;
}

interface ModelProvider {
  generateText(input: {
    system: string;
    user: string;
    jsonSchema?: Record<string, unknown>;
  }): Promise<{ text: string }>;
}

function buildCategorizationPrompt(
  emails: Array<{ id: string; from: string; subject: string; snippet: string }>
): string {
  const emailList = emails
    .map(
      (e, i) =>
        `[${i}] From: ${e.from}\nSubject: ${e.subject}\nSnippet: ${sanitizeEmailContent(e.snippet)}`
    )
    .join("\n\n");

  return `Categorize each email into exactly ONE of these categories:
- to_respond: requires a reply from the user
- fyi: informational, no action needed
- comment: someone commented on something (PR, doc, thread)
- notification: automated system notification
- meeting_update: calendar/meeting related
- awaiting_reply: user is waiting for someone else to respond
- actioned: already handled or resolved
- marketing: promotional, newsletter, cold outreach

For emails categorized as "to_respond", also draft a brief reply suggestion.

Return valid JSON array with objects: { "index": number, "category": string, "draft_reply": string | null }

Emails:
${emailList}`;
}

function parseCategorizationResponse(
  text: string,
  count: number
): Array<{ index: number; category: EmailCategory; draftReply: string | null }> {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    index: number;
    category: string;
    draft_reply?: string | null;
  }>;

  return parsed
    .filter((item) => item.index >= 0 && item.index < count)
    .map((item) => ({
      index: item.index,
      category: ALL_CATEGORIES.includes(item.category as EmailCategory)
        ? (item.category as EmailCategory)
        : "fyi",
      draftReply: item.draft_reply || null,
    }));
}

export async function runEmailTriage(
  gmail: GmailAdapter,
  model: ModelProvider,
  params: {
    limit?: number;
    timeframe?: string;
    applyLabels?: boolean;
    archiveMarketing?: boolean;
    dryRun?: boolean;
  }
): Promise<ToolResult> {
  const limit = params.limit || 20;
  const timeframe = params.timeframe || "1d";
  const applyLabels = params.applyLabels !== false;
  const archiveMarketing = params.archiveMarketing || false;
  const dryRun = params.dryRun || false;

  await gmail.ensureLabels();

  const query = `is:unread newer_than:${timeframe}`;
  const messages = await gmail.search(query, { limit });

  if (messages.length === 0) {
    return jsonResult({
      count: 0,
      message: "No unread emails found in the specified timeframe.",
      summary: {},
    });
  }

  const emailSummaries = messages.map((m) => ({
    id: m.id,
    from: `${m.fromName || ""} <${m.from || ""}>`.trim(),
    subject: m.subject || "(no subject)",
    snippet: m.snippet || "",
  }));

  const prompt = buildCategorizationPrompt(emailSummaries);
  const response = await model.generateText({
    system:
      "You are an email triage assistant. Categorize emails accurately. Return only valid JSON.",
    user: prompt,
  });

  const categorized = parseCategorizationResponse(
    response.text,
    messages.length
  );

  const results: TriageResult[] = [];
  const summary: Record<string, number> = {};

  for (const item of categorized) {
    const msg = messages[item.index];
    if (!msg) continue;

    const label = CATEGORY_TO_LABEL[item.category];
    summary[item.category] = (summary[item.category] || 0) + 1;

    if (!dryRun && applyLabels) {
      await gmail.applyLabel(msg.id, label);
    }

    if (
      !dryRun &&
      archiveMarketing &&
      item.category === "marketing"
    ) {
      await gmail.removeLabel(msg.id, "INBOX");
    }

    results.push({
      messageId: msg.id,
      from: msg.from || "",
      fromName: msg.fromName || "",
      subject: msg.subject || "",
      snippet: msg.snippet || "",
      category: item.category,
      draftReply: item.draftReply || undefined,
    });
  }

  return jsonResult({
    count: results.length,
    dryRun,
    summary,
    triaged: results,
  });
}

export async function listEmails(
  gmail: GmailAdapter,
  params: { query: string; maxResults?: number }
): Promise<ToolResult> {
  const messages = await gmail.search(params.query, {
    limit: params.maxResults || 10,
  });

  return jsonResult({
    count: messages.length,
    emails: messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: m.from,
      fromName: m.fromName,
      subject: m.subject,
      snippet: m.snippet,
      date: m.date,
    })),
  });
}

export async function readEmail(
  gmail: GmailAdapter,
  params: { emailId: string }
): Promise<ToolResult> {
  const msg = await gmail.read(params.emailId);

  return jsonResult({
    id: msg.id,
    threadId: msg.threadId,
    from: msg.from,
    fromName: msg.fromName,
    to: msg.to,
    subject: msg.subject,
    date: msg.date,
    body: sanitizeEmailContent(msg.body || ""),
  });
}

export async function sendEmail(
  gmail: GmailAdapter,
  params: { to: string; subject: string; body: string }
): Promise<ToolResult> {
  const result = await gmail.createDraft({
    to: params.to,
    subject: params.subject,
    body: params.body,
  });

  return jsonResult({
    created: true,
    draftId: result.draftId,
    note: "Draft created in Gmail. Review and send manually.",
  });
}

export async function createDraft(
  gmail: GmailAdapter,
  params: { to?: string; subject: string; body: string }
): Promise<ToolResult> {
  const result = await gmail.createDraft(params);

  return jsonResult({
    created: true,
    draftId: result.draftId,
    note: "Draft created in Gmail. Review and send manually.",
  });
}
