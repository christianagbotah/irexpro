import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedPrincipal } from '../interfaces/authenticated-principal.interface';

/**
 * Extract the userId from the authenticated principal on the request.
 * Internal factory — exported for unit testing.
 */
export function extractUserId(ctx: ExecutionContext): string {
  const request = ctx.switchToHttp().getRequest();
  const principal = request.user as AuthenticatedPrincipal | undefined;

  if (!principal || !principal.userId || typeof principal.userId !== 'string') {
    throw new UnauthorizedException('Authenticated user identity is missing or malformed');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(principal.userId)) {
    throw new UnauthorizedException('Authenticated user identity is not a valid UUID');
  }

  return principal.userId;
}

/**
 * Extract the sanitized AuthenticatedPrincipal from the request.
 * Internal factory — exported for unit testing.
 */
export function extractPrincipal(ctx: ExecutionContext): AuthenticatedPrincipal {
  const request = ctx.switchToHttp().getRequest();
  return request.user as AuthenticatedPrincipal;
}

/**
 * CurrentUser decorator — returns the sanitized AuthenticatedPrincipal from
 * request.user. Contains ONLY { userId, email, phone, roles, status }.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => extractPrincipal(ctx),
);

/**
 * CurrentUserId decorator — returns ONLY the userId string from the
 * authenticated principal. Throws UnauthorizedException if the principal
 * is missing or malformed (no valid UUID).
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => extractUserId(ctx),
);
