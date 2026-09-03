import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getCorrelationId } from '../utils/request-correlation.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    // Use path rather than url so query-string tokens/codes/identifiers cannot
    // be copied into operational logs.
    const path = request.path || request.url?.split('?')[0] || 'unknown';
    const correlationId = getCorrelationId() ?? 'background';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const ms = Date.now() - start;
          this.logger.log(
            `[cid=${correlationId}] ${method} ${path} → ${response.statusCode} [${ms}ms]`,
          );
        },
        error: () => {
          const ms = Date.now() - start;
          this.logger.warn(`[cid=${correlationId}] ${method} ${path} → ERROR [${ms}ms]`);
        },
      }),
    );
  }
}
