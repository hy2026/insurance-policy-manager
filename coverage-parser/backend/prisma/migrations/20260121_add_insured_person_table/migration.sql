-- CreateTable
CREATE TABLE "insured_persons" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "entity" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "name" TEXT,
    "gender" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insured_persons_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "insurance_policies_parsed" ADD COLUMN "insuredPersonId" INTEGER;

-- CreateIndex
CREATE INDEX "insured_persons_userId_idx" ON "insured_persons"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "insured_persons_userId_entity_birthYear_key" ON "insured_persons"("userId", "entity", "birthYear");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_insuredPersonId_idx" ON "insurance_policies_parsed"("insuredPersonId");

-- AddForeignKey
ALTER TABLE "insured_persons" ADD CONSTRAINT "insured_persons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies_parsed" ADD CONSTRAINT "insurance_policies_parsed_insuredPersonId_fkey" FOREIGN KEY ("insuredPersonId") REFERENCES "insured_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;








