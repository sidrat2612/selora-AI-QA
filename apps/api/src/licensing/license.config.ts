import { badRequest } from '../common/http-errors';

export type LicenseTier = 'evaluation' | 'commercial';

export type LicensedFeature =
  | 'github_integration'
  | 'testrail_integration'
  | 'artifact_publication';

export type LicenseConfig = {
  enforcementEnabled: boolean;
  tier: LicenseTier;
  key: string | null;
  licensedTo: string | null;
  alertEmail: string | null;
};

export function getLicenseConfig(env: NodeJS.ProcessEnv): LicenseConfig {
  const rawTier = (env['LICENSE_TIER'] ?? 'evaluation').trim().toLowerCase();
  if (rawTier !== 'evaluation' && rawTier !== 'commercial') {
    throw badRequest('LICENSE_TIER_INVALID', 'LICENSE_TIER must be either evaluation or commercial.');
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
