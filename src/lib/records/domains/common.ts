import type { EntityFieldOption, EntityRecord } from "../../entities/types";
import type { EntityCardItem } from "../../ui/entity-card";
import type { FilterOption } from "../../ui/FilterBar.svelte";
import type { RecordsListRequest, RecordsTabConfig } from "../types";

const toneColors: Record<NonNullable<EntityFieldOption["tone"]>, string> = {
  blue: "#2e56ff",
  green: "#5dac83",
  amber: "#f59e0b",
  red: "#dc2626",
  violet: "#7c5ce5",
  gray: "#64748b",
};

export function archivedMode(
  request: Pick<RecordsListRequest, "filter" | "showArchived">,
): "exclude" | "include" | "only" {
  return request.filter === "arquivado"
    ? "only"
    : request.showArchived
      ? "include"
      : "exclude";
}

export function configuredStatusOptions(
  config: RecordsTabConfig,
): EntityFieldOption[] {
  return (
    config.config.fields.find((field) => field.name === config.statusField)
      ?.options ?? []
  );
}

export function baseCard(
  config: RecordsTabConfig,
  record: EntityRecord,
): Pick<EntityCardItem, "id" | "kind" | "title" | "status" | "statusColor"> {
  const statusValue = record[config.statusField] ?? "";
  const option = configuredStatusOptions(config).find(
    (candidate) => candidate.value === statusValue,
  );
  return {
    id: record.id,
    kind: config.kind,
    title: record.nome || `${config.emptyLabel} sem nome`,
    status: option?.label ?? (statusValue || "Sem status"),
    statusColor: option?.tone ? toneColors[option.tone] : toneColors.gray,
  };
}

export function dynamicStatusFilterOptions(
  config: RecordsTabConfig,
  counts: Record<string, number>,
  all: number,
  archived: number,
  archivedLabel: string,
): FilterOption[] {
  const configured = configuredStatusOptions(config);
  const configuredValues = new Set(configured.map(({ value }) => value));
  const dynamic = Object.keys(counts)
    .filter((value) => !configuredValues.has(value))
    .sort((left, right) => left.localeCompare(right, "pt-BR"))
    .map((value) => ({ value, label: value }));
  const archivedOption =
    archived > 0 && !configuredValues.has("arquivado")
      ? [{ value: "arquivado", label: archivedLabel }]
      : [];

  return [
    { value: "todos", label: "Todos", count: all },
    ...[...configured, ...dynamic, ...archivedOption].map((option) => ({
      value: option.value,
      label: option.label,
      count:
        option.value === "arquivado" ? archived : (counts[option.value] ?? 0),
    })),
  ];
}
