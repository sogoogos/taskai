import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  type TaskStatus,
} from "@/lib/db";

export const runtime = "nodejs";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
function asStatus(v: unknown): TaskStatus | undefined {
  return STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : undefined;
}

/** タスク一覧 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  const tasks = await listTasks(session.userId);
  return NextResponse.json({ tasks });
}

/** タスク作成 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: {
    title?: string;
    notes?: string;
    dueDate?: string | null;
    status?: string;
    recurrence?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "タイトルが必要です" }, { status: 400 });
  }
  const task = await createTask(session.userId, {
    title,
    notes: body.notes ?? null,
    dueDate: body.dueDate ?? null,
    status: asStatus(body.status),
    recurrence: body.recurrence || null,
  });
  return NextResponse.json({ task });
}

/** タスク更新（進捗・内容） */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: {
    id?: number;
    title?: string;
    notes?: string | null;
    dueDate?: string | null;
    status?: string;
    recurrence?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }
  const updated = await updateTask(session.userId, body.id, {
    title: body.title,
    notes: body.notes,
    dueDate: body.dueDate,
    status: asStatus(body.status),
    // 空文字は繰り返し解除 → null。未指定(undefined)は据え置き。
    recurrence: body.recurrence === undefined ? undefined : body.recurrence || null,
  });
  if (!updated) {
    return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ task: updated });
}

/** タスク削除 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }
  const ok = await deleteTask(session.userId, body.id);
  if (!ok) {
    return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
