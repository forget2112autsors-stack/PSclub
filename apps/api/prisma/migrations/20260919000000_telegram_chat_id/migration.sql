-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "telegram_chat_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "app_user_telegram_chat_id_key" ON "app_user"("telegram_chat_id");

