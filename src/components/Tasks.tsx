"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

type TaskStatus = "todo" | "doing" | "done";

interface Task {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function isSameDay(ts: number | null, dateStr: string): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return s === dateStr;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
function dueLabel(due: string): string {
  const d = new Date(`${due}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

// 状態の見た目（順送り: todo → doing → done → todo）
const NEXT: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "done", done: "todo" };
const STATUS_UI: Record<TaskStatus, { mark: string; cls: string; label: string }> = {
  todo: { mark: "○", cls: "border-[var(--border)] text-[var(--muted)]", label: "未着手" },
  doing: { mark: "◐", cls: "border-amber-500 text-amber-400", label: "着手中" },
  done: { mark: "✓", cls: "border-green-500 bg-green-500 text-white", label: "完了" },
};

export default function Tasks({
  reloadSignal = 0,
  onTasksChanged,
}: {
  reloadSignal?: number;
  onTasksChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>(todayStr());
  const [scope, setScope] = useState<"today" | "all">("today");
  // インライン編集中のタスク
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const add = useCallback(async () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, dueDate: due || null }),
      });
      if (!res.ok) throw new Error();
      await load();
      onTasksChanged?.();
    } catch {
      setError("追加に失敗しました");
      setTitle(t);
    }
  }, [title, due, load, onTasksChanged]);

  const patch = useCallback(
    async (id: number, fields: Partial<Pick<Task, "status" | "title" | "dueDate" | "notes">>) => {
      // 楽観的更新
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) throw new Error();
        await load();
        onTasksChanged?.();
      } catch {
        setError("更新に失敗しました");
        await load();
      }
    },
    [load, onTasksChanged],
  );

  const remove = useCallback(
    async (id: number) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await fetch("/api/tasks", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        onTasksChanged?.();
      } catch {
        await load();
      }
    },
    [load, onTasksChanged],
  );

  const startEdit = useCallback((t: Task) => {
    setEditId(t.id);
    setEditTitle(t.title);
    setEditDue(t.dueDate ?? "");
    setEditNotes(t.notes ?? "");
  }, []);

  const cancelEdit = useCallback(() => setEditId(null), []);

  const saveEdit = useCallback(async () => {
    if (editId === null) return;
    const title = editTitle.trim();
    if (!title) return;
    const id = editId;
    setEditId(null);
    await patch(id, {
      title,
      dueDate: editDue || null,
      notes: editNotes.trim() || null,
    });
  }, [editId, editTitle, editDue, editNotes, patch]);

  const today = todayStr();
  const visible = useMemo(() => {
    if (scope === "all") return tasks;
    return tasks.filter((t) => {
      if (t.status !== "done") {
        // 期日なし・今日まで（期限切れ含む）を「今日やること」として表示
        return t.dueDate === null || t.dueDate <= today;
      }
      // 完了は当日分のみ表示（やり切った感を出す）
      return isSameDay(t.completedAt, today);
    });
  }, [tasks, scope, today]);

  const openCount = visible.filter((t) => t.status !== "done").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 追加フォーム */}
      <div className="border-b border-[var(--border)] p-3">
        <div className="flex gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // IME 変換確定の Enter（composing 中）は無視する
              if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
            }}
            placeholder="タスクを追加…"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={add}
            disabled={!title.trim()}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
          >
            追加
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span>期日</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--accent)]"
          />
          {due && (
            <button onClick={() => setDue("")} className="underline hover:text-[var(--text)]">
              期日なし
            </button>
          )}
        </div>
      </div>

      {/* 絞り込み */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex gap-1">
          {(
            [
              ["today", "今日"],
              ["all", "すべて"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition " +
                (scope === key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)]")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">残り {openCount} 件</span>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--surface-2)] disabled:opacity-40"
            aria-label="更新"
            title="更新"
          >
            ⟳
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {loading && <p className="text-xs text-[var(--muted)]">読み込み中…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="text-xs text-[var(--muted)]">
            {scope === "today" ? "今日のタスクはありません" : "タスクはありません"}
          </p>
        )}
        {visible.map((t) => {
          const ui = STATUS_UI[t.status];
          const overdue = t.status !== "done" && t.dueDate !== null && t.dueDate < today;

          if (editId === t.id) {
            return (
              <div
                key={t.id}
                className="space-y-1.5 rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] p-2.5"
              >
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  autoFocus
                  placeholder="タスク名"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  placeholder="メモ（任意）"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--accent)]"
                  />
                  {editDue && (
                    <button
                      onClick={() => setEditDue("")}
                      className="text-[11px] text-[var(--muted)] underline hover:text-[var(--text)]"
                    >
                      期日なし
                    </button>
                  )}
                  <span className="flex-1" />
                  <button
                    onClick={() => {
                      cancelEdit();
                      remove(t.id);
                    }}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                  >
                    削除
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--surface)]"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={!editTitle.trim()}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    保存
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={t.id}
              className="group flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5"
            >
              <button
                onClick={() => patch(t.id, { status: NEXT[t.status] })}
                title={`${ui.label}（タップで切替）`}
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] leading-none transition " +
                  ui.cls
                }
              >
                {ui.mark}
              </button>
              <button
                onClick={() => startEdit(t)}
                className="min-w-0 flex-1 text-left"
                title="タップで編集"
              >
                <div
                  className={
                    "text-sm " +
                    (t.status === "done" ? "text-[var(--muted)] line-through" : "")
                  }
                >
                  {t.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {t.status === "doing" && <span className="text-amber-400">着手中</span>}
                  {t.dueDate && (
                    <span className={overdue ? "text-red-400" : "text-[var(--muted)]"}>
                      {overdue ? "期限切れ " : "期日 "}
                      {dueLabel(t.dueDate)}
                    </span>
                  )}
                  {t.notes && <span className="text-[var(--muted)]">・{t.notes}</span>}
                </div>
              </button>
              <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => startEdit(t)}
                  title="編集"
                  className="text-[var(--muted)] opacity-0 transition hover:text-[var(--text)] group-hover:opacity-100"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(t.id)}
                  title="削除"
                  className="text-[var(--muted)] opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
