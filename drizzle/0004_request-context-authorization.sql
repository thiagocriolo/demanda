CREATE TABLE "app"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" varchar(160),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(512),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_action_not_blank" CHECK (length(btrim("app"."audit_logs"."action")) > 0),
	CONSTRAINT "audit_logs_target_type_not_blank" CHECK (length(btrim("app"."audit_logs"."target_type")) > 0),
	CONSTRAINT "audit_logs_target_id_not_blank" CHECK ("app"."audit_logs"."target_id" is null or length(btrim("app"."audit_logs"."target_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD COLUMN "active_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_at_index" ON "app"."audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_index" ON "app"."audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_active_workspace_id_workspaces_id_fk" FOREIGN KEY ("active_workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_active_workspace_id_index" ON "app"."auth_sessions" USING btree ("active_workspace_id");--> statement-breakpoint
CREATE FUNCTION "app"."guard_audit_logs_append_only"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	-- ON DELETE SET NULL is the sole mutation allowed: it preserves the event
	-- after the actor is removed while rejecting equivalent direct updates.
	IF TG_OP = 'UPDATE'
		AND pg_trigger_depth() > 1
		AND OLD.actor_user_id IS NOT NULL
		AND NEW.actor_user_id IS NULL
		AND NEW.id IS NOT DISTINCT FROM OLD.id
		AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id
		AND NEW.action IS NOT DISTINCT FROM OLD.action
		AND NEW.target_type IS NOT DISTINCT FROM OLD.target_type
		AND NEW.target_id IS NOT DISTINCT FROM OLD.target_id
		AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
		AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
		AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
		AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
	THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'audit_logs is append-only and cannot be changed.'
		USING ERRCODE = '23514',
		CONSTRAINT = 'audit_logs_append_only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "app"."audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "app"."guard_audit_logs_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_prevent_truncate"
BEFORE TRUNCATE ON "app"."audit_logs"
FOR EACH STATEMENT
EXECUTE FUNCTION "app"."guard_audit_logs_append_only"();
