import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { createAnthropic, runAgent } from "../claude";
import { runOpenAI } from "./openai";
import { runGemini } from "./gemini";
import {
  isProviderId,
  type ProviderId,
  type ProviderRunParams,
  type RunResult,
} from "./types";

export * from "./types";

/** 既定プロバイダ（env > claude） */
export function defaultProviderId(): ProviderId {
  const env = process.env.LLM_PROVIDER;
  return isProviderId(env) ? env : "claude";
}

/** プロバイダのエラーを利用者向けの簡潔な文言に整える */
export function humanizeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b/i.test(raw)) {
    const m =
      raw.match(/retry in ([\d.]+)s/i) || raw.match(/retryDelay["':\s]+([\d.]+)s/i);
    const wait = m ? `約${Math.ceil(parseFloat(m[1]))}秒後に再試行できます。` : "";
    return `AIの利用上限（レート制限/無料枠）に達しました。${wait}少し待つか、設定でモデル/プロバイダを変更、または課金（有料枠）の有効化をご検討ください。`;
  }
  if (/invalid x-api-key|authentication_error|invalid[_ ]api[_ ]key|API key/i.test(raw)) {
    return "AI の API キーが無効です。.env.local のキー設定を確認してください。";
  }
  return raw;
}

function createOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が未設定です（.env.local を確認）");
  return new OpenAI({ apiKey });
}

function createGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です（.env.local を確認）");
  return new GoogleGenAI({ apiKey });
}

/** プロバイダを選んでエージェントループを実行する */
export async function runWithProvider(
  providerId: ProviderId,
  params: ProviderRunParams,
): Promise<RunResult> {
  switch (providerId) {
    case "openai":
      return runOpenAI({ client: createOpenAI(), ...params });
    case "gemini":
      return runGemini({ client: createGemini(), ...params });
    case "claude":
    default:
      return runAgent({ client: createAnthropic(), ...params });
  }
}
