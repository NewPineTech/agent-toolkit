ALTER TABLE "workspaces" ADD COLUMN "provider_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
