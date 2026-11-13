import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./auth";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function route<C = any>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, {
        // BigInt không serialize được bằng JSON mặc định
      });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: e.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
    }
  };
}

export async function parse<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, "Dữ liệu gửi lên không hợp lệ");
  }
  return schema.parse(data);
}

export const bad = (msg: string): never => {
  throw new HttpError(400, msg);
};
