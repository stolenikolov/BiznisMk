import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../constants.js';
import type { CompanyRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../types/jwt-payload.type.js';

/**
 * Enforces the caller's role inside their active company.
 *
 * The role travels in the access token, which is only issued with company
 * claims by POST /auth/switch-company — so a caller who has authenticated but
 * not entered a company has no company context and is refused here rather than
 * being treated as unprivileged.
 */
@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<CompanyRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!user?.companyId) {
      throw new ForbiddenException('No active company selected');
    }
    if (!user.role || !required.includes(user.role)) {
      throw new ForbiddenException('Your role in this company does not allow this action');
    }
    return true;
  }
}
