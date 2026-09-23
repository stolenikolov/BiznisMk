import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service.js';
import { parseDate, parseGranularity, parsePeriodPreset } from './finance-period.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

@Controller('transactions')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    // companyId is guaranteed by CompanyRolesGuard.
    return { transactions: await this.transactions.findRecent(user.companyId!) };
  }

  /** Aggregates behind the dashboard overview, for this month, quarter or year. */
  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser, @Query('period') period?: string) {
    return this.transactions.buildOverview(user.companyId!, parsePeriodPreset(period));
  }

  /**
   * Aggregates behind the finance page: summary and categories for the selected
   * period, plus the trend series at its own granularity. Unrecognised query
   * values fall back to this month / 30 days rather than failing the request.
   */
  @Get('finance')
  async finance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.transactions.buildFinance(user.companyId!, {
      preset: parsePeriodPreset(period),
      granularity: parseGranularity(granularity),
      from: parseDate(from),
      to: parseDate(to),
    });
  }
}
