import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { BankVerificationProvider } from './bank-verification.provider.js';
import { CheckAccountDto } from './dto/check-account.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';

@Controller('bank-verification')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class BankVerificationController {
  constructor(private readonly provider: BankVerificationProvider) {}

  @Post('check-account')
  @HttpCode(HttpStatus.OK)
  async checkAccount(@Body() dto: CheckAccountDto) {
    return this.provider.checkAccount(dto);
  }
}
