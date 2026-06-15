import { describe, it, expect, vi } from "vitest";
import { searchPlaces } from "@/lib/places";

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const samplePlaces = {
  places: [
    {
      displayName: { text: "サンプルカフェ" },
      formattedAddress: "東京都中央区銀座6-6-1",
      rating: 4.2,
      userRatingCount: 120,
      currentOpeningHours: { openNow: true },
      googleMapsUri: "https://maps.google.com/?cid=1",
    },
  ],
};

describe("searchPlaces", () => {
  it("near と query から textQuery を組み立て、ヘッダにキーを載せる", async () => {
    const fetchImpl = vi.fn(
      (_url: string, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(okResponse(samplePlaces)),
    );
    await searchPlaces({
      query: "カフェ",
      near: "東京都中央区銀座6-6-1",
      openNow: true,
      apiKey: "TEST_KEY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const init = fetchImpl.mock.calls[0][1]!;
    const body = JSON.parse(init.body as string);
    expect(body.textQuery).toContain("カフェ");
    expect(body.textQuery).toContain("銀座6-6-1");
    expect(body.openNow).toBe(true);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("TEST_KEY");
    expect(headers["X-Goog-FieldMask"]).toContain("places.displayName");
  });

  it("レスポンスを正規化して返す", async () => {
    const fetchImpl = vi.fn(async () => okResponse(samplePlaces));
    const result = await searchPlaces({
      query: "カフェ",
      apiKey: "K",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([
      {
        name: "サンプルカフェ",
        address: "東京都中央区銀座6-6-1",
        rating: 4.2,
        userRatingCount: 120,
        openNow: true,
        mapsUri: "https://maps.google.com/?cid=1",
      },
    ]);
  });

  it("API キーが無ければ例外", async () => {
    await expect(
      searchPlaces({ query: "カフェ", apiKey: undefined, fetchImpl: vi.fn() as unknown as typeof fetch }),
    ).rejects.toThrow(/GOOGLE_MAPS_API_KEY/);
  });

  it("非 ok レスポンスは例外", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: false,
        status: 403,
        text: async () => "PERMISSION_DENIED",
        json: async () => ({}),
      }) as unknown as Response,
    );
    await expect(
      searchPlaces({ query: "カフェ", apiKey: "K", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Places API エラー: 403/);
  });
});
