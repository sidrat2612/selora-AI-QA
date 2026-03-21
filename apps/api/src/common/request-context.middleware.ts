import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './types';

export function applyRequestContext(request: AppRequest, response: Response, next: NextFunction) {
  request.requestId = request.header('x-request-id') ?? randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: AppRequest, response: Response, next: NextFunction) {
    applyRequestContext(request, response, next);
  }
}