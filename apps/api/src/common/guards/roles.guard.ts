import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../../modules/users/entities/role.entity';
import { ROLES_KEY } from '../constants/roles.constants';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: User & { roles?: RoleName[] } = request.user;

    if (!user) throw new ForbiddenException('Access denied');

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (!hasRole) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
