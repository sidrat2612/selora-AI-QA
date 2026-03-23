import { SetMetadata } from '@nestjs/common';
import type { LicensedFeature } from './license.config';

export const LICENSE_FEATURE_KEY = 'licenseFeature';

export function RequireLicense(feature: LicensedFeature) {
  return SetMetadata(LICENSE_FEATURE_KEY, feature);
}
