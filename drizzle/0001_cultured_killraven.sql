ALTER TABLE "reading_sessions" ADD COLUMN "explanation" text;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "explanation_ms" integer;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "explanation_spoken" boolean;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "explanation_feedback" jsonb;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "explanation_score" double precision;