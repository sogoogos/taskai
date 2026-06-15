/** Google Routes API (computeRoutes) で2地点間の移動時間を計算する薄いラッパ。 */

export type TravelMode = "transit" | "driving" | "walking" | "bicycling";

const MODE_MAP: Record<TravelMode, string> = {
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
  durationSeconds: number;
  durationText: string;
  distanceMeters?: number;
}

function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `約${m}分`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `約${h}時間` : `約${h}時間${rem}分`;
}

export async function computeTravel(params: {
  origin: string;
  destination: string;
  mode?: TravelMode;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<TravelResult> {
  const apiKey = params.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY が未設定です（.env.local を確認）");
  }
  const mode: TravelMode = params.mode ?? "transit";
  const doFetch = params.fetchImpl ?? fetch;

  const body: Record<string, unknown> = {
    origin: { address: params.origin },
    destination: { address: params.destination },
    travelMode: MODE_MAP[mode],
  };
  // 車のみ交通状況を考慮（TRANSIT/WALK/BICYCLE では指定不可）
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
  // duration は "1234s" 形式
  const durationSeconds = parseInt(route.duration.replace("s", ""), 10) || 0;

  return {
    mode,
    origin: params.origin,
    destination: params.destination,
    durationSeconds,
    durationText: formatDuration(durationSeconds),
    distanceMeters: route.distanceMeters,
  };
}
