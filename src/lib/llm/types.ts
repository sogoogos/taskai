import type { CalendarContext } from "../calendar";

export type ProviderId = "claude" | "openai" | "gemini";

export const PROVIDER_IDS: ProviderId[] = ["claude", "openai", "gemini"];

/** クライアントが送る最小限の会話履歴（テキストのみ） */
export interface NeutralMessage {
  role: "user" | "assistant";
  content: string;
}

/** どのプロバイダでも共通の実行結果 */
export interface RunResult {
  finalText: string;
  toolCalls: { name: string; input: unknown }[];
}

/** 各プロバイダの run が受け取る共通パラメータ */
export interface ProviderRunParams {
  context: CalendarContext;
  system: string;
  history: NeutralMessage[];
  onText?: (text: string) => void;
  onTool?: (name: string, input: unknown) => void;
}

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as string[]).includes(v);
}
