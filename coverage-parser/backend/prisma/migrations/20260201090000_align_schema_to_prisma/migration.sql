-- Align database schema with current prisma/schema.prisma.
-- This migration is designed to be safe to apply on an existing (possibly partially migrated) database.
-- It uses IF NOT EXISTS where possible to avoid failing when fields/indexes already exist.

-- =========================
-- insurance_product_library
-- =========================
ALTER TABLE "insurance_product_library"
  ADD COLUMN IF NOT EXISTS "policyId" TEXT,
  ADD COLUMN IF NOT EXISTS "productCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "productSubCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "coveragePeriod" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentPeriod" TEXT,
  ADD COLUMN IF NOT EXISTS "salesStatus" TEXT NOT NULL DEFAULT '在售',
  ADD COLUMN IF NOT EXISTS "diseaseCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "deathCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "accidentCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "annuityCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- policyId should be unique when present
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_product_library_policyId_key"
  ON "insurance_product_library"("policyId");

CREATE INDEX IF NOT EXISTS "insurance_product_library_policyId_idx"
  ON "insurance_product_library"("policyId");
CREATE INDEX IF NOT EXISTS "insurance_product_library_salesStatus_idx"
  ON "insurance_product_library"("salesStatus");
CREATE INDEX IF NOT EXISTS "insurance_product_library_productCategory_idx"
  ON "insurance_product_library"("productCategory");
CREATE INDEX IF NOT EXISTS "insurance_product_library_diseaseCount_idx"
  ON "insurance_product_library"("diseaseCount");
CREATE INDEX IF NOT EXISTS "insurance_product_library_deathCount_idx"
  ON "insurance_product_library"("deathCount");
CREATE INDEX IF NOT EXISTS "insurance_product_library_accidentCount_idx"
  ON "insurance_product_library"("accidentCount");
CREATE INDEX IF NOT EXISTS "insurance_product_library_annuityCount_idx"
  ON "insurance_product_library"("annuityCount");

-- =========================
-- insured_persons
-- =========================
-- Current prisma schema expects uniqueness on (userId, entity)
DROP INDEX IF EXISTS "insured_persons_userId_entity_birthYear_key";
CREATE UNIQUE INDEX IF NOT EXISTS "insured_persons_userId_entity_key"
  ON "insured_persons"("userId", "entity");

-- =========================
-- insurance_policies_parsed
-- =========================
ALTER TABLE "insurance_policies_parsed"
  ADD COLUMN IF NOT EXISTS "policyIdNumber" TEXT;

CREATE INDEX IF NOT EXISTS "insurance_policies_parsed_policyIdNumber_idx"
  ON "insurance_policies_parsed"("policyIdNumber");

-- Unique constraint in prisma: (userId, policyIdNumber, entity)
-- Implemented as a unique index for Postgres IF NOT EXISTS compatibility.
CREATE UNIQUE INDEX IF NOT EXISTS "insurance_policies_parsed_userId_policyIdNumber_entity_key"
  ON "insurance_policies_parsed"("userId", "policyIdNumber", "entity");

-- =========================
-- insurance_coverage_library
-- =========================
-- Make productId nullable (prisma allows null + ON DELETE SET NULL)
ALTER TABLE "insurance_coverage_library"
  ALTER COLUMN "productId" DROP NOT NULL;

-- Ensure new columns exist
ALTER TABLE "insurance_coverage_library"
  ADD COLUMN IF NOT EXISTS "isRequired" TEXT NOT NULL DEFAULT '可选',
  ADD COLUMN IF NOT EXISTS "responsibilityLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "policyIdNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER;

-- Replace FK to match prisma (ON DELETE SET NULL)
ALTER TABLE "insurance_coverage_library"
  DROP CONSTRAINT IF EXISTS "insurance_coverage_library_productId_fkey";
ALTER TABLE "insurance_coverage_library"
  ADD CONSTRAINT "insurance_coverage_library_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "insurance_product_library"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "insurance_coverage_library_policyIdNumber_idx"
  ON "insurance_coverage_library"("policyIdNumber");
CREATE INDEX IF NOT EXISTS "insurance_coverage_library_sequenceNumber_idx"
  ON "insurance_coverage_library"("sequenceNumber");
