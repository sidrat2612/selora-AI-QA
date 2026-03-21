import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AppRequest } from './types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<AppRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const errorResponse = exception.getResponse();
      const payload = typeof errorResponse === 'object' && errorResponse !== null ? errorResponse : {};
      const code = typeof (payload as { code?: unknown }).code === 'string' ? (payload as { code: string }).code : 'HTTP_ERROR';
      const message =
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : exception.message;
      const details =
        typeof (payload as { details?: unknown }).details === 'object'
          ? ((payload as { details?: Record<string, unknown> }).details ?? {})
          : {};

      response.status(status).json({
        error: {
          code,
          message,
          requestId: request.requestId,
          details,
        },
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId: request.requestId,
        details: {},
      },
    });
  }
}