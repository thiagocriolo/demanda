import { z } from "zod";

const textBlock = z
  .object({ kind: z.literal("text"), text: z.string().trim().min(1).max(5000) })
  .strict();
const imageBlock = z
  .object({
    kind: z.literal("image"),
    fileId: z.string().uuid(),
    caption: z.string().trim().max(240).optional(),
  })
  .strict();
const videoBlock = z
  .object({
    kind: z.literal("video"),
    fileId: z.string().uuid(),
    caption: z.string().trim().max(240).optional(),
  })
  .strict();

export const createSocialPostSchema = z
  .object({
    kind: z.enum(["feed", "portfolio"]),
    title: z.string().trim().max(160).optional(),
    body: z.string().trim().max(5000).optional(),
    linkUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
      .optional(),
    blocks: z
      .array(z.discriminatedUnion("kind", [textBlock, imageBlock, videoBlock]))
      .max(40)
      .default([]),
  })
  .strict();

export const createCommunitySchema = z
  .object({
    linkName: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(40)
      .regex(/^[a-z0-9._-]+$/u),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    topic: z.string().trim().min(1).max(60),
    visibility: z.enum(["public", "private"]),
    coverFileId: z.string().uuid().optional(),
    memberUserIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const updateCommunityMemberSchema = z
  .object({ role: z.literal("admin") })
  .strict();

export const addCommunityMemberSchema = z
  .object({ userId: z.string().uuid() })
  .strict();

export const createSocialCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(1000),
    parentCommentId: z.string().uuid().optional(),
  })
  .strict();

export const updateSocialPostSchema = z
  .object({ body: z.string().trim().max(5000) })
  .strict();
