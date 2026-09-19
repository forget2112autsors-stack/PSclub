-- AlterTable
ALTER TABLE "expense" ADD COLUMN     "supplier_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movement" ADD COLUMN     "supplier_id" TEXT;

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_club_id_idx" ON "supplier"("club_id");

-- CreateIndex
CREATE INDEX "expense_supplier_id_idx" ON "expense"("supplier_id");

-- CreateIndex
CREATE INDEX "stock_movement_supplier_id_idx" ON "stock_movement"("supplier_id");

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

