/**
 * 移動時間ツール。
 * - 車/徒歩/自転車: Google Routes API で正確な所要時間を計算。
 * - 電車(transit): Google の API は日本の公共交通に非対応のため、所要時間は計算せず
 *   「Google マップで開く経路リンク」を返す（無料・公式に許可された方法）。
 * いずれのモードでも確認用に Google マップのリンクを付与する。
 */

export type TravelMode = "transit" | "driving" | "walking" | "bicycling";

const ROUTES_MODE: Record<TravelMode, string> = {
  transit: "TRANSIT",
  driving: "DRIVE",
  walking: "WALK",
  bicycling: "BICYCLE",
};

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

export interface TravelResult {
  mode: TravelMode;
  origin: string;
  destination: string;
  durationSeconds?: number; // transit では未設定（APIで取得不可）
  durationText?: string;
  distanceMeters?: number;
  mapsUrl: string; // Google マップの経路リンク（タップで実際の所要時間を確認）
  note?: string;
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `約${m}分`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `約${h}時間` : `約${h}時間${rem}分`;
}

/** Google マップの経路リンク（公式の Maps URLs。キー不要・無料）。日本の電車経路もここで見られる。 */
export function mapsDirectionsUrl(
  origin: string,
  destination: string,
  mode: TravelMode,
): string {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: mode, // transit/driving/walking/bicycling はそのまま使える
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export async function computeTravel(params: {
  origin: string;
  destination: string;
  mode?: TravelMode;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<TravelResult> {
  const mode: TravelMode = params.mode ?? "transit";
  const mapsUrl = mapsDirectionsUrl(params.origin, params.destination, mode);

  // 電車は API で日本の経路が取れないため、リンク提示に切り替える（APIは呼ばない）
  if (mode === "transit") {
    return {
      mode,
      origin: params.origin,
      destination: params.destination,
      mapsUrl,
      note:
        "電車の所要時間は API では取得できないため、Google マップのリンク（mapsUrl）で確認してください。正確な時間が必要なら、このリンクをユーザーに提示する。車/徒歩での概算が必要なら mode を変えて再計算できる。",
    };
  }

  const apiKey = params.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY が未設定です（.env.local を確認）");
  }
  const doFetch = params.fetchImpl ?? fetch;

  const body: Record<string, unknown> = {
    origin: { address: params.origin },
    destination: { address: params.destination },
    travelMode: ROUTES_MODE[mode],
  };
  if (mode === "driving") body.routingPreference = "TRAFFIC_AWARE";

  const res = await doFetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[travel] ${res.status} ${text.slice(0, 300)}`);
    throw new Error(`Routes API エラー: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    routes?: Array<{ duration?: string; distanceMeters?: number }>;
  };
  const route = data.routes?.[0];
  if (!route?.duration) {
    throw new Error("経路が見つかりませんでした");
  }
  const durationSeconds = parseInt(route.duration.replace("s", ""), 10) || 0;

  return {
    mode,
    origin: params.origin,
    destination: params.destination,
    durationSeconds,
    durationText: formatDuration(durationSeconds),
    distanceMeters: route.distanceMeters,
    mapsUrl,
  };
}
