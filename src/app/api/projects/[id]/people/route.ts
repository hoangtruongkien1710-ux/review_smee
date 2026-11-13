import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requireProject } from "@/lib/access";
import { projectPeople } from "@/lib/comments";

type Ctx = { params: Promise<{ id: string }> };

/** Danh sách người nhắc tên được (@) trong project. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await requireProject(me, id);
  return { people: await projectPeople(id) };
});
