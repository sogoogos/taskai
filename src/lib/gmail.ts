import type { gmail_v1 } from "googleapis";

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string; // プレーンテキスト（長すぎる場合は切り詰め）
}

const MAX_BODY_CHARS = 1500;

function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

/** payload を再帰的に walk して text/plain を優先抽出（無ければ text/html をタグ除去） */
function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";

  const walk = (part: gmail_v1.Schema$MessagePart, wantHtml: boolean): string | null => {
    const mime = part.mimeType ?? "";
    if (!wantHtml && mime === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (wantHtml && mime === "text/html" && part.body?.data) {
      return decodeBase64Url(part.body.data)
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ");
    }
    for (const sub of part.parts ?? []) {
      const r = walk(sub, wantHtml);
      if (r) return r;
    }
    return null;
  };

  const plain = walk(payload, false);
  if (plain) return plain;
  const html = walk(payload, true);
  if (html) return html;
  // single-part の本文
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return "";
}

/**
 * Gmail を検索して要約を返す。
 * gmail クライアントを引数で受けるためテストでモック可能。
 */
export async function searchEmails(
  gmail: gmail_v1.Gmail,
  params: { query?: string; maxResults?: number },
): Promise<EmailSummary[]> {
  const maxResults = Math.min(params.maxResults ?? 10, 20);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: params.query,
    maxResults,
  });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((x): x is string => !!x);

  const results: EmailSummary[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const headers = msg.data.payload?.headers ?? undefined;
    const body = extractBody(msg.data.payload ?? undefined)
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_BODY_CHARS);
    results.push({
      id,
      subject: header(headers, "Subject"),
      from: header(headers, "From"),
      date: header(headers, "Date"),
      snippet: msg.data.snippet ?? "",
      body,
    });
  }
  return results;
}
