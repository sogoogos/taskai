import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";
import { defaultProviderId } from "@/lib/llm";
import Workspace from "@/components/Workspace";
import SettingsButton from "@/components/SettingsButton";

export default async function Home() {
  const session = await getSession();
  // Cookie が残っていても DB に主アカウントが無ければ未ログイン扱い（DBリセット時の保険）
  const loggedIn = Boolean(session.userId && getUserById(session.userId));
  const defaultProvider = defaultProviderId();

  if (!loggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <h1 className="text-2xl font-bold">TaskAI</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            チャットするだけで Google カレンダーに予定を追加・編集。<br />
            体力にも配慮してアドバイスします。
          </p>
          <a
            href="/api/auth/google"
            className="mt-6 inline-block w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-medium text-white transition hover:opacity-90"
          >
            Google でログイン
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-6xl flex-col p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">TaskAI</h1>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span>{session.email}</span>
          <SettingsButton />
          <a
            href="/api/auth/google?add=1"
            className="rounded-lg border border-[var(--border)] px-3 py-1 transition hover:bg-[var(--surface-2)]"
          >
            ＋アカウント追加
          </a>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-[var(--border)] px-3 py-1 transition hover:bg-[var(--surface-2)]"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <Workspace defaultProvider={defaultProvider} />
    </main>
  );
}
