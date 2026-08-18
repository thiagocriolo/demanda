import { z } from "zod";
import {
  MAX_PASSWORD_CHARACTERS,
  MIN_PASSWORD_CHARACTERS,
  PASSWORD_VERIFICATION_MAX_CHARACTERS,
  validatePassword,
} from "./password";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("@") && !normalized.includes("@", 1)
    ? normalized.slice(1)
    : normalized;
}

const username = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .regex(
        USERNAME_PATTERN,
        "Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.",
      ),
  );

const email = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.string().email("Informe um e-mail válido.").max(320));

const password = z.string().superRefine((value, context) => {
  const result = validatePassword(value);
  if (!result.valid) {
    context.addIssue({ code: "custom", message: result.message });
  }
});

export const loginInputSchema = z.object({
  identifier: z
    .string()
    .transform(normalizeIdentifier)
    .pipe(z.string().min(3).max(320)),
  password: z.string().min(1).max(PASSWORD_VERIFICATION_MAX_CHARACTERS),
  remember: z.boolean(),
});

export const registrationInputSchema = z
  .object({
    username,
    email,
    password,
    passwordConfirmation: z.string(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "As senhas digitadas não coincidem.",
      });
    }
  });

export const passwordResetRequestSchema = z.object({ email });

export const passwordResetSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password,
    passwordConfirmation: z.string(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "As senhas digitadas não coincidem.",
      });
    }
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1)
      .max(PASSWORD_VERIFICATION_MAX_CHARACTERS),
    password,
    passwordConfirmation: z.string(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "As senhas digitadas não coincidem.",
      });
    }
  });

export function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revise os dados informados.";
}

export const PASSWORD_POLICY_DESCRIPTION = `Use entre ${MIN_PASSWORD_CHARACTERS} e ${MAX_PASSWORD_CHARACTERS} caracteres, com letra maiúscula, letra minúscula e número. Caracteres especiais são permitidos.`;
