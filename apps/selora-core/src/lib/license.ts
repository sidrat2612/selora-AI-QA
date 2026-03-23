import type { LicenseStatus } from "@selora/domain";

export function isCommercialFeatureBlocked(licenseStatus?: LicenseStatus | null): boolean {
  return Boolean(
    licenseStatus?.enforcementEnabled && !licenseStatus.commercialUseAllowed,
  );
}