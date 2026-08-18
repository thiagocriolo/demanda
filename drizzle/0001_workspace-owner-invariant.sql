CREATE FUNCTION "app"."guard_workspace_owner_membership"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
	current_owner uuid;
	current_kind text;
	previous_owner uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		SELECT owner_user_id
		INTO current_owner
		FROM "app"."workspaces"
		WHERE id = OLD.workspace_id;

		IF current_owner = OLD.user_id THEN
			RAISE EXCEPTION 'O vínculo do proprietário não pode ser removido.'
				USING ERRCODE = '23514',
				CONSTRAINT = 'workspace_owner_membership_required';
		END IF;

		RETURN OLD;
	END IF;

	SELECT owner_user_id, kind
	INTO current_owner, current_kind
	FROM "app"."workspaces"
	WHERE id = NEW.workspace_id;

	IF NEW.role = 'owner' AND current_owner IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'Somente o proprietário definido no workspace pode ter o papel owner.'
			USING ERRCODE = '23514',
			CONSTRAINT = 'workspace_owner_role_matches_workspace';
	END IF;

	IF current_kind = 'personal' AND current_owner IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'O workspace pessoal não aceita outros membros.'
			USING ERRCODE = '23514',
			CONSTRAINT = 'personal_workspace_single_member';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		SELECT owner_user_id
		INTO previous_owner
		FROM "app"."workspaces"
		WHERE id = OLD.workspace_id;

		IF OLD.role = 'owner' AND previous_owner = OLD.user_id AND (
			NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR
			NEW.user_id IS DISTINCT FROM OLD.user_id OR
			NEW.role IS DISTINCT FROM OLD.role
		) THEN
			RAISE EXCEPTION 'O vínculo do proprietário só pode mudar por transferência do workspace.'
				USING ERRCODE = '23514',
				CONSTRAINT = 'workspace_owner_membership_required';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "workspace_members_guard_owner"
BEFORE INSERT OR UPDATE OR DELETE ON "app"."workspace_members"
FOR EACH ROW
EXECUTE FUNCTION "app"."guard_workspace_owner_membership"();
--> statement-breakpoint
CREATE FUNCTION "app"."prevent_workspace_members_truncate"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	RAISE EXCEPTION 'workspace_members não pode ser truncada porque todo workspace precisa de proprietário.'
		USING ERRCODE = '23514',
		CONSTRAINT = 'workspace_owner_membership_required';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "workspace_members_prevent_truncate"
BEFORE TRUNCATE ON "app"."workspace_members"
FOR EACH STATEMENT
EXECUTE FUNCTION "app"."prevent_workspace_members_truncate"();
--> statement-breakpoint
CREATE FUNCTION "app"."guard_personal_workspace_members"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.kind = 'personal' AND EXISTS (
		SELECT 1
		FROM "app"."workspace_members" AS member
		WHERE member.workspace_id = NEW.id
			AND member.user_id <> NEW.owner_user_id
			AND NOT (
				OLD.kind = 'personal'
				AND member.user_id = OLD.owner_user_id
			)
	) THEN
		RAISE EXCEPTION 'O workspace pessoal não aceita outros membros.'
			USING ERRCODE = '23514',
			CONSTRAINT = 'personal_workspace_single_member';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "workspaces_guard_personal_members"
BEFORE UPDATE OF kind, owner_user_id ON "app"."workspaces"
FOR EACH ROW
EXECUTE FUNCTION "app"."guard_personal_workspace_members"();
--> statement-breakpoint
CREATE FUNCTION "app"."sync_workspace_owner_membership"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
		IF NEW.kind = 'personal' THEN
			DELETE FROM "app"."workspace_members"
			WHERE workspace_id = NEW.id
				AND user_id = OLD.owner_user_id
				AND role = 'owner';
		ELSE
			UPDATE "app"."workspace_members"
			SET role = 'admin', updated_at = now()
			WHERE workspace_id = NEW.id
				AND user_id = OLD.owner_user_id
				AND role = 'owner';
		END IF;
	END IF;

	INSERT INTO "app"."workspace_members" (
		workspace_id,
		user_id,
		role,
		joined_at,
		updated_at
	)
	VALUES (
		NEW.id,
		NEW.owner_user_id,
		'owner',
		now(),
		now()
	)
	ON CONFLICT (workspace_id, user_id)
	DO UPDATE SET role = 'owner', updated_at = now();

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "workspaces_sync_owner_membership"
AFTER INSERT OR UPDATE OF owner_user_id ON "app"."workspaces"
FOR EACH ROW
EXECUTE FUNCTION "app"."sync_workspace_owner_membership"();
