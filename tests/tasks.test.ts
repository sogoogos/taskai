// in-memory libSQL を使うため、import より前に環境変数を設定
process.env.TURSO_DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll } from "vitest";
import {
  upsertUser,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  getTask,
} from "@/lib/db";
import { executeTool } from "@/lib/tools";

/** テスト用ユーザーを作成して id を返す（tasks の FK を満たすため） */
async function makeUser(email: string): Promise<number> {
  return upsertUser({ email, accessToken: null, refreshToken: null, expiryDate: null });
}

describe("タスク DB CRUD", () => {
  it("作成→一覧→更新→削除のライフサイクル", async () => {
    const U = await makeUser("crud@example.com");
    const created = await createTask(U, { title: "請求書を送る", dueDate: "2026-06-16" });
    expect(created.title).toBe("請求書を送る");
    expect(created.status).toBe("todo");
    expect(created.completedAt).toBeNull();

    const list1 = await listTasks(U);
    expect(list1.map((t) => t.title)).toContain("請求書を送る");

    const done = await updateTask(U, created.id, { status: "done" });
    expect(done?.status).toBe("done");
    expect(done?.completedAt).not.toBeNull();

    // 未着手に戻すと completedAt はクリア
    const back = await updateTask(U, created.id, { status: "todo" });
    expect(back?.completedAt).toBeNull();

    const ok = await deleteTask(U, created.id);
    expect(ok).toBe(true);
    expect(await getTask(U, created.id)).toBeUndefined();
  });

  it("一覧は未完了→完了の順、期日昇順に並ぶ", async () => {
    const u = await makeUser("order@example.com");
    await createTask(u, { title: "B", dueDate: "2026-06-20" });
    await createTask(u, { title: "A", dueDate: "2026-06-18" });
    const c = await createTask(u, { title: "完了済み", dueDate: "2026-06-01" });
    await updateTask(u, c.id, { status: "done" });

    const list = await listTasks(u);
    expect(list.map((t) => t.title)).toEqual(["A", "B", "完了済み"]);
  });

  it("他人のタスクは更新・削除できない（user_id でスコープ）", async () => {
    const owner = await makeUser("owner@example.com");
    const other = await makeUser("other@example.com");
    const t = await createTask(owner, { title: "秘密" });
    expect(await updateTask(other, t.id, { status: "done" })).toBeUndefined();
    expect(await deleteTask(other, t.id)).toBe(false);
    // 本人のデータは無事
    expect((await getTask(owner, t.id))?.status).toBe("todo");
  });

  it("dueDate を null にすると期日なしになる", async () => {
    const u = await makeUser("due@example.com");
    const t = await createTask(u, { title: "いつか", dueDate: "2026-07-01" });
    const updated = await updateTask(u, t.id, { dueDate: null });
    expect(updated?.dueDate).toBeNull();
  });

  it("繰り返しタスクを完了にすると、完了せず期日が次回へ繰り上がる", async () => {
    const u = await makeUser("recur@example.com");
    const t = await createTask(u, {
      title: "給与振込期限",
      dueDate: "2026-06-25",
      recurrence: "RRULE:FREQ=MONTHLY;BYMONTHDAY=25",
    });
    expect(t.recurrence).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=25");

    const after = await updateTask(u, t.id, { status: "done" });
    // 完了にはならず未着手のまま、期日だけ翌月へ
    expect(after?.status).toBe("todo");
    expect(after?.completedAt).toBeNull();
    expect(after?.dueDate).toBe("2026-07-25");
    expect(after?.recurrence).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=25");
  });

  it("繰り返しを空文字で解除すると、完了が通常どおり効く", async () => {
    const u = await makeUser("recur-off@example.com");
    const t = await createTask(u, {
      title: "毎日タスク",
      dueDate: "2026-06-22",
      recurrence: "RRULE:FREQ=DAILY",
    });
    const off = await updateTask(u, t.id, { recurrence: null });
    expect(off?.recurrence).toBeNull();
    const done = await updateTask(u, t.id, { status: "done" });
    expect(done?.status).toBe("done");
    expect(done?.completedAt).not.toBeNull();
  });
});

describe("executeTool タスク系", () => {
  let ctx: never;

  beforeAll(async () => {
    const uid = await makeUser("tool@example.com");
    ctx = { accounts: [], userId: uid } as never;
  });

  it("create_task → list_tasks → update_task → delete_task", async () => {
    const created = (await executeTool(ctx, "create_task", {
      title: "メール返信",
      dueDate: "2026-06-16",
    })) as { id: number; status: string };
    expect(created.status).toBe("todo");

    const listed = (await executeTool(ctx, "list_tasks", {})) as { id: number }[];
    expect(listed.some((t) => t.id === created.id)).toBe(true);

    const updated = (await executeTool(ctx, "update_task", {
      id: created.id,
      status: "doing",
    })) as { status: string };
    expect(updated.status).toBe("doing");

    const del = (await executeTool(ctx, "delete_task", { id: created.id })) as {
      deleted: boolean;
    };
    expect(del.deleted).toBe(true);
  });

  it("update_task で dueDate に 'null' 文字列を渡すと期日なしになる", async () => {
    const t = (await executeTool(ctx, "create_task", {
      title: "x",
      dueDate: "2026-06-20",
    })) as { id: number };
    const updated = (await executeTool(ctx, "update_task", {
      id: t.id,
      dueDate: "null",
    })) as { dueDate: string | null };
    expect(updated.dueDate).toBeNull();
  });

  it("存在しないタスクの更新はエラー", async () => {
    await expect(
      executeTool(ctx, "update_task", { id: 999999, status: "done" }),
    ).rejects.toThrow(/見つかりません/);
  });

  it("userId が無いコンテキストではタスク操作はエラー", async () => {
    const noUser = { accounts: [] } as never;
    await expect(executeTool(noUser, "list_tasks", {})).rejects.toThrow(
      /ログインが必要/,
    );
  });
});
