ALTER TABLE "users" ADD COLUMN "share_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_share_token_hash_unique" UNIQUE("share_token_hash");