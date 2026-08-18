UPDATE "app"."workspaces"
SET "name" = 'Pessoal', "updated_at" = now()
WHERE "kind" = 'personal'
	AND "name" <> 'Pessoal';--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."canonicalize_personal_workspace_name"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."kind" = 'personal' THEN
		NEW."name" := 'Pessoal';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "workspaces_canonicalize_personal_name_trigger"
BEFORE INSERT OR UPDATE OF "name", "kind"
ON "app"."workspaces"
FOR EACH ROW
EXECUTE FUNCTION "app"."canonicalize_personal_workspace_name"();
