import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { ContactMutationInput } from "../../src/lib/contacts/types";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import {
  archiveWorkspaceContact,
  ContactLinkedUserInvalidError,
  ContactNotFoundError,
  createWorkspaceContact,
  getWorkspaceContact,
  listWorkspaceContacts,
  updateWorkspaceContact,
} from "../../src/lib/server/contacts/service";
import { contactListQuerySchema } from "../../src/lib/server/contacts/validation";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  contactNotes,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

async function withRollback(
  run: (database: Database) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run(transaction as unknown as Database);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (cause instanceof RollbackFixture) return;
    throw cause;
  }
}

async function insertUser(
  database: Database,
  label: string,
): Promise<typeof users.$inferSelect> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const id = randomUUID();
  await database.insert(users).values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  const [user] = await database.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

async function insertWorkspace(
  database: Database,
  ownerUserId: string,
  name: string,
): Promise<typeof workspaces.$inferSelect> {
  const id = randomUUID();
  await database.insert(workspaces).values({ id, name, kind: "shared", ownerUserId });
  await database.insert(workspaceMembers).values({ workspaceId: id, userId: ownerUserId, role: "owner" });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste não criado.");
  return workspace;
}

async function insertPersonalWorkspace(
  database: Database,
  ownerUserId: string,
  name: string,
): Promise<typeof workspaces.$inferSelect> {
  const id = randomUUID();
  await database.insert(workspaces).values({ id, name, kind: "personal", ownerUserId });
  await database.insert(workspaceMembers).values({ workspaceId: id, userId: ownerUserId, role: "owner" });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace pessoal de teste não criado.");
  return workspace;
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole,
): RequestAuthorizationContext {
  const now = new Date();
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      activeWorkspaceId: workspace.id,
      remembered: false,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    activeWorkspace: {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        color: workspace.color,
        kind: workspace.kind,
        ownerUserId: workspace.ownerUserId,
      },
      membership: { userId: user.id, role, joinedAt: now },
    },
  };
}

function input(
  name: string,
  linkedUserId: string | null = null,
): ContactMutationInput {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return {
    name,
    contactType: "person",
    status: "active",
    profession: "Designer",
    linkedUserId,
    phones: [
      {
        type: "whatsapp",
        label: "WhatsApp",
        value: `+55859${String(slug.length).padStart(8, "0")}`,
        isPrimary: true,
      },
    ],
    emails: [
      {
        type: "work",
        label: "Principal",
        value: `${slug}@example.test`,
        isPrimary: true,
      },
    ],
    notes: [{ body: `Observação de ${name}` }],
  };
}

function query(values: Record<string, string> = {}) {
  return contactListQuerySchema.parse(values);
}

describe("BE-05: serviço de contatos", () => {
  afterAll(() => pool.end());

  it("mantém CRUD, busca e paginação privados e estáveis ao trocar de workspace", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "OwnerContact");
      const member = await insertUser(database, "MemberContact");
      const ownerPersonal = await insertPersonalWorkspace(
        database,
        owner.id,
        "Pessoal OwnerContact",
      );
      const memberPersonal = await insertPersonalWorkspace(
        database,
        member.id,
        "Pessoal MemberContact",
      );
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Contatos compartilhados",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, workspace, "owner");
      const memberContext = context(member, workspace, "member");
      const ownerPersonalContext = context(owner, ownerPersonal, "owner");

      const marina = await createWorkspaceContact(
        database,
        memberContext,
        input("Marina", member.id),
      );
      const ana = await createWorkspaceContact(
        database,
        ownerContext,
        input("Ana"),
      );
      const zeca = await createWorkspaceContact(
        database,
        ownerContext,
        input("Zeca"),
      );

      expect(marina).toMatchObject({
        workspaceId: memberPersonal.id,
        ownerUserId: member.id,
      });
      expect(ana).toMatchObject({
        workspaceId: ownerPersonal.id,
        ownerUserId: owner.id,
      });
      expect(marina.phones[0]?.value).toMatch(/^\+55/);
      expect(marina.emails[0]?.value).toBe("marina@example.test");
      await expect(
        getWorkspaceContact(database, ownerContext, marina.id),
      ).rejects.toBeInstanceOf(ContactNotFoundError);

      const firstPage = await listWorkspaceContacts(
        database,
        ownerContext,
        query({ page: "1", pageSize: "2", orderBy: "name_asc" }),
      );
      expect(firstPage.items.map(({ name }) => name)).toEqual(["Ana", "Zeca"]);
      expect(firstPage).toMatchObject({
        workspaceId: ownerPersonal.id,
        ownerUserId: owner.id,
        total: 2,
        totalPages: 1,
      });
      expect(firstPage.facets.active).toBe(2);

      const afterWorkspaceSwitch = await listWorkspaceContacts(
        database,
        ownerPersonalContext,
        query({ orderBy: "name_asc" }),
      );
      expect(afterWorkspaceSwitch.items.map(({ id }) => id)).toEqual([
        ana.id,
        zeca.id,
      ]);

      const searched = await listWorkspaceContacts(
        database,
        memberContext,
        query({ query: "observação de marina" }),
      );
      expect(searched.items.map(({ id }) => id)).toEqual([marina.id]);

      const searchedByFormattedPhone = await listWorkspaceContacts(
        database,
        memberContext,
        query({ query: "85 9 0000-0006" }),
      );
      expect(searchedByFormattedPhone.items.map(({ id }) => id)).toEqual([
        marina.id,
      ]);

      const updated = await updateWorkspaceContact(
        database,
        memberContext,
        marina.id,
        { ...input("Marina Atualizada", member.id), status: "prospect" },
      );
      expect(updated).toMatchObject({
        id: marina.id,
        name: "Marina Atualizada",
        status: "prospect",
      });
      expect(updated.phones).toHaveLength(1);

      await archiveWorkspaceContact(database, memberContext, marina.id);
      await archiveWorkspaceContact(database, memberContext, marina.id);
      const active = await listWorkspaceContacts(
        database,
        memberContext,
        query(),
      );
      const archived = await listWorkspaceContacts(
        database,
        memberContext,
        query({ archived: "only" }),
      );
      expect(active.items.some(({ id }) => id === marina.id)).toBe(false);
      expect(archived.items.map(({ id }) => id)).toContain(marina.id);
      expect(archived.facets.archived).toBe(1);

      const activeStatusIncludingArchived = await listWorkspaceContacts(
        database,
        memberContext,
        query({ status: "active", archived: "include" }),
      );
      expect(
        activeStatusIncludingArchived.items.some(({ id }) => id === marina.id),
      ).toBe(false);
      expect(activeStatusIncludingArchived.total).toBe(0);
    });
  });

  it("não distingue contato estrangeiro de UUID inexistente", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "OwnerTenantA");
      const outsider = await insertUser(database, "OwnerTenantB");
      await insertPersonalWorkspace(database, owner.id, "Pessoal Tenant A");
      await insertPersonalWorkspace(database, outsider.id, "Pessoal Tenant B");
      const workspace = await insertWorkspace(database, owner.id, "Tenant A");
      const outsiderWorkspace = await insertWorkspace(
        database,
        outsider.id,
        "Tenant B",
      );
      const ownerContext = context(owner, workspace, "owner");
      const outsiderContext = context(outsider, outsiderWorkspace, "owner");
      const created = await createWorkspaceContact(
        database,
        ownerContext,
        input("Contato privado"),
      );

      const errors: string[] = [];
      for (const id of [created.id, randomUUID()]) {
        try {
          await getWorkspaceContact(database, outsiderContext, id);
        } catch (cause) {
          expect(cause).toBeInstanceOf(ContactNotFoundError);
          errors.push((cause as Error).message);
        }
      }
      expect(errors).toEqual([
        "Contato não encontrado.",
        "Contato não encontrado.",
      ]);
      await expect(
        updateWorkspaceContact(
          database,
          outsiderContext,
          created.id,
          input("Tentativa estrangeira"),
        ),
      ).rejects.toBeInstanceOf(ContactNotFoundError);
      await expect(
        archiveWorkspaceContact(database, outsiderContext, created.id),
      ).rejects.toBeInstanceOf(ContactNotFoundError);
      const outsiderList = await listWorkspaceContacts(
        database,
        outsiderContext,
        query({ archived: "include" }),
      );
      expect(outsiderList.total).toBe(0);
    });
  });

  it("preserva observações arquivadas durante uma edição comum", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "OwnerArchivedNote");
      await insertPersonalWorkspace(database, owner.id, "Pessoal ArchivedNote");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Notas arquivadas",
      );
      const ownerContext = context(owner, workspace, "owner");
      const created = await createWorkspaceContact(
        database,
        ownerContext,
        input("Contato com histórico"),
      );
      const archivedNote = { id: randomUUID() };
      await database.insert(contactNotes).values({
          id: archivedNote.id,
          workspaceId: created.workspaceId,
          contactId: created.id,
          body: "Histórico que não pode ser apagado",
          archivedAt: new Date(),
        });
      if (!archivedNote) throw new Error("Observação arquivada não criada.");

      await updateWorkspaceContact(
        database,
        ownerContext,
        created.id,
        input("Contato com histórico atualizado"),
      );

      const archivedRows = await database
        .select({ id: contactNotes.id, archivedAt: contactNotes.archivedAt })
        .from(contactNotes)
        .where(eq(contactNotes.id, archivedNote.id));
      expect(archivedRows).toHaveLength(1);
      expect(archivedRows[0]?.archivedAt).toBeInstanceOf(Date);
    });
  });

  it("aceita qualquer usuário válido como vínculo e ignora membership ativa", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "OwnerLinked");
      const member = await insertUser(database, "MemberLinked");
      const outsider = await insertUser(database, "OutsiderLinked");
      await insertPersonalWorkspace(database, owner.id, "Pessoal OwnerLinked");
      await insertPersonalWorkspace(
        database,
        member.id,
        "Pessoal MemberLinked",
      );
      await insertPersonalWorkspace(
        database,
        outsider.id,
        "Pessoal OutsiderLinked",
      );
      const workspace = await insertWorkspace(database, owner.id, "Linked A");
      const outsiderWorkspace = await insertWorkspace(
        database,
        outsider.id,
        "Linked B",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, workspace, "owner");
      const memberContext = context(member, workspace, "member");

      await expect(
        createWorkspaceContact(
          database,
          ownerContext,
          input("Vínculo inexistente", randomUUID()),
        ),
      ).rejects.toBeInstanceOf(ContactLinkedUserInvalidError);

      const linked = await createWorkspaceContact(
        database,
        ownerContext,
        input("Vínculo externo válido", outsider.id),
      );
      expect(linked.linkedUserId).toBe(outsider.id);
      const memberContact = await createWorkspaceContact(
        database,
        memberContext,
        input("Contato do membro", member.id),
      );

      await database
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, member.id),
          ),
        );
      const memberList = await listWorkspaceContacts(
        database,
        memberContext,
        query(),
      );
      expect(memberList.items.map(({ id }) => id)).toEqual([memberContact.id]);

      const afterRemoval = await getWorkspaceContact(
        database,
        ownerContext,
        linked.id,
      );
      expect(afterRemoval.linkedUserId).toBe(outsider.id);
      expect(outsiderWorkspace.id).not.toBe(workspace.id);
    });
  });
});
