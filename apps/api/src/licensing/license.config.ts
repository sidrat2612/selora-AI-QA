export type LicenseTier = 'evaluation' | 'commercial';

export type LicensedFeature =
  | 'github_integration'
  | 'testrail_integration'
  | 'artifact_publication';

export const LICENSE_TIERS: readonly LicenseTier[] = ['evaluation', 'commercial'];

export const PROTECTED_LICENSE_FEATURES: readonly LicensedFeature[] = [
  'github_integration',
  'testrail_integration',
  'artifact_publication',
];

export type LicenseConfig = {
  enforcementEnabled: boolean;
  tier: LicenseTier;
  key: string | null;
  licensedTo: string | null;
  alertEmail: string | null;
};

function isLicenseTier(value: string): value is LicenseTier {
  return LICENSE_TIERS.includes(value as LicenseTier);
}

export function getLicenseConfig(env: NodeJS.ProcessEnv): LicenseConfig {
  const rawTier = (env['LICENSE_TIER'] ?? 'evaluation').trim().toLowerCase();
  if (!isLicenseTier(rawTier)) {
    throw new Error('LICENSE_TIER must be either evaluation or commercial.');
  }

  const rawEnforcement = env['LICENSE_ENFORCEMENT']?.trim().toLowerCase();
  const enforcementEnabled =
    rawEnforcement === undefined
      ? env['NODE_ENV'] === 'production'
      : rawEnforcement === 'true';

  return {
    enforcementEnabled,
    tier: rawTier,
    key: env['LICENSE_KEY']?.trim() || null,
    licensedTo: env['LICENSED_TO']?.trim() || null,
    alertEmail: env['LICENSE_ALERT_EMAIL']?.trim() || null,
  };
}
