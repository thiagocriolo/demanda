import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  authenticateAccount,
  InvalidCredentialsError,
  InvalidPasswordResetTokenError,
  issuePasswordReset,
  registerAccount,
  resetPassword,
  resolveSession,
  revokeAllSessions,
  revokeSessionByToken,
} from "../../src/lib/server/auth/service";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "../../src/lib/server/auth/token";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabase } from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  authSessions,
  passwordResetTokens,
  userCredentials,
  users,
  workspaceMembers,
  workspaces,
} from "../../src/lib/server/db/schema";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);
const createdUserIds = new Set<string>();

function uniqueAccount() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
  return {
    username: `auth_${suffix}`,
    email: `auth-${suffix}@example.test`,
    password: "Segura2026!",
  };
}

async function cleanupCreatedUsers(): Promise<void> {
  for (const userId of createdUserIds) {
    await database.delete(workspaces).where(eq(workspaces.ownerUserId, userId));
    await database.delete(users).where(eq(users.id, userId));
  }
  createdUserIds.clear();
}

describe("BE-03: fluxo real de autenticação", () => {
  afterEach(cleanupCreatedUsers);
  afterAll(() => pool.end());

  it("cadastra, autentica, persiste apenas o hash e revoga sessões", async () => {
    const account = uniqueAccount();
    const attackerChosenToken = createOpaqueToken();
    const registration = await registerAccount(database, {
      ...account,
      remembered: true,
      userAgent: "Vitest cadastro",
    });
    createdUserIds.add(registration.user.id);

    expect(registration.token).not.toBe(attackerChosenToken);
    expect(registration.user.avatarUrl).toMatch(
      /^\/avatars\/avatar-\d{2}\.png\?bg=[0-9A-F]{6}$/,
    );
    expect(await resolveSession(database, registration.token)).toMatchObject({
      user: { id: registration.user.id, username: account.username },
      session: { remembered: true },
    });
    expect(
      await resolveSession(database, hashOpaqueToken(registration.token)),
    ).toBeNull();

    const [storedSession] = await database
      .select({ tokenHash: authSessions.tokenHash })
      .from(authSessions)
      .where(eq(authSessions.id, registration.session.id));
    expect(storedSession?.tokenHash).toBe(hashOpaqueToken(registration.token));
    expect(storedSession?.tokenHash).not.toBe(registration.token);

    const [core] = await database
      .select({
        credentialUserId: userCredentials.userId,
        workspaceName: workspaces.name,
        workspaceKind: workspaces.kind,
        membershipRole: workspaceMembers.role,
      })
      .from(userCredentials)
      .innerJoin(users, eq(users.id, userCredentials.userId))
      .innerJoin(workspaces, eq(workspaces.ownerUserId, users.id))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, users.id),
        ),
      )
      .where(eq(users.id, registration.user.id));
    expect(core).toEqual({
      credentialUserId: registration.user.id,
      workspaceName: "Pessoal",
      workspaceKind: "personal",
      membershipRole: "owner",
    });

    const login = await authenticateAccount(database, {
      identifier: account.username,
      password: account.password,
      remembered: false,
      userAgent: "Vitest login",
    });
    expect(login.token).not.toBe(registration.token);
    expect(login.session.remembered).toBe(false);

    await expect(
      authenticateAccount(database, {
        identifier: account.username,
        password: "senha incorreta com tamanho suficiente",
        remembered: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      authenticateAccount(database, {
        identifier: `inexistente_${randomUUID().slice(0, 8)}`,
        password: "senha incorreta com tamanho suficiente",
        remembered: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    await revokeSessionByToken(database, registration.token);
    expect(await resolveSession(database, registration.token)).toBeNull();
    expect(await resolveSession(database, login.token)).not.toBeNull();

    await revokeAllSessions(database, registration.user.id);
    expect(await resolveSession(database, login.token)).toBeNull();
  });

  it("redefine a senha uma vez e invalida senha, tokens e sessões anteriores", async () => {
    const account = uniqueAccount();
    const registration = await registerAccount(database, {
      ...account,
      remembered: true,
    });
    createdUserIds.add(registration.user.id);
    const secondSession = await authenticateAccount(database, {
      identifier: account.email,
      password: account.password,
      remembered: true,
    });

    expect(
      await issuePasswordReset(database, "conta-inexistente@example.test"),
    ).toBeNull();
    const delivery = await issuePasswordReset(database, account.email);
    expect(delivery).not.toBeNull();
    if (!delivery) throw new Error("Token de recuperação não emitido.");

    const [storedReset] = await database
      .select({ tokenHash: passwordResetTokens.tokenHash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, registration.user.id));
    expect(storedReset?.tokenHash).toBe(hashOpaqueToken(delivery.token));
    expect(storedReset?.tokenHash).not.toBe(delivery.token);

    const replacementPassword = "Nova2026!";
    await resetPassword(database, delivery.token, replacementPassword);

    expect(await resolveSession(database, registration.token)).toBeNull();
    expect(await resolveSession(database, secondSession.token)).toBeNull();
    await expect(
      resetPassword(database, delivery.token, replacementPassword),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
    await expect(
      authenticateAccount(database, {
        identifier: account.email,
        password: account.password,
        remembered: false,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    const newLogin = await authenticateAccount(database, {
      identifier: account.email,
      password: replacementPassword,
      remembered: false,
    });
    expect(await resolveSession(database, newLogin.token)).not.toBeNull();
  });
});
