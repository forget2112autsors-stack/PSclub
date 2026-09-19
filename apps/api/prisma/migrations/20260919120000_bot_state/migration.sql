-- CreateTable
CREATE TABLE "bot_state" (
    "chat_id" TEXT NOT NULL,
    "awaiting_pin" BOOLEAN NOT NULL DEFAULT false,
    "failed_pins" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_state_pkey" PRIMARY KEY ("chat_id")
);

