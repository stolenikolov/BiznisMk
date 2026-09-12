import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CompanyLegalForm } from '../../generated/prisma/enums.js';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /**
   * ЕМБС — Централен регистар registration number. Canonically 7 digits, but
   * the bound is kept loose on purpose so no legitimate value is rejected.
   */
  @IsString()
  @Matches(/^\d{4,20}$/, { message: 'embs must contain digits only' })
  embs!: string;

  /** ЕДБ — УЈП tax number. Canonically 13 digits; same reasoning as above. */
  @IsString()
  @Matches(/^\d{4,20}$/, { message: 'edb must contain digits only' })
  edb!: string;

  @IsEnum(CompanyLegalForm)
  legalForm!: CompanyLegalForm;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  registeredAddress!: string;

  /** Required with no default: the company must state its VAT status. */
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isVatPayer!: boolean;
}
