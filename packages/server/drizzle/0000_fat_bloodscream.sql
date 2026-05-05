CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider_session_id" text,
	"user_id" text,
	"user_fingerprint" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"workspace_id" text NOT NULL,
	"date" date NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_workspace_id_date_pk" PRIMARY KEY("workspace_id","date")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_type" text DEFAULT 'ragflow' NOT NULL,
	"provider_agent_id" text NOT NULL,
	"provider_api_key" text NOT NULL,
	"provider_base_url" text NOT NULL,
	"allowed_domains" text[] DEFAULT '{}' NOT NULL,
	"auth_mode" text DEFAULT 'anonymous' NOT NULL,
	"auth_secret" text,
	"rate_limit_config" jsonb DEFAULT '{"maxRequests":30,"windowMs":60000}'::jsonb NOT NULL,
	"max_message_length" integer DEFAULT 4000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_workspace_id_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_fingerprint_idx" ON "sessions" USING btree ("workspace_id","user_fingerprint");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "usage_workspace_date_idx" ON "usage" USING btree ("workspace_id","date");