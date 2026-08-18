CREATE TABLE "app"."user_connections" (
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"manual_connected_at" timestamp (3) with time zone,
	"workspace_connected_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_connections_user_pair_primary_key" PRIMARY KEY("user_a_id","user_b_id"),
	CONSTRAINT "user_connections_canonical_pair" CHECK ("app"."user_connections"."user_a_id" < "app"."user_connections"."user_b_id"),
	CONSTRAINT "user_connections_has_source" CHECK ("app"."user_connections"."manual_connected_at" is not null or "app"."user_connections"."workspace_connected_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_email_normalized" CHECK ("app"."workspace_invitations"."email" = lower(btrim("app"."workspace_invitations"."email"))),
	CONSTRAINT "workspace_invitations_email_has_at_sign" CHECK (position('@' in "app"."workspace_invitations"."email") > 1),
	CONSTRAINT "workspace_invitations_role_allowed" CHECK ("app"."workspace_invitations"."role" in ('admin', 'member')),
	CONSTRAINT "workspace_invitations_status_allowed" CHECK ("app"."workspace_invitations"."status" in ('pending', 'accepted', 'revoked')),
	CONSTRAINT "workspace_invitations_acceptance_consistent" CHECK (("app"."workspace_invitations"."status" = 'accepted') = ("app"."workspace_invitations"."accepted_at" is not null and "app"."workspace_invitations"."accepted_by_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "app"."user_connections" ADD CONSTRAINT "user_connections_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_connections" ADD CONSTRAINT "user_connections_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_connections_user_b_id_index" ON "app"."user_connections" USING btree ("user_b_id");--> statement-breakpoint
INSERT INTO "app"."user_connections" (
	"user_a_id",
	"user_b_id",
	"workspace_connected_at"
)
SELECT
	LEAST(first_member."user_id", second_member."user_id"),
	GREATEST(first_member."user_id", second_member."user_id"),
	MIN(GREATEST(first_member."joined_at", second_member."joined_at"))
FROM "app"."workspace_members" first_member
INNER JOIN "app"."workspace_members" second_member
	ON second_member."workspace_id" = first_member."workspace_id"
	AND first_member."user_id" < second_member."user_id"
GROUP BY
	LEAST(first_member."user_id", second_member."user_id"),
	GREATEST(first_member."user_id", second_member."user_id")
ON CONFLICT ("user_a_id", "user_b_id") DO UPDATE
SET
	"workspace_connected_at" = COALESCE(
		"app"."user_connections"."workspace_connected_at",
		EXCLUDED."workspace_connected_at"
	),
	"updated_at" = now();--> statement-breakpoint
CREATE INDEX "workspace_invitations_workspace_status_index" ON "app"."workspace_invitations" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "workspace_invitations_email_status_index" ON "app"."workspace_invitations" USING btree ("email","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_pending_email_unique" ON "app"."workspace_invitations" USING btree ("workspace_id",lower("email")) WHERE "app"."workspace_invitations"."status" = 'pending';
