import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { PayrollRunService } from './payroll-run.service.js';
import { NetSalaryQueryDto } from './dto/net-salary-query.dto.js';
import { ConfirmPayrollRunDto } from './dto/confirm-payroll-run.dto.js';
import { BankPayrollError } from '../bank-integration/bank-payroll.provider.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { activeCompany } from '../auth/active-company.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/**
 * Codes that mean "the run as priced is no longer executable" rather than
 * "this can never work": the state at the bank moved under us, so the answer
 * is 409 and the UI's advice is to price it again.
 */
const STALE_AT_BANK = new Set([
  'PAYROLL_REQUEST_NOT_PENDING',
  'ACCOUNT_NOT_ACTIVE',
  'CURRENCY_MISMATCH',
]);

/** CEO-only, like the rest of the salary-bearing surface. */
@Controller('companies/:companyId/payroll')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly runs: PayrollRunService,
  ) {}

  /**
   * The gross → net breakdown for an amount that is not stored anywhere yet,
   * so the employee form can show it while the salary is being typed without
   * a second copy of the formula in the browser.
   */
  @Get('net-salary')
  async netSalary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: NetSalaryQueryDto,
  ) {
    const year = query.year ?? new Date().getFullYear();
    return { breakdown: await this.payroll.calculateNetSalary(activeCompany(user, companyId), query.gross, year) };
  }

  /** Whether this period's salaries are still owed, and what they come to. */
  @Get('run')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return { run: await this.runs.status(activeCompany(user, companyId)) };
  }

  /**
   * Prices the run at the bank without moving anything, so the owner sees who
   * is paid what, from which account, and what is left on it afterwards.
   */
  @Post('run/preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.translateBankErrors(() => this.runs.preview(activeCompany(user, companyId)));
  }

  /** Executes a priced run. This is the click that moves the money. */
  @Post('run/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: ConfirmPayrollRunDto,
  ) {
    const run = await this.translateBankErrors(() =>
      this.runs.confirm(activeCompany(user, companyId), dto.requestId),
    );

    return { run };
  }

  /**
   * The bank's refusals, as HTTP the browser can act on. The code is passed
   * through untouched — the UI explains `INSUFFICIENT_FUNDS` in the user's own
   * language, and an unknown code still reads as a refusal rather than a crash.
   */
  private async translateBankErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof BankPayrollError)) throw error;

      const body = {
        errorCode: error.code,
        message: error.message,
        ...(error.uncovered.length > 0 ? { uncovered: error.uncovered } : {}),
      };

      throw STALE_AT_BANK.has(error.code)
        ? new ConflictException(body)
        : new UnprocessableEntityException(body);
    }
  }
}
