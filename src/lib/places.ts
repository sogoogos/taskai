/** Google Places API (New) Text Search で場所を検索する薄いラッパ。 */

export interface PlaceResult {
  name: string;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  mapsUri?: string;
}

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours.openNow",
  "places.googleMapsUri",
].join(",");

export async function searchPlaces(params: {
  query: string;
  near?: string;
  openNow?: boolean;
  maxResults?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<PlaceResult[]> {
  const apiKey = params.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY が未設定です（.env.local を確認）");
  }
  const doFetch = params.fetchImpl ?? fetch;
  const textQuery = params.near
    ? `${params.near} 周辺の ${params.query}`
    : params.query;

  const res = await doFetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: params.maxResults ?? 8,
      ...(params.openNow ? { openNow: true } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Places API エラー: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      currentOpeningHours?: { openNow?: boolean };
      googleMapsUri?: string;
    }>;
  };

  return (data.places ?? []).map((p) => ({
    name: p.displayName?.text ?? "(無名)",
    address: p.formattedAddress,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    openNow: p.currentOpeningHours?.openNow,
    mapsUri: p.googleMapsUri,
  }));
}
