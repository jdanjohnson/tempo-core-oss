import { google, type gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export interface GmailMessage {
  id: string;
  threadId?: string;
  from?: string;
  fromName?: string;
  to?: string;
  subject?: string;
  snippet?: string;
  date?: string;
  body?: string;
  labels?: string[];
}

export interface GmailAdapter {
  search(query: string, opts: { limit: number }): Promise<GmailMessage[]>;
  read(messageId: string): Promise<GmailMessage>;
  applyLabel(messageId: string, label: string): Promise<void>;
  removeLabel(messageId: string, label: string): Promise<void>;
  createDraft(params: {
    to?: string;
    subject: string;
    body: string;
  }): Promise<{ draftId: string }>;
  ensureLabels(): Promise<void>;
}

const CATEGORY_LABELS = [
  "To Respond",
  "FYI",
  "Comment",
  "Notification",
  "Meeting Update",
  "Awaiting Reply",
  "Actioned",
  "Marketing",
];

function parseHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const h = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2] };
  }
  return { name: "", email: raw.trim() };
}

function decodeBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64url").toString(
          "utf-8"
        );
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = decodeBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

export function createGmailAdapter(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): GmailAdapter {
  const oauth2Client = new OAuth2Client(
    config.clientId,
    config.clientSecret
  );
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const labelCache: Map<string, string> = new Map();

  async function getLabelId(labelName: string): Promise<string | null> {
    if (labelCache.has(labelName)) {
      return labelCache.get(labelName)!;
    }
    const res = await gmail.users.labels.list({ userId: "me" });
    const labels = res.data.labels || [];
    for (const label of labels) {
      if (label.name && label.id) {
        labelCache.set(label.name, label.id);
      }
    }
    return labelCache.get(labelName) || null;
  }

  async function createLabel(labelName: string): Promise<string> {
    const res = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    const id = res.data.id!;
    labelCache.set(labelName, id);
    return id;
  }

  return {
    async search(
      query: string,
      opts: { limit: number }
    ): Promise<GmailMessage[]> {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: opts.limit,
      });

      const messageIds = res.data.messages || [];
      const messages: GmailMessage[] = [];

      for (const msg of messageIds) {
        if (!msg.id) continue;
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = detail.data.payload?.headers;
        const fromRaw = parseHeader(headers, "From");
        const parsed = parseEmailAddress(fromRaw);

        messages.push({
          id: msg.id,
          threadId: detail.data.threadId || undefined,
          from: parsed.email,
          fromName: parsed.name,
          to: parseHeader(headers, "To"),
          subject: parseHeader(headers, "Subject"),
          snippet: detail.data.snippet || "",
          date: parseHeader(headers, "Date"),
          labels: detail.data.labelIds || [],
        });
      }

      return messages;
    },

    async read(messageId: string): Promise<GmailMessage> {
      const res = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const headers = res.data.payload?.headers;
      const fromRaw = parseHeader(headers, "From");
      const parsed = parseEmailAddress(fromRaw);
      const body = decodeBody(res.data.payload || undefined);

      return {
        id: messageId,
        threadId: res.data.threadId || undefined,
        from: parsed.email,
        fromName: parsed.name,
        to: parseHeader(headers, "To"),
        subject: parseHeader(headers, "Subject"),
        snippet: res.data.snippet || "",
        date: parseHeader(headers, "Date"),
        body,
        labels: res.data.labelIds || [],
      };
    },

    async applyLabel(messageId: string, label: string): Promise<void> {
      let labelId = await getLabelId(label);
      if (!labelId) {
        labelId = await createLabel(label);
      }
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });
    },

    async removeLabel(messageId: string, label: string): Promise<void> {
      const labelId = await getLabelId(label);
      if (!labelId) return;
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });
    },

    async createDraft(params: {
      to?: string;
      subject: string;
      body: string;
    }): Promise<{ draftId: string }> {
      const messageParts = [
        `Subject: ${params.subject}`,
        "Content-Type: text/plain; charset=utf-8",
      ];
      if (params.to) {
        messageParts.splice(0, 0, `To: ${params.to}`);
      }
      messageParts.push("", params.body);
      const raw = Buffer.from(messageParts.join("\r\n")).toString("base64url");

      const res = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw },
        },
      });

      return { draftId: res.data.id || "" };
    },

    async ensureLabels(): Promise<void> {
      const res = await gmail.users.labels.list({ userId: "me" });
      const existing = new Set(
        (res.data.labels || []).map((l) => l.name)
      );
      for (const label of CATEGORY_LABELS) {
        if (!existing.has(label)) {
          await createLabel(label);
        }
      }
    },
  };
}

export function sanitizeEmailContent(content: string): string {
  return `<untrusted_email_data>\n${content}\n</untrusted_email_data>`;
}
