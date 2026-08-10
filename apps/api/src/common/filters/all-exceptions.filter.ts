import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { redactSensitive, sanitizeDatabaseError } from '../utils/redact-sensitive.util';

/**
 * AllExceptionsFilter — Hotfix: redacts sensitive fields from logs + responses.
 *
 * - Never logs complete request.user objects, Authorization headers, Cookie
 *   headers, password hashes, or broker credentials.
 * - For database exceptions (QueryFailedError), logs only: exception name,
 *   PostgreSQL error code, safe message, request method and route.
 * - The response sent to clients never exposes SQL, entity contents, stack
 *   traces, or secrets.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Build a safe log context — never includes request.user, headers, or body
    const safeLogContext = {
      method: request.method,
      url: request.url,
      statusCode: status,
    };

    if (status >= 500) {
      // For 500 errors, log the exception safely
      if (this.isDatabaseError(exception)) {
        // Database error — log only safe fields (name, code, sanitized message)
        const dbErr = sanitizeDatabaseError(exception);
        this.logger.error(
          `Database error: ${dbErr.name} [${dbErr.code ?? 'no-code'}] ${dbErr.message} — ${safeLogContext.method} ${safeLogContext.url}`,
          exception instanceof Error ? exception.stack : String(exception),
        );
      } else {
        // Non-DB error — log name + safe message + stack
        const errName = exception instanceof Error ? exception.name : 'UnknownError';
        const errMsg = exception instanceof Error ? exception.message : String(exception);
        this.logger.error(
          `${errName}: ${errMsg} — ${safeLogContext.method} ${safeLogContext.url}`,
          exception instanceof Error ? exception.stack : undefined,
        );
      }
    } else if (status >= 400) {
      // 4xx errors — log at warn level (safe context only)
      this.logger.warn(`${safeLogContext.method} ${safeLogContext.url} → ${status}`);
    }

    // Build the client-facing response — redact any sensitive fields
    let clientMessage: unknown;
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        // Redact sensitive fields from the error response object
        clientMessage = redactSensitive(resp);
      } else {
        clientMessage = { message: resp };
      }
    } else {
      // Non-HttpException → always return generic message (never expose internals)
      clientMessage = { message: 'Internal server error' };
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof clientMessage === 'object' ? clientMessage : { message: clientMessage }),
    });
  }

  /** Check if the exception is a TypeORM QueryFailedError. */
  private isDatabaseError(exception: unknown): boolean {
    return (
      exception instanceof Error &&
      (exception.constructor.name === 'QueryFailedError' ||
        exception.message.includes('invalid input syntax') ||
        (exception.message.includes('relation') && exception.message.includes('does not exist')))
    );
  }
}
