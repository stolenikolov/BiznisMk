import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { BankIntegrationProvider } from './bank-integration.provider.js';
import { CheckAccountDto } from './dto/check-account.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';

@Controller('bank-integration')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class BankIntegrationController {
  constructor(private readonly provider: BankIntegrationProvider) {}

  @Post('check-account')
  @HttpCode(HttpStatus.OK)
  async checkAccount(@Body() dto: CheckAccountDto) {
    return this.provider.checkAccount(dto);
  }
}
