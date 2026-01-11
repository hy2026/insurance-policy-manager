-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_product_library" (
    "id" SERIAL NOT NULL,
    "insuranceCompany" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "policyDocumentId" TEXT,
    "approvalDate" DATE,
    "productInfo" JSONB,
    "coverages" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "trainingStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_product_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies_parsed" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "policyNumber" TEXT,
    "insuranceCompany" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "insuredPerson" TEXT NOT NULL,
    "policyHolder" TEXT,
    "beneficiary" TEXT,
    "policyStartYear" INTEGER NOT NULL,
    "birthYear" INTEGER,
    "basicSumInsured" DOUBLE PRECISION,
    "annualPremium" DOUBLE PRECISION,
    "paymentType" TEXT,
    "paymentPeriod" INTEGER,
    "coverageEndYear" INTEGER,
    "coverages" JSONB,
    "source" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_parsed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_coverage_library" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "coverageType" TEXT NOT NULL,
    "coverageName" TEXT NOT NULL,
    "diseaseCategory" TEXT,
    "clauseText" TEXT NOT NULL,
    "parsedResult" JSONB,
    "parseMethod" TEXT NOT NULL DEFAULT 'llm',
    "confidenceScore" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "isTrainingSample" BOOLEAN NOT NULL DEFAULT false,
    "annotationQuality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_coverage_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parsing_rules" (
    "id" SERIAL NOT NULL,
    "ruleType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "extraction" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usage" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parsing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_exports" (
    "id" SERIAL NOT NULL,
    "exportVersion" TEXT NOT NULL,
    "exportType" TEXT NOT NULL DEFAULT 'full',
    "totalSamples" INTEGER NOT NULL,
    "verifiedSamples" INTEGER NOT NULL,
    "coverageBreakdown" JSONB,
    "filePath" TEXT,
    "fileSizeKb" INTEGER,
    "zhipuJobId" TEXT,
    "zhipuModelId" TEXT,
    "trainingStatus" TEXT NOT NULL DEFAULT 'exported',
    "exportedBy" TEXT,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "insurance_product_library_policyType_idx" ON "insurance_product_library"("policyType");

-- CreateIndex
CREATE INDEX "insurance_product_library_insuranceCompany_idx" ON "insurance_product_library"("insuranceCompany");

-- CreateIndex
CREATE INDEX "insurance_product_library_trainingStatus_idx" ON "insurance_product_library"("trainingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_product_library_insuranceCompany_productName_key" ON "insurance_product_library"("insuranceCompany", "productName");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_userId_idx" ON "insurance_policies_parsed"("userId");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_userId_entity_idx" ON "insurance_policies_parsed"("userId", "entity");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_userId_policyType_idx" ON "insurance_policies_parsed"("userId", "policyType");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_userId_entity_policyType_idx" ON "insurance_policies_parsed"("userId", "entity", "policyType");

-- CreateIndex
CREATE INDEX "insurance_policies_parsed_policyNumber_idx" ON "insurance_policies_parsed"("policyNumber");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_productId_idx" ON "insurance_coverage_library"("productId");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_coverageType_idx" ON "insurance_coverage_library"("coverageType");

-- CreateIndex
CREATE INDEX "insurance_coverage_library_isTrainingSample_verified_idx" ON "insurance_coverage_library"("isTrainingSample", "verified");

-- CreateIndex
CREATE INDEX "parsing_rules_ruleType_enabled_idx" ON "parsing_rules"("ruleType", "enabled");

-- CreateIndex
CREATE INDEX "parsing_rules_priority_idx" ON "parsing_rules"("priority");

-- CreateIndex
CREATE INDEX "training_exports_exportVersion_idx" ON "training_exports"("exportVersion");

-- CreateIndex
CREATE INDEX "training_exports_trainingStatus_idx" ON "training_exports"("trainingStatus");

-- AddForeignKey
ALTER TABLE "insurance_policies_parsed" ADD CONSTRAINT "insurance_policies_parsed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_coverage_library" ADD CONSTRAINT "insurance_coverage_library_productId_fkey" FOREIGN KEY ("productId") REFERENCES "insurance_product_library"("id") ON DELETE CASCADE ON UPDATE CASCADE;
