-- CreateTable
CREATE TABLE "tenant_quotas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metricType" "MetricType" NOT NULL,
    "limitValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_quotas_tenantId_metricType_key" ON "tenant_quotas"("tenantId", "metricType");

-- AddForeignKey
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
