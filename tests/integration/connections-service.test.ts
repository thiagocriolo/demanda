import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  connectWorkspaceMembers,
  disconnectUsers,
  listConnectionDashboard,
  requestConnection,
  respondToConnectionRequest,
  searchConnectionUsers,
} from "../../src/lib/server/connections/service";
import { WorkspaceOperationNotAllowedError } from "../../src/lib/server/authorization/workspace-administration";
import { registerAccount } from "../../src/lib/server/auth/service";
import {
  createPostComment,
  createSocialPost,
  deleteSocialPost,
  deletePostComment,
  getPortfolio,
  getSocialPost,
  listFeed,
  listPostComments,
  listPortfolios,
  setCommentLike,
  setPostLike,
  updateSocialPostBody,
} from "../../src/lib/server/social/service";
import {
  getPublicUserPage,
  getPublicUserPortfolio,
} from "../../src/lib/server/social/public-profile";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  userConnections,
  socialPosts,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../../src/lib/server/db/schema";
import {
  addWorkspaceCollaboratorByEmail,
  listUserWorkspaces,
} from "../../src/lib/server/workspaces/service";

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
  username: string,
  email = `${username}@example.test`,
) {
  const id = randomUUID();
  await database
    .insert(users)
    .values({ id, name: username, username, email });
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, id));
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

async function insertSharedWorkspace(database: Database, ownerUserId: string) {
  const id = randomUUID();
  await database
    .insert(workspaces)
    .values({
      id,
      name: `Conexões ${randomUUID()}`,
      kind: "shared",
      ownerUserId,
    });
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste não criado.");
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: ownerUserId,
    role: "owner",
  });
  return workspace;
}

describe("conexões e colaboradores de workspace", () => {
  it("restringe as publicações do perfil às conexões confirmadas", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const author = await insertUser(transaction, `profile_${suffix}`);
      const visitor = await insertUser(transaction, `visitor_${suffix}`);
      const feedPostId = randomUUID();
      await transaction
        .insert(socialPosts)
        .values({
          id: feedPostId,
          authorUserId: author.id,
          kind: "feed",
          body: "Publicação visível apenas para conexões",
        });

      const anonymous = await getPublicUserPage(transaction, author.username);
      expect(anonymous).toMatchObject({
        relationship: "anonymous",
        canViewPosts: false,
        posts: [],
      });

      const ownProfile = await getPublicUserPage(
        transaction,
        author.username,
        author.id,
      );
      expect(ownProfile).toMatchObject({
        relationship: "self",
        canViewPosts: true,
      });
      expect(ownProfile?.posts.map((post) => post.id)).toEqual([feedPostId]);

      const unrelated = await getPublicUserPage(
        transaction,
        author.username,
        visitor.id,
      );
      expect(unrelated).toMatchObject({
        relationship: "none",
        canViewPosts: false,
        posts: [],
      });

      const request = await requestConnection(
        transaction,
        visitor.id,
        author.id,
      );
      expect(
        await getPublicUserPage(transaction, author.username, visitor.id),
      ).toMatchObject({
        relationship: "outgoing",
        pendingRequestId: request.id,
        canViewPosts: false,
        posts: [],
      });

      await respondToConnectionRequest(
        transaction,
        author.id,
        request.id,
        "accept",
      );
      const connected = await getPublicUserPage(
        transaction,
        author.username,
        visitor.id,
      );
      expect(connected).toMatchObject({
        relationship: "connected",
        canViewPosts: true,
      });
      expect(connected?.posts.map((post) => post.id)).toEqual([feedPostId]);
    }));

  it("mantém a área de portfólio restrita aos projetos do próprio usuário", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const owner = await insertUser(transaction, `owner_${suffix}`);
      const connection = await insertUser(transaction, `connection_${suffix}`);
      const request = await requestConnection(
        transaction,
        owner.id,
        connection.id,
      );
      await respondToConnectionRequest(
        transaction,
        connection.id,
        request.id,
        "accept",
      );

      const ownPostId = randomUUID();
      const connectionPostId = randomUUID();
      await transaction
        .insert(socialPosts)
        .values([
          {
            id: ownPostId,
            authorUserId: owner.id,
            kind: "portfolio",
            title: "Projeto próprio",
          },
          {
            id: connectionPostId,
            authorUserId: connection.id,
            kind: "portfolio",
            title: "Projeto da conexão",
          },
          {
            id: randomUUID(),
            authorUserId: connection.id,
            kind: "feed",
            body: "Publicação que não pertence ao portfólio",
          },
          {
            id: randomUUID(),
            authorUserId: connection.id,
            kind: "portfolio",
            title: "Projeto excluído",
            deletedAt: new Date(),
          },
        ]);

      const portfolio = await listPortfolios(transaction, owner.id);
      expect(portfolio.items.map((post) => post.id)).toEqual([ownPostId]);
      await expect(
        getPortfolio(transaction, owner.id, connectionPostId),
      ).rejects.toMatchObject({ status: 404 });

      const publicPortfolio = await getPublicUserPortfolio(
        transaction,
        connection.username,
      );
      expect(publicPortfolio?.profile.username).toBe(connection.username);
      expect(publicPortfolio?.posts.map((post) => post.id)).toEqual([
        connectionPostId,
      ]);
      expect(publicPortfolio?.posts[0]?.canInteract).toBe(false);

      const connectedPublicPortfolio = await getPublicUserPortfolio(
        transaction,
        connection.username,
        owner.id,
      );
      expect(connectedPublicPortfolio?.posts[0]?.canInteract).toBe(true);
    }));

  it("envia, notifica, aceita e desfaz uma conexão manual", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const requester = await insertUser(transaction, `requester_${suffix}`);
      const recipient = await insertUser(transaction, `recipient_${suffix}`);

      const request = await requestConnection(
        transaction,
        requester.id,
        recipient.id,
      );
      expect(request.direction).toBe("outgoing");
      const recipientDashboard = await listConnectionDashboard(
        transaction,
        recipient.id,
      );
      expect(recipientDashboard.requests[0]).toMatchObject({
        id: request.id,
        direction: "incoming",
        user: { id: requester.id },
      });

      await respondToConnectionRequest(
        transaction,
        recipient.id,
        request.id,
        "accept",
      );
      const connected = await listConnectionDashboard(
        transaction,
        requester.id,
      );
      expect(connected.connections[0]).toMatchObject({
        id: recipient.id,
        source: "request",
      });

      const post = await createSocialPost(transaction, recipient.id, {
        kind: "feed",
        body: "Uma atualização visível para minhas conexões.",
        blocks: [],
      });
      const feed = await listFeed(transaction, requester.id);
      expect(feed.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `post:${post.id}`,
            kind: "post",
          }),
        ]),
      );

      await disconnectUsers(transaction, requester.id, recipient.id);
      expect(
        (await listConnectionDashboard(transaction, requester.id)).connections,
      ).toHaveLength(0);
    }));

  it("permite que conexões curtam e comentem publicações", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const author = await insertUser(transaction, `author_${suffix}`);
      const connection = await insertUser(transaction, `reader_${suffix}`);
      const stranger = await insertUser(transaction, `stranger_${suffix}`);
      const post = await createSocialPost(transaction, author.id, {
        kind: "feed",
        body: "Uma publicação aberta às minhas conexões.",
        blocks: [],
      });

      await expect(
        setPostLike(transaction, connection.id, post.id, true),
      ).rejects.toMatchObject({ status: 403 });

      const request = await requestConnection(
        transaction,
        connection.id,
        author.id,
      );
      await respondToConnectionRequest(
        transaction,
        author.id,
        request.id,
        "accept",
      );

      await setPostLike(transaction, connection.id, post.id, true);
      const likedAgain = await setPostLike(
        transaction,
        connection.id,
        post.id,
        true,
      );
      expect(likedAgain).toMatchObject({
        likeCount: 1,
        commentCount: 0,
        likedByCurrentUser: true,
      });

      const created = await createPostComment(
        transaction,
        connection.id,
        post.id,
        "Excelente trabalho!",
      );
      expect(created.comment).toMatchObject({
        body: "Excelente trabalho!",
        author: { id: connection.id },
      });
      expect(created.interaction.commentCount).toBe(1);
      await expect(
        deletePostComment(transaction, author.id, post.id, created.comment.id),
      ).rejects.toMatchObject({ status: 403 });

      const commentLike = await setCommentLike(
        transaction,
        stranger.id,
        post.id,
        created.comment.id,
        true,
      );
      expect(commentLike).toEqual({
        likeCount: 1,
        likedByCurrentUser: true,
      });
      await expect(
        setCommentLike(
          transaction,
          stranger.id,
          post.id,
          created.comment.id,
          true,
        ),
      ).resolves.toEqual(commentLike);
      await expect(
        listPostComments(transaction, connection.id, post.id),
      ).resolves.toEqual([expect.objectContaining({ id: created.comment.id })]);

      const feed = await listFeed(transaction, connection.id);
      const feedPost = feed.items.find((item) => item.id === `post:${post.id}`);
      expect(feedPost).toMatchObject({
        kind: "post",
        post: {
          likeCount: 1,
          commentCount: 1,
          likedByCurrentUser: true,
          canInteract: true,
        },
      });

      let parent = created.comment;
      for (let depth = 1; depth <= 10; depth += 1) {
        const reply = await createPostComment(
          transaction,
          depth % 2 === 0 ? connection.id : author.id,
          post.id,
          `Resposta no nível ${depth}`,
          parent.id,
        );
        expect(reply.comment).toMatchObject({
          parentCommentId: parent.id,
          depth,
        });
        parent = reply.comment;
      }
      await expect(
        createPostComment(
          transaction,
          connection.id,
          post.id,
          "Resposta além do limite",
          parent.id,
        ),
      ).rejects.toMatchObject({ status: 400 });

      const unliked = await setPostLike(
        transaction,
        connection.id,
        post.id,
        false,
      );
      expect(unliked).toMatchObject({
        likeCount: 0,
        likedByCurrentUser: false,
      });

      await disconnectUsers(transaction, connection.id, author.id);
      const afterDeletion = await deletePostComment(
        transaction,
        connection.id,
        post.id,
        created.comment.id,
      );
      expect(afterDeletion.comments[0]).toMatchObject({
        id: created.comment.id,
        deleted: true,
        body: "Comentário excluído",
      });
      expect(afterDeletion.interaction.commentCount).toBe(10);
      await expect(
        createPostComment(
          transaction,
          connection.id,
          post.id,
          "Comentário sem conexão",
        ),
      ).rejects.toMatchObject({ status: 403 });
    }));

  it("abre pelo link e restringe edição e exclusão ao autor", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const author = await insertUser(transaction, `post_author_${suffix}`);
      const reader = await insertUser(transaction, `post_reader_${suffix}`);
      const post = await createSocialPost(transaction, author.id, {
        kind: "feed",
        body: "Texto original",
        blocks: [],
      });

      await expect(
        getSocialPost(transaction, reader.id, post.id),
      ).rejects.toMatchObject({ status: 404 });
      const request = await requestConnection(
        transaction,
        reader.id,
        author.id,
      );
      await respondToConnectionRequest(
        transaction,
        author.id,
        request.id,
        "accept",
      );

      await expect(
        getSocialPost(transaction, reader.id, post.id),
      ).resolves.toMatchObject({
        id: post.id,
        canManage: false,
        viewerAuthenticated: true,
      });
      await expect(
        updateSocialPostBody(transaction, reader.id, post.id, "Invasão"),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        deleteSocialPost(transaction, reader.id, post.id),
      ).rejects.toMatchObject({ status: 403 });

      const updated = await updateSocialPostBody(
        transaction,
        author.id,
        post.id,
        "Texto atualizado",
      );
      expect(updated).toMatchObject({
        body: "Texto atualizado",
        canManage: true,
      });

      await deleteSocialPost(transaction, author.id, post.id);
      await expect(
        getSocialPost(transaction, author.id, post.id),
      ).rejects.toMatchObject({ status: 404 });
    }));

  it("prioriza a correspondência exata e retorna parciais globalmente", () =>
    withRollback(async (transaction) => {
      const token = `zx${randomUUID().replaceAll("-", "").slice(0, 8)}`;
      const actor = await insertUser(transaction, `user_${token}`);
      const exact = await insertUser(transaction, token);
      const prefix = await insertUser(transaction, `${token}x`);
      const middle = await insertUser(transaction, `alfa${token}g`);
      const numeric = await insertUser(transaction, `50${token}20`);
      const unrelated = await insertUser(transaction, `tosto${token}`);
      const workspace = await insertSharedWorkspace(transaction, actor.id);

      for (const connection of [prefix, middle, numeric]) {
        await transaction.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: connection.id,
        });
        await connectWorkspaceMembers(transaction, workspace.id, connection.id);
      }

      const results = await searchConnectionUsers(
        transaction,
        actor.id,
        `@${token}`,
        10,
      );
      expect(results[0]).toMatchObject({
        kind: "user",
        id: exact.id,
        exact: true,
      });
      for (const query of [token, exact.email]) {
        expect(
          (await searchConnectionUsers(transaction, actor.id, query, 10))[0],
        ).toMatchObject({
          kind: "user",
          id: exact.id,
          exact: true,
        });
      }
      expect(results.some((result) => result.id === prefix.id)).toBe(true);
      expect(
        results.some(
          (result) => result.kind === "user" && result.id === unrelated.id,
        ),
      ).toBe(true);
    }));

  it("oferece convite apenas para um e-mail completo sem conta", () =>
    withRollback(async (transaction) => {
      const actor = await insertUser(transaction, "convite_owner");
      expect(
        await searchConnectionUsers(
          transaction,
          actor.id,
          "nova.pessoa@example.test",
          3,
        ),
      ).toEqual([
        {
          kind: "invite",
          id: "email:nova.pessoa@example.test",
          email: "nova.pessoa@example.test",
          exact: true,
        },
      ]);
      expect(
        await searchConnectionUsers(transaction, actor.id, "nova.pessoa@", 3),
      ).toEqual([]);
    }));

  it("cria conexão para conta existente e convite pendente para novo e-mail", () =>
    withRollback(async (transaction) => {
      const owner = await insertUser(transaction, "workspace_owner");
      const member = await insertUser(transaction, "workspace_member");
      const workspace = await insertSharedWorkspace(transaction, owner.id);

      const added = await addWorkspaceCollaboratorByEmail(
        transaction,
        owner.id,
        workspace.id,
        { email: member.email, role: "member" },
      );
      expect(added).toMatchObject({
        status: "member",
        user: { id: member.id },
      });
      const [connection] = await transaction
        .select()
        .from(userConnections)
        .where(
          and(
            eq(
              userConnections.userAId,
              owner.id < member.id ? owner.id : member.id,
            ),
            eq(
              userConnections.userBId,
              owner.id < member.id ? member.id : owner.id,
            ),
          ),
        );
      expect(connection?.workspaceConnectedAt).toBeInstanceOf(Date);

      const invited = await addWorkspaceCollaboratorByEmail(
        transaction,
        owner.id,
        workspace.id,
        { email: "pendente@example.test", role: "member" },
      );
      expect(invited).toMatchObject({
        status: "pending",
        invitation: { email: "pendente@example.test" },
      });
      const snapshot = await listUserWorkspaces(
        transaction,
        owner.id,
        workspace.id,
      );
      expect(
        snapshot.workspaces.find(({ id }) => id === workspace.id)?.invitations,
      ).toHaveLength(1);
    }));

  it("impede ultrapassar 20 colaboradores, contando convites pendentes", () =>
    withRollback(async (transaction) => {
      const owner = await insertUser(transaction, "limit_owner");
      const workspace = await insertSharedWorkspace(transaction, owner.id);
      await transaction.insert(workspaceInvitations).values(
        Array.from({ length: 20 }, (_, index) => ({
          workspaceId: workspace.id,
          invitedByUserId: owner.id,
          email: `pending-${index}@example.test`,
        })),
      );

      await expect(
        addWorkspaceCollaboratorByEmail(transaction, owner.id, workspace.id, {
          email: "pending-21@example.test",
          role: "member",
        }),
      ).rejects.toBeInstanceOf(WorkspaceOperationNotAllowedError);
    }));

  it("aceita automaticamente o convite quando o e-mail cria uma conta", () =>
    withRollback(async (transaction) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const owner = await insertUser(transaction, `invite_owner_${suffix}`);
      const workspace = await insertSharedWorkspace(transaction, owner.id);
      const email = `new-${suffix}@example.test`;
      const pending = await addWorkspaceCollaboratorByEmail(
        transaction,
        owner.id,
        workspace.id,
        { email, role: "member" },
      );
      expect(pending.status).toBe("pending");

      const registration = await registerAccount(transaction, {
        username: `new_${suffix}`,
        email,
        password: "Aa1234",
      });
      const [membership] = await transaction
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, registration.user.id),
          ),
        );
      expect(membership?.role).toBe("member");
      const [invitation] = await transaction
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.email, email));
      expect(invitation).toMatchObject({
        status: "accepted",
        acceptedByUserId: registration.user.id,
      });
    }));
});

afterAll(async () => {
  await pool.end();
});
