import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppRequest } from '../common/types';
import { LICENSE_FEATURE_KEY } from './require-license.decorator';
import type { LicensedFeature } from './license.config';
import { LicenseService } from './license.service';

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly licenseService: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<LicensedFeature | undefined>(LICENSE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();

    try {
      this.licenseService.assertFeatureAllowed(feature);
      return true;
    } catch (error) {
      await this.licenseService.notifyBlockedFeatureAttempt(feature, request);
      throw error;
    }
  }
}
