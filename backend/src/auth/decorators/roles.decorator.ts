import { SetMetadata } from '@nestjs/common';
import type { CompanyRole } from '../../generated/prisma/enums.js';
import { ROLES_KEY } from '../constants.js';

/** Restricts a route to the given roles within the caller's active company. */
export const Roles = (...roles: CompanyRole[]) => SetMetadata(ROLES_KEY, roles);
