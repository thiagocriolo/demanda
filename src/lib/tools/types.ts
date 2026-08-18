export const toolKeys = [
  "form",
  "evaluation",
  "comparison",
  "intensity",
] as const;

export type ToolKey = (typeof toolKeys)[number];
export type ToolAvailability = "available" | "unavailable";
export type ToolModelStatus = "active" | "archived";
export type ToolUseStatus = "draft" | "open" | "completed" | "archived";

export type ToolDefinition = {
  key: ToolKey;
  name: string;
  description: string;
  iconName: string;
  availability: ToolAvailability;
  highlights: string[];
};

export type FormFieldKind =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "number"
  | "date"
  | "section";

export type FormField = {
  id: string;
  kind: FormFieldKind;
  label: string;
  description: string;
  required: boolean;
  options: string[];
};

export type FormToolConfig = {
  kind: "form";
  instructions: string;
  fields: FormField[];
};

export type EvaluationScaleOption = { value: number; label: string };

export type EvaluationToolConfig = {
  kind: "evaluation";
  instructions: string;
  scale: EvaluationScaleOption[];
  attributes: string[];
  commentRequired: boolean;
};

export type ComparisonToolConfig = {
  kind: "comparison";
  question: string;
  instructions: string;
  commentRequired: boolean;
};

export type IntensityScale = {
  id: string;
  leftLabel: string;
  rightLabel: string;
};

export type IntensityToolConfig = {
  kind: "intensity";
  instructions: string;
  scales: IntensityScale[];
};

export type ToolConfig =
  | FormToolConfig
  | EvaluationToolConfig
  | ComparisonToolConfig
  | IntensityToolConfig;

export type VisualAsset = {
  id: string;
  fileId: string;
  url: string;
  name: string;
};

export type EvaluationItem = {
  id: string;
  title: string;
  description: string;
  assets: VisualAsset[];
};

export type ComparisonAlternative = {
  id: string;
  title: string;
  description: string;
  assets: VisualAsset[];
};

export type FormUseContent = { kind: "form" };
export type EvaluationUseContent = {
  kind: "evaluation";
  items: EvaluationItem[];
};
export type ComparisonUseContent = {
  kind: "comparison";
  alternatives: ComparisonAlternative[];
};
export type IntensityUseContent = { kind: "intensity" };

export type ToolUseContent =
  | FormUseContent
  | EvaluationUseContent
  | ComparisonUseContent
  | IntensityUseContent;

export type FormAnswerValue = string | number | string[] | null;
export type FormToolResponse = {
  kind: "form";
  answers: Record<string, FormAnswerValue>;
};

export type EvaluationReview = {
  itemId: string;
  rating: number;
  attributes: string[];
  comment: string;
};
export type EvaluationToolResponse = {
  kind: "evaluation";
  reviews: EvaluationReview[];
};

export type ComparisonToolResponse = {
  kind: "comparison";
  alternativeId: string;
  comment: string;
};

export type IntensityToolResponse = {
  kind: "intensity";
  values: Array<{ scaleId: string; value: number }>;
};

export type ToolResponsePayload =
  | FormToolResponse
  | EvaluationToolResponse
  | ComparisonToolResponse
  | IntensityToolResponse;

export type ToolModel = {
  id: string;
  workspaceId: string;
  toolKey: ToolKey;
  name: string;
  description: string;
  config: ToolConfig;
  usageCount: number;
  version: number;
  createdByUserId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ToolUseContext = {
  task: { id: string; name: string };
  project: { id: string; name: string };
  business: { id: string; name: string };
};

export type ToolUse = {
  id: string;
  workspaceId: string;
  toolKey: ToolKey;
  modelId: string | null;
  modelName: string | null;
  name: string;
  configSnapshot: ToolConfig;
  content: ToolUseContent;
  taskId: string | null;
  context: ToolUseContext | null;
  status: ToolUseStatus;
  responseCount: number;
  version: number;
  createdByUserId: string;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ToolResponse = {
  id: string;
  workspaceId: string;
  useId: string;
  respondent: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  payload: ToolResponsePayload;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ToolWorkspaceSnapshot = {
  workspaceId: string;
  models: ToolModel[];
  uses: ToolUse[];
};

export type ToolModelInput = {
  workspaceId?: string;
  toolKey: ToolKey;
  name: string;
  description: string;
  config: ToolConfig;
};

export type ToolModelUpdateInput = Omit<
  ToolModelInput,
  "workspaceId" | "toolKey"
> & {
  version: number;
};

export type ToolUseInput = {
  workspaceId?: string;
  modelId: string;
  name: string;
  taskId: string | null;
  content: ToolUseContent;
  status: "draft" | "open";
};

export type ToolUseUpdateInput = {
  name: string;
  taskId: string | null;
  content: ToolUseContent;
  status: ToolUseStatus;
  version: number;
};

export function isToolKey(value: unknown): value is ToolKey {
  return toolKeys.includes(value as ToolKey);
}

export function defaultToolConfig(toolKey: ToolKey): ToolConfig {
  switch (toolKey) {
    case "form":
      return {
        kind: "form",
        instructions:
          "Responda às perguntas abaixo com o máximo de contexto possível.",
        fields: [
          {
            id: crypto.randomUUID(),
            kind: "long_text",
            label: "Conte-nos um pouco sobre o projeto",
            description: "",
            required: true,
            options: [],
          },
        ],
      };
    case "evaluation":
      return {
        kind: "evaluation",
        instructions:
          "Avalie cada referência e indique os aspectos que mais chamaram sua atenção.",
        scale: [
          { value: 1, label: "Não gostei" },
          { value: 2, label: "Gostei pouco" },
          { value: 3, label: "Achei ok" },
          { value: 4, label: "Gostei" },
          { value: 5, label: "Gostei muito" },
        ],
        attributes: ["Tipografia", "Cores", "Formas", "Composição"],
        commentRequired: false,
      };
    case "comparison":
      return {
        kind: "comparison",
        question: "Qual alternativa você prefere?",
        instructions: "Observe as alternativas lado a lado antes de escolher.",
        commentRequired: false,
      };
    case "intensity":
      return {
        kind: "intensity",
        instructions:
          "Mova cada indicador para representar a direção desejada.",
        scales: [
          {
            id: crypto.randomUUID(),
            leftLabel: "Clássico",
            rightLabel: "Moderno",
          },
        ],
      };
  }
}

export function emptyToolUseContent(toolKey: ToolKey): ToolUseContent {
  switch (toolKey) {
    case "evaluation":
      return { kind: "evaluation", items: [] };
    case "comparison":
      return { kind: "comparison", alternatives: [] };
    case "form":
      return { kind: "form" };
    case "intensity":
      return { kind: "intensity" };
  }
}
