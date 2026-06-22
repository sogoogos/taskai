/**
 * タスクの繰り返し（RRULE のサブセット）。
 * 予定(Googleカレンダー)と表記を合わせるため RRULE 文字列で保持するが、
 * 次回の期日はアプリ側で計算する必要があるため、よく使う範囲だけを解釈する。
 *
 * 対応: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY(週次), BYMONTHDAY(月次)
 * 例: 毎月25日 = RRULE:FREQ=MONTHLY;BYMONTHDAY=25
 *     毎日     = RRULE:FREQ=DAILY
 *     毎週月水 = RRULE:FREQ=WEEKLY;BYDAY=MO,WE
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ParsedRecurrence {
  freq: Freq;
  interval: number; // >=1
  byDay: number[]; // 0=日..6=土（週次）
  byMonthDay: number | null; // 1..31（月次）
}

// RRULE の BYDAY コード → JS の getUTCDay()（0=日）
const DAY_CODE: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};
const DAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

/** RRULE 文字列を解釈する。解釈できなければ null。 */
export function parseRecurrence(rule: string | null | undefined): ParsedRecurrence | null {
  if (!rule) return null;
  // 先頭の "RRULE:" は任意。複数行(改行区切り)なら先頭の RRULE 行だけ見る。
  const line =
    rule
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const body = line.replace(/^RRULE:/i, "");
  const parts = new Map<string, string>();
  for (const seg of body.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.trim().toUpperCase(), v.trim());
  }
  const freqRaw = parts.get("FREQ")?.toUpperCase();
  if (freqRaw !== "DAILY" && freqRaw !== "WEEKLY" && freqRaw !== "MONTHLY" && freqRaw !== "YEARLY") {
    return null;
  }
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? "1") || 1);
  const byDay = (parts.get("BYDAY") ?? "")
    .split(",")
    .map((c) => DAY_CODE[c.trim().toUpperCase().slice(-2)])
    .filter((n): n is number => n !== undefined);
  const monthDayRaw = parts.get("BYMONTHDAY");
  const byMonthDay = monthDayRaw ? Number(monthDayRaw) || null : null;
  return { freq: freqRaw, interval, byDay, byMonthDay };
}

/** 'YYYY-MM-DD' → UTC ミリ秒（時刻成分は持たない） */
function ymdToUTC(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcToYMD(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/**
 * 現在の期日(YYYY-MM-DD)を起点に、ルールに沿った「次回の期日」を返す。
 * from より厳密に後の日付を返す。計算できなければ null。
 */
export function nextOccurrence(rule: string | null | undefined, from: string): string | null {
  const r = parseRecurrence(rule);
  if (!r) return null;
  const fromMs = ymdToUTC(from);
  if (fromMs === null) return null;

  switch (r.freq) {
    case "DAILY":
      return utcToYMD(fromMs + r.interval * DAY_MS);

    case "WEEKLY": {
      if (r.byDay.length === 0) {
        return utcToYMD(fromMs + r.interval * 7 * DAY_MS);
      }
      // from の翌日から走査し、曜日が一致する最初の日を探す。
      // INTERVAL>1 は「from の週から interval 週間隔」のみ採用する。
      const set = new Set(r.byDay);
      const fromWeek = Math.floor(fromMs / DAY_MS / 7); // 週インデックス（木曜起点の単純な区切り）
      for (let i = 1; i <= 7 * r.interval + 7; i++) {
        const ms = fromMs + i * DAY_MS;
        const dow = new Date(ms).getUTCDay();
        if (!set.has(dow)) continue;
        const week = Math.floor(ms / DAY_MS / 7);
        if ((week - fromWeek) % r.interval === 0) return utcToYMD(ms);
      }
      return null;
    }

    case "MONTHLY": {
      const d = new Date(fromMs);
      const targetDay = r.byMonthDay ?? d.getUTCDate();
      let year = d.getUTCFullYear();
      let month0 = d.getUTCMonth() + r.interval;
      year += Math.floor(month0 / 12);
      month0 = ((month0 % 12) + 12) % 12;
      const day = Math.min(targetDay, daysInMonth(year, month0));
      return utcToYMD(Date.UTC(year, month0, day));
    }

    case "YEARLY": {
      const d = new Date(fromMs);
      const year = d.getUTCFullYear() + r.interval;
      const month0 = d.getUTCMonth();
      const day = Math.min(d.getUTCDate(), daysInMonth(year, month0));
      return utcToYMD(Date.UTC(year, month0, day));
    }
  }
}

/** 表示用の日本語ラベル（例: 毎月25日 / 毎週月・水 / 2日ごと） */
export function describeRecurrence(rule: string | null | undefined): string | null {
  const r = parseRecurrence(rule);
  if (!r) return null;
  const every = r.interval > 1;
  switch (r.freq) {
    case "DAILY":
      return every ? `${r.interval}日ごと` : "毎日";
    case "WEEKLY": {
      const days =
        r.byDay.length > 0
          ? r.byDay
              .slice()
              .sort((a, b) => a - b)
              .map((n) => DAY_LABEL[n])
              .join("・")
          : "";
      const head = every ? `${r.interval}週ごと` : "毎週";
      return days ? `${head}${days}` : head;
    }
    case "MONTHLY": {
      const head = every ? `${r.interval}か月ごと` : "毎月";
      return r.byMonthDay ? `${head}${r.byMonthDay}日` : head;
    }
    case "YEARLY":
      return every ? `${r.interval}年ごと` : "毎年";
  }
}
