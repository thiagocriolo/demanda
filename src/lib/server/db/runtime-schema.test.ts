import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Database } from "./database";
import { applyRuntimeSchema } from "./runtime-schema";

type FakeCatalog = {
  tables: Set<string>;
  columns: Set<string>;
  columnExtras?: Map<string, string>;
  indexes: Set<string>;
  foreignKeys: Set<string>;
  rejectVirtualInstitutionalIndex?: boolean;
  rejectStoredInstitutionalColumn?: boolean;
};

function flattenSql(query: SQL): { text: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if ("value" in node && Array.isArray((node as { value: unknown }).value)) {
      parts.push((node as { value: string[] }).value.join(""));
      return;
    }
    if (
      "queryChunks" in node &&
      Array.isArray((node as { queryChunks: unknown[] }).queryChunks)
    ) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) {
        if (
          chunk &&
          typeof chunk === "object" &&
          ("value" in chunk || "queryChunks" in chunk)
        ) {
          visit(chunk);
        } else {
          parts.push("?");
          params.push(chunk);
        }
      }
    }
  }

  visit(query);
  return { text: parts.join(""), params };
}

function createFakeDatabase(catalog: FakeCatalog) {
  const executed: Array<{ text: string; params: unknown[] }> = [];

  const database = {
    async execute(query: SQL) {
      const { text, params } = flattenSql(query);
      const normalized = text.replace(/\s+/g, " ").trim();
      executed.push({ text: normalized, params });

      if (normalized.includes("select extra from information_schema.columns")) {
        const key = `${String(params[0])}.${String(params[1])}`;
        return [[{ extra: catalog.columnExtras?.get(key) ?? "" }]];
      }
      if (normalized.includes("from information_schema.columns")) {
        const key = `${String(params[0])}.${String(params[1])}`;
        return [catalog.columns.has(key) ? [{ present: 1 }] : []];
      }
      if (normalized.includes("from information_schema.statistics")) {
        const key = `${String(params[0])}.${String(params[1])}`;
        return [catalog.indexes.has(key) ? [{ present: 1 }] : []];
      }
      if (normalized.includes("from information_schema.table_constraints")) {
        const key = `${String(params[0])}.${String(params[1])}`;
        return [catalog.foreignKeys.has(key) ? [{ present: 1 }] : []];
      }

      if (normalized.startsWith("CREATE TABLE IF NOT EXISTS `contracts`")) {
        catalog.tables.add("contracts");
        for (const col of [
          "id",
          "workspace_id",
          "owner_user_id",
          "business_id",
          "name",
          "contract_type",
          "amount_cents",
          "start_date",
          "end_date",
          "first_due_date",
          "payment_method",
          "payment_terms",
          "finance_notes",
          "created_at",
          "updated_at",
          "archived_at",
        ]) {
          catalog.columns.add(`contracts.${col}`);
        }
        catalog.indexes.add("contracts.contracts_workspace_id_id_unique");
        catalog.indexes.add(
          "contracts.contracts_workspace_id_id_business_id_unique",
        );
        catalog.indexes.add(
          "contracts.contracts_owner_workspace_updated_index",
        );
        catalog.foreignKeys.add(
          "contracts.contracts_owner_user_id_users_id_fk",
        );
        catalog.foreignKeys.add("contracts.contracts_business_foreign_key");
      }

      if (
        normalized.startsWith(
          "CREATE TABLE IF NOT EXISTS `contract_installments`",
        )
      ) {
        catalog.tables.add("contract_installments");
      }

      if (
        normalized ===
        "ALTER TABLE `projects` DROP COLUMN `institutional_contract_id`"
      ) {
        catalog.columns.delete("projects.institutional_contract_id");
        catalog.columnExtras?.delete("projects.institutional_contract_id");
      }

      const addColumnMatch = /^ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/.exec(
        normalized,
      );
      if (addColumnMatch) {
        if (
          catalog.rejectStoredInstitutionalColumn &&
          addColumnMatch[1] === "projects" &&
          addColumnMatch[2] === "institutional_contract_id" &&
          normalized.includes("STORED")
        ) {
          throw Object.assign(new Error("Failed query"), {
            cause: {
              errno: 1901,
              sqlState: "HY000",
              sqlMessage:
                "Function or expression 'case when `is_institutional` then `contract_id` else NULL end' cannot be used in the GENERATED ALWAYS AS clause of `institutional_contract_id`",
            },
          });
        }
        const key = `${addColumnMatch[1]}.${addColumnMatch[2]}`;
        catalog.columns.add(key);
        if (normalized.includes("STORED")) {
          catalog.columnExtras?.set(key, "STORED GENERATED");
        } else if (normalized.includes("VIRTUAL")) {
          catalog.columnExtras?.set(key, "VIRTUAL GENERATED");
        }
      }

      if (
        catalog.rejectVirtualInstitutionalIndex &&
        normalized ===
          "ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_contract_institutional_unique` UNIQUE (`workspace_id`, `institutional_contract_id`)" &&
        (catalog.columnExtras?.get("projects.institutional_contract_id") ?? "")
          .toUpperCase()
          .includes("VIRTUAL")
      ) {
        throw Object.assign(new Error("Failed query"), {
          cause: {
            code: "ER_UNSUPPORTED_EXTENSION",
            errno: 3175,
            sqlMessage:
              "Cannot create index on virtual column whose base column has foreign constraint",
          },
        });
      }

      return [[]];
    },
  } as unknown as Database;

  return { database, executed };
}

function upToDateCatalog(): FakeCatalog {
  return {
    tables: new Set([
      "contracts",
      "contract_installments",
      "service_packages",
      "service_package_projects",
      "service_package_deliveries",
      "service_package_tasks",
      "deliveries",
      "delivery_tasks",
      "delivery_responsibles",
      "delivery_tags",
      "delivery_comments",
      "project_delivery_routines",
      "service_delivery_templates",
      "delivery_template_tasks",
      "personal_deliveries",
      "projects",
      "financial_entries",
    ]),
    columns: new Set([
      "contracts.contract_type",
      "contracts.start_date",
      "contracts.end_date",
      "contracts.owner_user_id",
      "contracts.source_service_package_id",
      "projects.is_active",
      "projects.contract_id",
      "projects.engagement_type",
      "projects.institutional_contract_id",
      "deliveries.engagement_type",
      "deliveries.project_routine_id",
      "deliveries.routine_occurrence_date",
      "delivery_tasks.execution_at",
      "service_delivery_templates.recurrence_type",
      "service_delivery_templates.recurrence_unit",
      "service_delivery_templates.recurrence_days",
      "financial_entries.contract_id",
      "financial_entries.contract_installment_id",
      "financial_entries.owner_user_id",
    ]),
    indexes: new Set([
      "contracts.contracts_workspace_id_id_business_id_unique",
      "contracts.contracts_owner_workspace_updated_index",
      "financial_entries.financial_entries_workspace_contract_index",
      "financial_entries.financial_entries_owner_due_status_index",
      "financial_entries.financial_entries_owner_contract_installment_unique",
      "projects.projects_workspace_contract_institutional_unique",
    ]),
    foreignKeys: new Set([
      "contracts.contracts_owner_user_id_users_id_fk",
      "contracts.contracts_business_foreign_key",
      "contracts.contracts_source_service_package_fk",
      "financial_entries.financial_entries_owner_user_id_users_id_fk",
      "financial_entries.financial_entries_workspace_contract_foreign_key",
      "financial_entries.financial_entries_workspace_contract_installment_foreign_key",
      "projects.projects_workspace_contract_business_foreign_key",
    ]),
  };
}

describe("applyRuntimeSchema", () => {
  it("garante tabelas, colunas, índices e chaves ausentes sem executar backfills de dados", async () => {
    const { database, executed } = createFakeDatabase({
      tables: new Set([
        "deliveries",
        "delivery_tasks",
        "projects",
        "financial_entries",
      ]),
      columns: new Set([
        "projects.is_active",
        "service_delivery_templates.recurrence_type",
        "service_delivery_templates.recurrence_unit",
        "service_delivery_templates.recurrence_days",
        "deliveries.project_routine_id",
        "deliveries.routine_occurrence_date",
      ]),
      indexes: new Set([
        "projects.projects_workspace_business_institutional_unique",
      ]),
      foreignKeys: new Set(),
    });

    await applyRuntimeSchema(database);

    const texts = executed.map((entry) => entry.text);
    expect(
      texts.some((q) => q.startsWith("CREATE TABLE IF NOT EXISTS `contracts`")),
    ).toBe(true);
    expect(
      texts.some((q) =>
        q.startsWith("CREATE TABLE IF NOT EXISTS `contract_installments`"),
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q === "ALTER TABLE `projects` ADD COLUMN `contract_id` char(36) NULL",
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q ===
          "ALTER TABLE `deliveries` ADD COLUMN `engagement_type` varchar(16) NOT NULL DEFAULT 'personal'",
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q ===
          "ALTER TABLE `delivery_tasks` ADD COLUMN `execution_at` timestamp(3) NULL",
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q ===
          "ALTER TABLE `projects` DROP INDEX `projects_workspace_business_institutional_unique`",
      ),
    ).toBe(true);
    expect(
      texts.some((q) =>
        q.startsWith(
          "ALTER TABLE `projects` ADD COLUMN `institutional_contract_id`",
        ),
      ),
    ).toBe(true);
    expect(texts.some((q) => q.startsWith("UPDATE "))).toBe(false);
    expect(texts.some((q) => q.startsWith("DELETE "))).toBe(false);
    expect(texts.some((q) => q.startsWith("INSERT "))).toBe(false);
  });

  it("não executa DDL destrutivo, redundante nem escrita em dados em banco já atualizado", async () => {
    const { database, executed } = createFakeDatabase(upToDateCatalog());

    await applyRuntimeSchema(database);

    const texts = executed.map((entry) => entry.text);
    expect(texts.some((q) => q.startsWith("ALTER TABLE"))).toBe(false);
    expect(texts.some((q) => q.startsWith("UPDATE "))).toBe(false);
    expect(texts.some((q) => q.startsWith("DELETE "))).toBe(false);
    expect(texts.some((q) => q.startsWith("INSERT "))).toBe(false);
  });

  it("converte institutional_contract_id de VIRTUAL para STORED quando o banco rejeita índice em coluna virtual com FK", async () => {
    const catalog = upToDateCatalog();
    catalog.indexes.delete(
      "projects.projects_workspace_contract_institutional_unique",
    );
    catalog.columnExtras = new Map([
      ["projects.institutional_contract_id", "VIRTUAL GENERATED"],
    ]);
    catalog.rejectVirtualInstitutionalIndex = true;

    const { database, executed } = createFakeDatabase(catalog);

    await applyRuntimeSchema(database);

    const texts = executed.map((entry) => entry.text);
    expect(
      texts.some(
        (q) =>
          q ===
          "ALTER TABLE `projects` DROP COLUMN `institutional_contract_id`",
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q.startsWith(
            "ALTER TABLE `projects` ADD COLUMN `institutional_contract_id`",
          ) && q.endsWith("STORED"),
      ),
    ).toBe(true);
    expect(
      texts.filter(
        (q) =>
          q ===
          "ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_contract_institutional_unique` UNIQUE (`workspace_id`, `institutional_contract_id`)",
      ),
    ).toHaveLength(2);
  });

  it("tenta VIRTUAL e cria o índice quando o MariaDB rejeita STORED com errno 1901", async () => {
    const catalog = upToDateCatalog();
    catalog.columns.delete("projects.institutional_contract_id");
    catalog.indexes.delete(
      "projects.projects_workspace_contract_institutional_unique",
    );
    catalog.rejectStoredInstitutionalColumn = true;

    const { database, executed } = createFakeDatabase(catalog);

    await expect(applyRuntimeSchema(database)).resolves.toBeUndefined();

    const texts = executed.map((entry) => entry.text);
    expect(
      texts.some((q) =>
        q.startsWith(
          "ALTER TABLE `projects` ADD COLUMN `institutional_contract_id`",
        ),
      ),
    ).toBe(true);
    expect(
      texts.some(
        (q) =>
          q ===
          "ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_contract_institutional_unique` UNIQUE (`workspace_id`, `institutional_contract_id`)",
      ),
    ).toBe(true);
    expect(texts.some((q) => q.endsWith("VIRTUAL"))).toBe(true);
  });

  it("mantém a aplicação disponível quando o banco rejeita STORED e o índice VIRTUAL", async () => {
    const catalog = upToDateCatalog();
    catalog.columns.delete("projects.institutional_contract_id");
    catalog.indexes.delete(
      "projects.projects_workspace_contract_institutional_unique",
    );
    catalog.columnExtras = new Map();
    catalog.rejectStoredInstitutionalColumn = true;
    catalog.rejectVirtualInstitutionalIndex = true;
    const { database, executed } = createFakeDatabase(catalog);

    await expect(applyRuntimeSchema(database)).resolves.toBeUndefined();

    expect(
      executed.some(({ text }) =>
        text.startsWith("CREATE TABLE IF NOT EXISTS delivery_comments"),
      ),
    ).toBe(true);
    expect(catalog.columnExtras.get("projects.institutional_contract_id")).toBe(
      "VIRTUAL GENERATED",
    );
  });
});
