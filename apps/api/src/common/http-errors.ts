import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

type ErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function badRequest(code: string, message: string, details?: Record<string, unknown>) {
  return new BadRequestException({ code, message, details } satisfies ErrorPayload);
}

export function unauthorized(code: string, message: string, details?: Record<string, unknown>) {
  return new UnauthorizedException({ code, message, details } satisfies ErrorPayload);
}

export function forbidden(code: string, message: string, details?: Record<string, unknown>) {
  return new ForbiddenException({ code, message, details } satisfies ErrorPayload);
}

export function conflict(code: string, message: string, details?: Record<string, unknown>) {
  return new ConflictException({ code, message, details } satisfies ErrorPayload);
}

export function notFound(code: string, message: string, details?: Record<string, unknown>) {
  return new NotFoundException({ code, message, details } satisfies ErrorPayload);
}

export function serviceUnavailable(code: string, message: string, details?: Record<string, unknown>) {
  return new ServiceUnavailableException({ code, message, details } satisfies ErrorPayload);
}

export function tooManyRequests(code: string, message: string, details?: Record<string, unknown>) {
  return new HttpException({ code, message, details } satisfies ErrorPayload, HttpStatus.TOO_MANY_REQUESTS);
}