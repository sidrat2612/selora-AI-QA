import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../common/types';

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AppRequest>();
  return request.auth;
});