import { describe, it, expect } from "vitest";
import { humanizeProviderError } from "@/lib/llm";

describe("humanizeProviderError", () => {
  it("クォータ超過(429)を分かりやすい文言にする", () => {
    const raw =
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"You exceeded your quota. Please retry in 45.5s."}}';
    const msg = humanizeProviderError(new Error(raw));
    expect(msg).toContain("利用上限");
    expect(msg).toContain("46秒");
  });

  it("APIキー無効を分かりやすい文言にする", () => {
    const msg = humanizeProviderError(new Error('401 {"type":"authentication_error","message":"invalid x-api-key"}'));
    expect(msg).toContain("API キーが無効");
  });

  it("未知のエラーはそのまま返す", () => {
    const msg = humanizeProviderError(new Error("何か別のエラー"));
    expect(msg).toBe("何か別のエラー");
  });
});
