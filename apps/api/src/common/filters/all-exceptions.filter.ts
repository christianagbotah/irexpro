import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { redactSensitive } from '../utils/redact-sensitive.util';
import { getCorrelationId } from '../utils/request-correlation.util';

/**
 * AllExceptionsFilter — redacts sensitive fields from logs + responses.
 *
 * - Never logs complete request.user objects, Authorization headers, Cookie
 *   headers, password hashes, or broker credentials.
 * - Logs the server-generated correlation ID so support/security can connect
 *   an error response to its operational log record without logging request
 *   bodies or query strings.
 * - For database exceptions (QueryFailedError), logs only: exception category,
 *   request method, safe route path, HTTP status, and correlation ID.
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
    const correlationId = getCorrelationId();

    const safeLogContext = {
      method: request.method,
      path: request.path || request.url?.split('?')[0] || 'unknown',
      statusCode: status,
      correlationId: correlationId ?? 'background',
    };

    if (status >= 500) {
      const category = this.isDatabaseError(exception)
        ? 'DatabaseError'
        : exception instanceof Error
          ? exception.name
          : 'UnknownError';
      this.logger.error(
        `[cid=${safeLogContext.correlationId}] ${category} — ${safeLogContext.method} ${safeLogContext.path} → ${status}`,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `[cid=${safeLogContext.correlationId}] ${safeLogContext.method} ${safeLogContext.path} → ${status}`,
      );
    }

    let clientMessage: unknown;
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        clientMessage = redactSensitive(resp);
      } else {
        clientMessage = { message: resp };
      }
    } else {
      clientMessage = { message: 'Internal server error' };
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: safeLogContext.path,
      ...(correlationId ? { correlationId } : {}),
      ...(typeof clientMessage === 'object' ? clientMessage : { message: clientMessage }),
    });
  }

  private isDatabaseError(exception: unknown): boolean {
    return (
      exception instanceof Error &&
      (exception.constructor.name === 'QueryFailedError' ||
        exception.message.includes('invalid input syntax') ||
        (exception.message.includes('relation') && exception.message.includes('does not exist')))
    );
  }
}
