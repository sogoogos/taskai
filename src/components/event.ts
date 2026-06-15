/** UI 共通のカレンダー予定型（/api/events のレスポンス要素） */
export interface CalendarEventItem {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  recurrence?: string[];
  accountEmail?: string;
  htmlLink?: string;
}
