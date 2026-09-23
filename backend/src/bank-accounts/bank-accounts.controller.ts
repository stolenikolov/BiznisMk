import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service.js';
import { CreateBankAccountDto } from './dto/create-bank-account.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/** CEO-only for now; Manager/Employee access is a later layer. */
@Controller('bank-accounts')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    // companyId is guaranteed by CompanyRolesGuard.
    return this.bankAccountsService.findAllForCompany(user.companyId!);
  }

  @Get(':accountId')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('accountId') accountId: string) {
    return { account: await this.bankAccountsService.findOneForCompany(user.companyId!, accountId) };
  }

  /** That account's own statement, for its detail page. */
  @Get(':accountId/transactions')
  async findTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
  ) {
    const take = Number(limit);
    return this.bankAccountsService.findTransactions(
      user.companyId!,
      accountId,
      Number.isFinite(take) && take > 0 ? take : 50,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBankAccountDto) {
    const account = await this.bankAccountsService.create(user.companyId!, dto);
    return { account };
  }
}
