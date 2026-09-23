import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description!: string;

  /**
   * Quantity and money travel as strings so decimals survive the round trip
   * without ever being parsed into a float.
   */
  @IsNumberString({ no_symbols: false }, { message: 'quantity must be a number' })
  quantity!: string;

  @IsNumberString({ no_symbols: false }, { message: 'unitPrice must be a number' })
  unitPrice!: string;

  /** Percent, e.g. "18". Ignored outright when the issuer is not VAT-registered. */
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'vatRate must be a number' })
  vatRate?: string;
}

export class CreateInvoiceDto {
  /**
   * OUTGOING (default) is an invoice we issue and number ourselves. INCOMING is
   * a supplier bill we owe, which arrives with its own number.
   */
  @IsOptional()
  @IsIn(["OUTGOING", "INCOMING"])
  direction?: "OUTGOING" | "INCOMING";

  /** Required for an INCOMING bill: the number the supplier printed on it. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  invoiceNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  clientAddress!: string;

  /** Client's ЕДБ — omitted for invoices issued to a natural person. */
  @IsOptional()
  @Matches(/^\d{4,20}$/, { message: 'clientEdb must contain digits only' })
  clientEdb?: string;

  @IsISO8601({ strict: true }, { message: 'issueDate must be an ISO date' })
  issueDate!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'dueDate must be an ISO date' })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** At least one line: an invoice with nothing on it is not a document. */
  @IsArray()
  @ArrayMinSize(1, { message: 'an invoice needs at least one line' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
