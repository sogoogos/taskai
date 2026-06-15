import { describe, it, expect, vi } from "vitest";
import { computeTravel } from "@/lib/travel";

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("computeTravel", () => {
  it("origin/destination/mode を Routes API に渡し、所要時間を整形する", async () => {
    const fetchImpl = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(okResponse({ routes: [{ duration: "1500s", distanceMeters: 8200 }] })),
    );
    const result = await computeTravel({
      origin: "東京都中央区銀座6-6-1",
      destination: "渋谷駅",
      mode: "transit",
      apiKey: "K",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const init = fetchImpl.mock.calls[0][1]!;
    const body = JSON.parse(init.body as string);
    expect(body.origin.address).toContain("銀座");
    expect(body.destination.address).toBe("渋谷駅");
    expect(body.travelMode).toBe("TRANSIT");
    expect(result.durationSeconds).toBe(1500);
    expect(result.durationText).toBe("約25分");
    expect(result.distanceMeters).toBe(8200);
  });

  it("driving では TRAFFIC_AWARE を付け、1時間超は時間表記", async () => {
    const fetchImpl = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(okResponse({ routes: [{ duration: "4500s" }] })),
    );
    const result = await computeTravel({
      origin: "A",
      destination: "B",
      mode: "driving",
      apiKey: "K",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse((fetchImpl.mock.calls[0][1]!).body as string);
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(result.durationText).toBe("約1時間15分");
  });

  it("API キーが無ければ例外", async () => {
    await expect(
      computeTravel({ origin: "A", destination: "B", apiKey: undefined, fetchImpl: vi.fn() as unknown as typeof fetch }),
    ).rejects.toThrow(/GOOGLE_MAPS_API_KEY/);
  });

  it("経路が無ければ例外", async () => {
    const fetchImpl = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(okResponse({ routes: [] })),
    );
    await expect(
      computeTravel({ origin: "A", destination: "B", mode: "driving", apiKey: "K", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/経路が見つかりません/);
  });

  it("transit は departureTime を付け、空なら日本の公共交通制約を案内する", async () => {
    const fetchImpl = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(okResponse({ routes: [] })),
    );
    await expect(
      computeTravel({ origin: "東京駅", destination: "渋谷駅", mode: "transit", apiKey: "K", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/公共交通/);
    const body = JSON.parse((fetchImpl.mock.calls[0][1]!).body as string);
    expect(body.travelMode).toBe("TRANSIT");
    expect(body.departureTime).toBeTruthy();
  });
});
