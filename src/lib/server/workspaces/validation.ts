import { z } from "zod";

export const workspaceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240).default(""),
    icon: z.string().trim().min(1).max(80),
    color: z.string().trim().min(1).max(32),
  })
  .strict();

export const workspaceMemberInputSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(["admin", "member"]).default("member"),
  })
  .strict();
