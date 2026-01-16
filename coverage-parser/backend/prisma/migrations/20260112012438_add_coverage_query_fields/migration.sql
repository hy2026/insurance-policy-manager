-- AlterTable
ALTER TABLE "insurance_coverage_library" ADD COLUMN     "intervalPeriod" TEXT,
ADD COLUMN     "isGrouped" BOOLEAN,
ADD COLUMN     "isPremiumWaiver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRepeatablePayout" BOOLEAN,
ADD COLUMN     "payoutCount" TEXT;

-- CreateIndex
CREATE INDEX "insurance_coverage_library_payoutCount_idx" ON "insurance_coverage_library"("payoutCount");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_isRepeatablePayout_idx" ON "insurance_coverage_library"("isRepeatablePayout");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_isGrouped_idx" ON "insurance_coverage_library"("isGrouped");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_isPremiumWaiver_idx" ON "insurance_coverage_library"("isPremiumWaiver");
