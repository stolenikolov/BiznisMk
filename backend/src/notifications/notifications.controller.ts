import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/**
 * The notification centre's REST half: what the bell loads on open, and what
 * it writes back when something is read.
 *
 * Open to every role, unlike the finance surfaces. Notifications are already
 * scoped by company and by viewer in the service, and a notification nobody
 * below CEO could read would be a notification that never reaches the person
 * it concerns. Listing the roles rather than dropping the guard is deliberate:
 * the guard is also what refuses a session that has not entered a company.
 */
@Controller('notifications')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO, CompanyRole.MANAGER, CompanyRole.EMPLOYEE)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsDto) {
    // companyId is guaranteed by CompanyRolesGuard.
    return this.notifications.list(user.companyId!, user.userId, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }

  /**
   * Declared before `:id/read` only for readability — the two never collide,
   * since one is a single path segment and the other is two.
   */
  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.companyId!, user.userId);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.companyId!, user.userId, id);
  }
}
