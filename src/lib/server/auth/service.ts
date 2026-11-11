import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { affectedRows, type Database } from "../db/database";
import {
  auditLogs,
  authSessions,
  passwordResetTokens,
  userCredentials,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { connectWorkspaceMembers } from "../connections/service";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "./password";
import { createOpaqueToken, hashOpaqueToken } from "./token";
import { avatarProfileUrl, randomAvatar } from "../../avatar/avatar-options";

export const TRANSIENT_SESSION_DURATION_MS = 24 * 60 * 60 * 1_000;
export const REMEMBERED_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;
export const PASSWORD_RESET_DURATION_MS = 30 * 60 * 1_000;
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1_000;

type AuthExecutor = Database;

export type AuthenticatedUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type AuthenticatedSession = {
  id: string;
  userId: string;
  activeWorkspaceId: string | null;
  remembered: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type SessionPrincipal = {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
};

export type IssuedSession = SessionPrincipal & { token: string };

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Credenciais inválidas.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super("Não foi possível criar a conta com os dados informados.");
    this.name = "AccountAlreadyExistsError";
  }
}

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Este link é inválido ou expirou.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function asUser(row: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
  };
}

function sessionExpiry(remembered: boolean, now: Date): Date {
  return new Date(
    now.getTime() +
      (remembered
        ? REMEMBERED_SESSION_DURATION_MS
        : TRANSIENT_SESSION_DURATION_MS),
  );
}

async function issueSession(
  database: AuthExecutor,
  user: AuthenticatedUser,
  options: {
    remembered: boolean;
    activeWorkspaceId?: string | null;
    userAgent?: string | null;
    now?: Date;
  },
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  const token = createOpaqueToken();
  const expiresAt = sessionExpiry(options.remembered, now);
  const sessionId = randomUUID();
  await database
    .insert(authSessions)
    .values({
      id: sessionId,
      userId: user.id,
      activeWorkspaceId: options.activeWorkspaceId ?? null,
      tokenHash: hashOpaqueToken(token),
      remembered: options.remembered,
      userAgent: options.userAgent?.slice(0, 512) || null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
  const [session] = await database
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1);

  if (!session) throw new Error("A sessão não pôde ser criada.");

  return {
    token,
    user,
    session: {
      id: session.id,
      userId: session.userId,
      activeWorkspaceId: session.activeWorkspaceId,
      remembered: session.remembered,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    },
  };
}

export async function registerAccount(
  database: Database,
  input: {
    username: string;
    email: string;
    password: string;
    userAgent?: string | null;
    remembered?: boolean;
    avatarUrl?: string;
  },
): Promise<IssuedSession> {
  const passwordHash = await hashPassword(input.password);
  const generatedAvatar = randomAvatar();
  const avatarUrl =
    input.avatarUrl ??
    avatarProfileUrl(generatedAvatar.avatarImage, generatedAvatar.avatarColor);
  const now = new Date();

  try {
    return await database.transaction(async (transaction) => {
      const userId = randomUUID();
      await transaction
        .insert(users)
        .values({
          id: userId,
          username: input.username,
          name: input.username,
          email: input.email,
          avatarUrl,
          emailVerifiedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      const [createdUser] = await transaction
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!createdUser) throw new Error("O usuário não pôde ser criado.");

      await transaction.insert(userCredentials).values({
        userId: createdUser.id,
        passwordHash,
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const workspaceId = randomUUID();
      await transaction
        .insert(workspaces)
        .values({
          id: workspaceId,
          name: "Pessoal",
          description: "Seus projetos e tarefas particulares.",
          icon: "house",
          color: "blue",
          kind: "personal",
          ownerUserId: createdUser.id,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        });
      await transaction.insert(workspaceMembers).values({
        workspaceId,
        userId: createdUser.id,
        role: "owner",
        joinedAt: now,
        updatedAt: now,
      });
      const [personalWorkspace] = await transaction
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!personalWorkspace) {
        throw new Error("O workspace pessoal não pôde ser criado.");
      }

      const pendingInvitations = await transaction
        .select({
          invitation: workspaceInvitations,
          workspaceId: workspaces.id,
        })
        .from(workspaceInvitations)
        .innerJoin(
          workspaces,
          eq(workspaces.id, workspaceInvitations.workspaceId),
        )
        .where(
          and(
            eq(workspaceInvitations.email, input.email),
            eq(workspaceInvitations.status, "pending"),
            isNull(workspaces.archivedAt),
          ),
        );

      for (const { invitation, workspaceId } of pendingInvitations) {
        const acceptedAt = new Date();
        await transaction
          .update(workspaceInvitations)
          .set({
            status: "accepted",
            acceptedByUserId: createdUser.id,
            acceptedAt,
            updatedAt: acceptedAt,
          })
          .where(
            and(
              eq(workspaceInvitations.id, invitation.id),
              eq(workspaceInvitations.status, "pending"),
            ),
          );
        await transaction
          .insert(workspaceMembers)
          .values({
            workspaceId,
            userId: createdUser.id,
            role: invitation.role,
            joinedAt: acceptedAt,
          })
          .onDuplicateKeyUpdate({ set: { role: invitation.role } });
        await connectWorkspaceMembers(
          transaction as unknown as Database,
          workspaceId,
          createdUser.id,
        );
        await transaction.insert(auditLogs).values({
          workspaceId,
          actorUserId: createdUser.id,
          action: "workspace.invitation.accepted",
          targetType: "workspace_invitation",
          targetId: invitation.id,
          metadata: { role: invitation.role },
        });
      }

      return issueSession(transaction, asUser(createdUser), {
        remembered: input.remembered ?? true,
        activeWorkspaceId: personalWorkspace.id,
        userAgent: input.userAgent,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountAlreadyExistsError();
    throw error;
  }
}

export async function authenticateAccount(
  database: Database,
  input: {
    identifier: string;
    password: string;
    remembered: boolean;
    userAgent?: string | null;
  },
): Promise<IssuedSession> {
  const lookup = input.identifier.includes("@")
    ? eq(users.email, input.identifier)
    : eq(users.username, input.identifier);

  const [account] = await database
    .select({ user: users, passwordHash: userCredentials.passwordHash })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(and(lookup, isNull(users.deletedAt)))
    .limit(1);

  const passwordMatches = await verifyPassword(
    input.password,
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!account || !passwordMatches) throw new InvalidCredentialsError();

  if (passwordNeedsRehash(account.passwordHash)) {
    const replacement = await hashPassword(input.password);
    await database
      .update(userCredentials)
      .set({
        passwordHash: replacement,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userCredentials.userId, account.user.id),
          eq(userCredentials.passwordHash, account.passwordHash),
        ),
      );
  }

  return issueSession(database, asUser(account.user), {
    remembered: input.remembered,
    userAgent: input.userAgent,
  });
}

export async function resolveSession(
  database: Database,
  token: string | undefined,
  now = new Date(),
): Promise<SessionPrincipal | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const [result] = await database
    .select({ user: users, session: authSessions })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashOpaqueToken(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!result) return null;

  if (
    result.session.lastSeenAt.getTime() <=
    now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS
  ) {
    await database
      .update(authSessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(authSessions.id, result.session.id),
          isNull(authSessions.revokedAt),
        ),
      );
    result.session.lastSeenAt = now;
  }

  return {
    user: asUser(result.user),
    session: {
      id: result.session.id,
      userId: result.session.userId,
      activeWorkspaceId: result.session.activeWorkspaceId,
      remembered: result.session.remembered,
      createdAt: result.session.createdAt,
      lastSeenAt: result.session.lastSeenAt,
      expiresAt: result.session.expiresAt,
    },
  };
}

export async function revokeSessionByToken(
  database: Database,
  token: string | undefined,
  now = new Date(),
): Promise<void> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await database
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.tokenHash, hashOpaqueToken(token)),
        isNull(authSessions.revokedAt),
      ),
    );
}

export async function revokeAllSessions(
  database: Database,
  userId: string,
  options: { exceptSessionId?: string; now?: Date } = {},
): Promise<void> {
  const filters = [
    eq(authSessions.userId, userId),
    isNull(authSessions.revokedAt),
  ];
  if (options.exceptSessionId) {
    filters.push(ne(authSessions.id, options.exceptSessionId));
  }

  await database
    .update(authSessions)
    .set({ revokedAt: options.now ?? new Date() })
    .where(and(...filters));
}

export async function listActiveSessions(
  database: Database,
  userId: string,
  now = new Date(),
): Promise<AuthenticatedSession[]> {
  const sessions = await database
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .orderBy(desc(authSessions.lastSeenAt));

  return sessions.map((session) => ({
    id: session.id,
    userId: session.userId,
    activeWorkspaceId: session.activeWorkspaceId,
    remembered: session.remembered,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
  }));
}

export type PasswordResetDelivery = {
  recipient: string;
  token: string;
  expiresAt: Date;
};

export async function issuePasswordReset(
  database: Database,
  email: string,
  now = new Date(),
): Promise<PasswordResetDelivery | null> {
  // O token é gerado nos dois caminhos para reduzir diferenças observáveis.
  const token = createOpaqueToken();
  const [account] = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (!account) return null;

  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_DURATION_MS);
  await database.transaction(async (transaction) => {
    await transaction
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, account.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
    await transaction.insert(passwordResetTokens).values({
      userId: account.id,
      tokenHash: hashOpaqueToken(token),
      createdAt: now,
      expiresAt,
    });
  });

  return { recipient: account.email, token, expiresAt };
}

export async function resetPassword(
  database: Database,
  token: string,
  password: string,
  now = new Date(),
): Promise<void> {
  const replacementHash = await hashPassword(password);
  const tokenHash = hashOpaqueToken(token);

  await database.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);
    if (!candidate) throw new InvalidPasswordResetTokenError();
    const consumeResult = await transaction
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      );
    if (affectedRows(consumeResult) !== 1) throw new InvalidPasswordResetTokenError();
    const consumed = candidate;

    const [activeUser] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, consumed.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!activeUser) throw new InvalidPasswordResetTokenError();

    await transaction
      .insert(userCredentials)
      .values({
        userId: consumed.userId,
        passwordHash: replacementHash,
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          passwordHash: replacementHash,
          passwordChangedAt: now,
          updatedAt: now,
        },
      });

    await transaction
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, consumed.userId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );

    await transaction
      .update(authSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(authSessions.userId, consumed.userId),
          isNull(authSessions.revokedAt),
        ),
      );
  });
}

export async function changePassword(
  database: Database,
  input: {
    userId: string;
    currentPassword: string;
    password: string;
    keepSessionId?: string;
  },
): Promise<void> {
  const [credential] = await database
    .select({ passwordHash: userCredentials.passwordHash })
    .from(userCredentials)
    .where(eq(userCredentials.userId, input.userId))
    .limit(1);

  const matches = await verifyPassword(
    input.currentPassword,
    credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!credential || !matches) throw new InvalidCredentialsError();

  const replacementHash = await hashPassword(input.password);
  const now = new Date();
  const changed = await database
    .update(userCredentials)
    .set({
      passwordHash: replacementHash,
      passwordChangedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(userCredentials.userId, input.userId),
        eq(userCredentials.passwordHash, credential.passwordHash),
      ),
    );

  if (affectedRows(changed) !== 1) throw new InvalidCredentialsError();
  await revokeAllSessions(database, input.userId, {
    exceptSessionId: input.keepSessionId,
    now,
  });
}

export function isSessionExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
