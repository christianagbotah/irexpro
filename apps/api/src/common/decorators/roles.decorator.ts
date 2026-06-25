import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../../modules/users/entities/role.entity';
import { ROLES_KEY } from '../constants/roles.constants';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
