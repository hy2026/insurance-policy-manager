-- AlterTable
ALTER TABLE "insurance_coverage_library" 
ADD COLUMN "aiModified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiModifiedAt" TIMESTAMP(3),
ADD COLUMN "aiModificationNote" TEXT;
