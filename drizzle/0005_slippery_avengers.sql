ALTER TABLE "telegram_link_codes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "telegram_link_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_telegram_chat_id_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "telegram_chat_id";