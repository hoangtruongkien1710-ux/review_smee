import { z } from "zod";

const num01 = z.number().min(0).max(1);
const AnnotationSchema = z
  .object({
    shapes: z
      .array(
        z.object({
          t: z.enum(["pen", "arrow", "rect", "ellipse"]),
          c: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          w: z.number().min(0.0005).max(0.05),
          p: z.array(z.number().min(-0.2).max(1.2)).min(4).max(4000),
        }),
      )
      .min(1)
      .max(100),
  })
  .nullable()
  .optional();

export const CommentBody = z.object({
  versionId: z.string(),
  parentId: z.string().nullable().optional(),
  body: z.string().trim().min(1, "Nội dung comment trống").max(5000, "Comment quá dài"),
  timeStart: z.number().min(0).nullable().optional(),
  timeEnd: z.number().min(0).nullable().optional(),
  page: z.number().int().min(1).nullable().optional(),
  pinX: num01.nullable().optional(),
  pinY: num01.nullable().optional(),
  annotation: AnnotationSchema,
  internal: z.boolean().optional(),
});

