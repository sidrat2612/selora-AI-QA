-- AlterTable
ALTER TABLE "generated_test_artifacts"
ADD COLUMN "metadataJson" JSONB,
ADD COLUMN "validationStartedAt" TIMESTAMP(3),
ADD COLUMN "validatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "artifacts"
ADD COLUMN "generatedTestArtifactId" TEXT;

-- CreateIndex
CREATE INDEX "artifacts_workspaceId_generatedTestArtifactId_artifactType_idx"
ON "artifacts"("workspaceId", "generatedTestArtifactId", "artifactType");

-- AddForeignKey
ALTER TABLE "artifacts"
ADD CONSTRAINT "artifacts_generatedTestArtifactId_fkey"
FOREIGN KEY ("generatedTestArtifactId") REFERENCES "generated_test_artifacts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;