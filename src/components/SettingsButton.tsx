"use client";

import { useState, useCallback } from "react";

/** ヘッダの⚙ボタン → プロフィール（自宅住所・状況メモ）編集モーダル */
export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [homeAddress, setHomeAddress] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const openModal = useCallback(async () => {
    setOpen(true);
    setSavedMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setHomeAddress(data.profile?.homeAddress ?? "");
        setNote(data.profile?.note ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeAddress, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `保存に失敗しました (${res.status})`);
      }
      setSavedMsg("保存しました");
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [homeAddress, note]);

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-lg border border-[var(--border)] px-3 py-1 transition hover:bg-[var(--surface-2)]"
        aria-label="設定"
      >
        ⚙ 設定
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">プロフィール設定</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-[var(--muted)]">読み込み中…</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-[var(--muted)]">
                    自宅住所（移動時間の計算に使います）
                  </label>
                  <input
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    placeholder="例: 東京都中央区銀座6-6-1"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--muted)]">
                    状況メモ（あなたの状況・好み。アシスタントが考慮します）
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    placeholder="例: 平日は9-18時が仕事。移動は基本電車。夜の会食は週2回まで。集中作業は午前が得意。"
                    className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  {savedMsg && (
                    <span className="text-xs text-[var(--muted)]">{savedMsg}</span>
                  )}
                  <button
                    onClick={save}
                    disabled={saving}
                    className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
