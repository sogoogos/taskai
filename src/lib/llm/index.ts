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
