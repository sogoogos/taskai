// アカウント（メール）ごとに安定した色を割り当てる
export const BADGE_COLORS = ["#6d8bff", "#34d399", "#f59e0b", "#f472b6", "#22d3ee"];

export function badgeColor(email?: string): string {
  if (!email) return BADGE_COLORS[0];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}
