import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  communityInvitations,
  communityMembers,
  userConnections,
  users,
} from "../../src/lib/server/db/schema";
import {
  acceptCommunityInvitation,
  createCommunity,
  inviteCommunityMember,
  listCommunityInvitations,
} from "../../src/lib/server/social/community-service";

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

async function insertUser(database: Database, prefix: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const [user] = await database
    .insert(users)
    .values({
      name: prefix,
      username: `${prefix}_${suffix}`,
      email: `${prefix}_${suffix}@example.test`,
    })
    .returning();
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

describe("convites para comunidades", () => {
  it("só cria o vínculo de membro depois que o convidado aceita", () =>
    withRollback(async (transaction) => {
      const owner = await insertUser(transaction, "community_owner");
      const invited = await insertUser(transaction, "community_invited");
      const addedLater = await insertUser(transaction, "community_later");
      const [userAId, userBId] = [owner.id, invited.id].sort();
      await transaction
        .insert(userConnections)
        .values({ userAId, userBId, manualConnectedAt: new Date() });

      const community = await createCommunity(transaction, owner.id, {
        linkName: `community-${randomUUID().slice(0, 8)}`,
        name: "Comunidade de teste",
        description: "Validação do fluxo de convites.",
        topic: "Testes",
        visibility: "private",
        memberUserIds: [invited.id],
      });

      const membershipsBefore = await transaction
        .select({ userId: communityMembers.userId })
        .from(communityMembers)
        .where(eq(communityMembers.communityId, community.id));
      expect(membershipsBefore.map(({ userId }) => userId)).toEqual([owner.id]);

      const [invitation] = await listCommunityInvitations(
        transaction,
        invited.id,
      );
      expect(invitation).toMatchObject({
        community: { linkName: community.linkName },
        invitedBy: { id: owner.id },
      });

      await inviteCommunityMember(
        transaction,
        owner.id,
        community.linkName,
        addedLater.id,
      );
      const [laterMembership] = await transaction
        .select({ userId: communityMembers.userId })
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, addedLater.id),
          ),
        );
      expect(laterMembership).toBeUndefined();

      const accepted = await acceptCommunityInvitation(
        transaction,
        invited.id,
        invitation!.id,
      );
      expect(accepted.members.some(({ user }) => user.id === invited.id)).toBe(
        true,
      );

      const [acceptedInvitation] = await transaction
        .select({ status: communityInvitations.status })
        .from(communityInvitations)
        .where(eq(communityInvitations.id, invitation!.id));
      expect(acceptedInvitation?.status).toBe("accepted");
    }));
});

afterAll(async () => {
  await pool.end();
});
