import { IsISO4217CurrencyCode, IsNumberString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName!: string;

  /**
   * Account number / IBAN. Kept as loose alphanumeric text: MK IBANs are
   * MK07 + 15 characters, but companies also track plain account numbers.
   */
  @IsString()
  @Matches(/^[A-Z0-9]{5,34}$/, { message: 'iban must be 5-34 letters or digits, no spaces' })
  iban!: string;

  @IsOptional()
  @IsISO4217CurrencyCode({ message: 'currency must be a valid ISO 4217 code' })
  currency?: string;

  /** Opening balance. Sent as a string so decimals survive the round trip. */
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'balance must be a number' })
  balance?: string;
}
