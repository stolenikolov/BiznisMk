import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateInvoiceLineDto } from './create-invoice.dto.js';

/** Just the lines — enough to price an invoice that has not been issued yet. */
export class PreviewInvoiceTotalsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'an invoice needs at least one line' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
