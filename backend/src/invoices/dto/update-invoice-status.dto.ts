import { IsEnum } from 'class-validator';
import { InvoiceStatus } from '../../generated/prisma/enums.js';

export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status!: InvoiceStatus;
}
