CREATE TABLE "agentic_run_audits" (
	"run_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"workspace_id" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"selected_intents" text[] DEFAULT '{}' NOT NULL,
	"warning_codes" text[] DEFAULT '{}' NOT NULL,
	"evidence_refs" text[] DEFAULT '{}' NOT NULL,
	"state_delta" jsonb,
	"retained_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentic_run_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"node_name" text NOT NULL,
	"logical_step" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"warning_codes" text[] DEFAULT '{}' NOT NULL,
	"evidence_refs" text[] DEFAULT '{}' NOT NULL,
	"state_delta" jsonb
);
--> statement-breakpoint
CREATE TABLE "agentic_tool_call_audits" (
	"tool_call_id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"run_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"capability_id" text,
	"server_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"warning_codes" text[] DEFAULT '{}' NOT NULL,
	"evidence_refs" text[] DEFAULT '{}' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "agentic_run_audits" ADD CONSTRAINT "agentic_run_audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_run_events" ADD CONSTRAINT "agentic_run_events_run_id_agentic_run_audits_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agentic_run_audits"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_tool_call_audits" ADD CONSTRAINT "agentic_tool_call_audits_event_id_agentic_run_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."agentic_run_events"("event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentic_tool_call_audits" ADD CONSTRAINT "agentic_tool_call_audits_run_id_agentic_run_audits_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agentic_run_audits"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agentic_run_audits_thread_started_idx" ON "agentic_run_audits" USING btree ("thread_id","started_at");--> statement-breakpoint
CREATE INDEX "agentic_run_audits_workspace_started_idx" ON "agentic_run_audits" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "agentic_run_audits_status_idx" ON "agentic_run_audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agentic_run_audits_retained_until_idx" ON "agentic_run_audits" USING btree ("retained_until");--> statement-breakpoint
CREATE INDEX "agentic_run_events_run_sequence_idx" ON "agentic_run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "agentic_run_events_thread_sequence_idx" ON "agentic_run_events" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE INDEX "agentic_tool_call_audits_run_sequence_idx" ON "agentic_tool_call_audits" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "agentic_tool_call_audits_capability_idx" ON "agentic_tool_call_audits" USING btree ("capability_id");