import { Module } from '@nestjs/common';
import { BankAccountsController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { BankIntegrationModule } from '../bank-integration/bank-integration.module.js';

@Module({
  imports: [BankIntegrationModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
})
export class BankAccountsModule {}
