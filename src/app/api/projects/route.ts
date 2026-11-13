import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { randomColor } from "@/lib/utils";

const Body = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên project").max(120),
  description: z.string().max(1000).default(""),
});

export const POST = route(async (req) => {
  const me = await requireUser();
  if (me.role === "CLIENT") throw new HttpError(403, "Khách hàng không tạo được project");
  const b = await parse(req, Body);
  const p = await prisma.project.create({
    data: {
      name: b.name,
      description: b.description,
      color: randomColor(),
      createdById: me.id,
      members: { create: { userId: me.id, role: "MANAGER" } },
    },
  });
  return { id: p.id };
});
