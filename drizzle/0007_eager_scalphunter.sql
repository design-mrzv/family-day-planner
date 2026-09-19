CREATE TABLE "task_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"color_index" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_colors_user_id_task_key_unique" UNIQUE("user_id","task_key")
);
--> statement-breakpoint
ALTER TABLE "task_colors" ADD CONSTRAINT "task_colors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;