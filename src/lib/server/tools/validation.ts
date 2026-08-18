import { z } from "zod";
import { toolKeys } from "../../tools/types";
import type {
  ComparisonToolConfig,
  EvaluationToolConfig,
  FormAnswerValue,
  FormToolConfig,
  IntensityToolConfig,
  ToolConfig,
  ToolKey,
  ToolResponsePayload,
  ToolUseContent,
} from "../../tools/types";

const identifier = z.string().uuid();
const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

const formFieldSchema = z
  .object({
    id: identifier,
    kind: z.enum([
      "short_text",
      "long_text",
      "single_choice",
      "multi_choice",
      "number",
      "date",
      "section",
    ]),
    label: trimmed(240),
    description: optionalText(500),
    required: z.boolean(),
    options: z.array(trimmed(120)).max(30),
  })
  .strict()
  .superRefine((field, context) => {
    const requiresOptions = ["single_choice", "multi_choice"].includes(
      field.kind,
    );
    if (requiresOptions && field.options.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Campos de seleção precisam de pelo menos duas opções.",
      });
    }
    if (field.kind === "section" && field.required) {
      context.addIssue({
        code: "custom",
        path: ["required"],
        message: "Textos de orientação não podem ser obrigatórios.",
      });
    }
  });

export const formToolConfigSchema = z
  .object({
    kind: z.literal("form"),
    instructions: optionalText(1600),
    fields: z.array(formFieldSchema).min(1).max(80),
  })
  .strict();

const evaluationScaleOptionSchema = z
  .object({ value: z.number().int().min(0).max(100), label: trimmed(80) })
  .strict();

export const evaluationToolConfigSchema = z
  .object({
    kind: z.literal("evaluation"),
    instructions: optionalText(1600),
    scale: z.array(evaluationScaleOptionSchema).min(2).max(7),
    attributes: z.array(trimmed(80)).max(30),
    commentRequired: z.boolean(),
  })
  .strict();

export const comparisonToolConfigSchema = z
  .object({
    kind: z.literal("comparison"),
    question: trimmed(240),
    instructions: optionalText(1600),
    commentRequired: z.boolean(),
  })
  .strict();

const intensityScaleSchema = z
  .object({
    id: identifier,
    leftLabel: trimmed(80),
    rightLabel: trimmed(80),
  })
  .strict();

export const intensityToolConfigSchema = z
  .object({
    kind: z.literal("intensity"),
    instructions: optionalText(1600),
    scales: z.array(intensityScaleSchema).min(1).max(40),
  })
  .strict();

export const toolConfigSchema = z.discriminatedUnion("kind", [
  formToolConfigSchema,
  evaluationToolConfigSchema,
  comparisonToolConfigSchema,
  intensityToolConfigSchema,
]);

const visualAssetSchema = z
  .object({
    id: identifier,
    fileId: identifier,
    url: z.string().regex(/^\/api\/files\/[0-9a-f-]{36}\/content$/u),
    name: trimmed(255),
  })
  .strict()
  .superRefine((asset, context) => {
    if (!asset.url.includes(asset.fileId)) {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "A URL não corresponde ao arquivo informado.",
      });
    }
  });

const evaluationItemSchema = z
  .object({
    id: identifier,
    title: trimmed(160),
    description: optionalText(800),
    assets: z.array(visualAssetSchema).max(12),
  })
  .strict();

const comparisonAlternativeSchema = z
  .object({
    id: identifier,
    title: trimmed(160),
    description: optionalText(800),
    assets: z.array(visualAssetSchema).max(12),
  })
  .strict();

export const toolUseContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("form") }).strict(),
  z
    .object({
      kind: z.literal("evaluation"),
      items: z.array(evaluationItemSchema).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("comparison"),
      alternatives: z.array(comparisonAlternativeSchema).max(12),
    })
    .strict(),
  z.object({ kind: z.literal("intensity") }).strict(),
]);

export const toolModelCreateSchema = z
  .object({
    workspaceId: identifier.optional(),
    toolKey: z.enum(toolKeys),
    name: trimmed(120),
    description: optionalText(500),
    config: toolConfigSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.toolKey !== input.config.kind) {
      context.addIssue({
        code: "custom",
        path: ["config", "kind"],
        message: "A configuração não corresponde à ferramenta escolhida.",
      });
    }
  });

export const toolModelUpdateSchema = z
  .object({
    name: trimmed(120),
    description: optionalText(500),
    config: toolConfigSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const toolUseCreateSchema = z
  .object({
    workspaceId: identifier.optional(),
    modelId: identifier,
    name: trimmed(140),
    taskId: identifier.nullable(),
    content: toolUseContentSchema,
    status: z.enum(["draft", "open"]),
  })
  .strict();

export const toolUseUpdateSchema = z
  .object({
    name: trimmed(140),
    taskId: identifier.nullable(),
    content: toolUseContentSchema,
    status: z.enum(["draft", "open", "completed", "archived"]),
    version: z.number().int().positive(),
  })
  .strict();

export const toolListQuerySchema = z
  .object({ workspaceId: identifier.optional() })
  .strict();

export const toolArchiveQuerySchema = z
  .object({ version: z.coerce.number().int().positive() })
  .strict();

const formResponseSchema = z
  .object({
    kind: z.literal("form"),
    answers: z.record(
      z.string(),
      z.union([
        z.string().max(8000),
        z.number().finite(),
        z.array(z.string().max(500)).max(30),
        z.null(),
      ]),
    ),
  })
  .strict();

const evaluationResponseSchema = z
  .object({
    kind: z.literal("evaluation"),
    reviews: z.array(
      z
        .object({
          itemId: identifier,
          rating: z.number().int().min(0).max(100),
          attributes: z.array(trimmed(80)).max(30),
          comment: optionalText(4000),
        })
        .strict(),
    ),
  })
  .strict();

const comparisonResponseSchema = z
  .object({
    kind: z.literal("comparison"),
    alternativeId: identifier,
    comment: optionalText(4000),
  })
  .strict();

const intensityResponseSchema = z
  .object({
    kind: z.literal("intensity"),
    values: z.array(
      z
        .object({
          scaleId: identifier,
          value: z.number().int().min(0).max(100).multipleOf(5),
        })
        .strict(),
    ),
  })
  .strict();

export const toolResponsePayloadSchema = z.discriminatedUnion("kind", [
  formResponseSchema,
  evaluationResponseSchema,
  comparisonResponseSchema,
  intensityResponseSchema,
]);

export const toolResponseInputSchema = z
  .object({ payload: toolResponsePayloadSchema })
  .strict();

export function isUseContentPublishable(content: ToolUseContent): boolean {
  switch (content.kind) {
    case "evaluation":
      return (
        content.items.length > 0 &&
        content.items.every(({ assets }) => assets.length > 0)
      );
    case "comparison":
      return (
        content.alternatives.length >= 2 &&
        content.alternatives.every(({ assets }) => assets.length > 0)
      );
    case "form":
    case "intensity":
      return true;
  }
}

export function visualFileIds(content: ToolUseContent): string[] {
  const ids =
    content.kind === "evaluation"
      ? content.items.flatMap(({ assets }) =>
          assets.map(({ fileId }) => fileId),
        )
      : content.kind === "comparison"
        ? content.alternatives.flatMap(({ assets }) =>
            assets.map(({ fileId }) => fileId),
          )
        : [];
  return [...new Set(ids)];
}

function filled(value: FormAnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function validFormResponse(
  config: FormToolConfig,
  payload: ToolResponsePayload,
): boolean {
  if (payload.kind !== "form") return false;
  const fields = config.fields.filter(({ kind }) => kind !== "section");
  const knownIds = new Set(fields.map(({ id }) => id));
  if (Object.keys(payload.answers).some((id) => !knownIds.has(id)))
    return false;
  return fields.every((field) => {
    const value = payload.answers[field.id];
    if (field.required && !filled(value)) return false;
    if (!filled(value)) return true;
    if (field.kind === "multi_choice") {
      return (
        Array.isArray(value) &&
        value.every((option) => field.options.includes(option))
      );
    }
    if (field.kind === "single_choice") {
      return typeof value === "string" && field.options.includes(value);
    }
    if (field.kind === "number") return typeof value === "number";
    return typeof value === "string";
  });
}

function validEvaluationResponse(
  config: EvaluationToolConfig,
  content: Extract<ToolUseContent, { kind: "evaluation" }>,
  payload: ToolResponsePayload,
): boolean {
  if (payload.kind !== "evaluation") return false;
  const itemIds = content.items.map(({ id }) => id);
  if (
    payload.reviews.length !== itemIds.length ||
    !unique(payload.reviews.map(({ itemId }) => itemId))
  ) {
    return false;
  }
  const ratings = new Set(config.scale.map(({ value }) => value));
  const attributes = new Set(config.attributes);
  return payload.reviews.every(
    (review) =>
      itemIds.includes(review.itemId) &&
      ratings.has(review.rating) &&
      review.attributes.every((attribute) => attributes.has(attribute)) &&
      (!config.commentRequired || review.comment.trim().length > 0),
  );
}

function validComparisonResponse(
  config: ComparisonToolConfig,
  content: Extract<ToolUseContent, { kind: "comparison" }>,
  payload: ToolResponsePayload,
): boolean {
  return (
    payload.kind === "comparison" &&
    content.alternatives.some(({ id }) => id === payload.alternativeId) &&
    (!config.commentRequired || payload.comment.trim().length > 0)
  );
}

function validIntensityResponse(
  config: IntensityToolConfig,
  payload: ToolResponsePayload,
): boolean {
  if (payload.kind !== "intensity") return false;
  const scaleIds = config.scales.map(({ id }) => id);
  return (
    payload.values.length === scaleIds.length &&
    unique(payload.values.map(({ scaleId }) => scaleId)) &&
    payload.values.every(
      ({ scaleId, value }) =>
        scaleIds.includes(scaleId) &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 100 &&
        value % 5 === 0,
    )
  );
}

export function responseMatchesUse(
  config: ToolConfig,
  content: ToolUseContent,
  payload: ToolResponsePayload,
): boolean {
  if (config.kind !== content.kind || payload.kind !== config.kind)
    return false;
  switch (config.kind) {
    case "form":
      return validFormResponse(config, payload);
    case "evaluation":
      return (
        content.kind === "evaluation" &&
        validEvaluationResponse(config, content, payload)
      );
    case "comparison":
      return (
        content.kind === "comparison" &&
        validComparisonResponse(config, content, payload)
      );
    case "intensity":
      return validIntensityResponse(config, payload);
  }
}

export function configMatchesTool(
  toolKey: ToolKey,
  config: ToolConfig,
): boolean {
  return toolKey === config.kind;
}
