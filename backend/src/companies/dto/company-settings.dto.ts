import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CompanyLegalForm } from '../../generated/prisma/enums.js';
import { NormalizeEmail } from '../../auth/dto/normalize-email.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** A cleared optional field arrives as "" from a form; it means "none". */
const blankToNull = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

/** Validate only when sent; a sent null is refused by the field's own rules. */
const WhenSent = () => ValidateIf((_, value) => value !== undefined);

/** Validate only when sent and not cleared. */
const WhenSetTo = () => ValidateIf((_, value) => value !== undefined && value !== null);

/** The VAT rates Macedonian law defines; the default one prefills new invoice lines. */
export const VAT_RATES = [18, 10, 5] as const;

/**
 * Any subset of the company's settings; each card on the settings page sends
 * only its own fields. ЕМБС and ЕДБ are not here: they are the company's
 * legal identity, printed on every invoice already issued.
 */
export class UpdateCompanySettingsDto {
  @WhenSent()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @WhenSent()
  @IsEnum(CompanyLegalForm)
  legalForm?: CompanyLegalForm;

  @WhenSent()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  registeredAddress?: string;

  @WhenSent()
  @IsBoolean()
  isVatPayer?: boolean;

  @WhenSent()
  @IsIn(VAT_RATES)
  defaultVatRate?: number;

  @blankToNull()
  @WhenSetTo()
  @trim()
  @IsString()
  @Matches(/^\+?[\d\s\-/()]{6,20}$/, { message: 'phone must be a phone number' })
  phone?: string | null;

  /** "devshop.mk" is stored as "https://devshop.mk". */
  @blankToNull()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' && !/^https?:\/\//i.test(value.trim())
      ? `https://${value.trim()}`
      : value,
  )
  @WhenSetTo()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: true })
  @MaxLength(255)
  website?: string | null;

  /** 1–31; a day past the end of a short month means its last day. Null turns payday reminders off. */
  @WhenSent()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(31)
  paydayDayOfMonth?: number | null;

  /** One line: it becomes part of a mail header. */
  @blankToNull()
  @WhenSetTo()
  @trim()
  @IsString()
  @MaxLength(100)
  @Matches(/^[^\r\n<>"]*$/, { message: 'emailSenderName must be a single line without <, > or "' })
  emailSenderName?: string | null;

  @blankToNull()
  @WhenSetTo()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  emailReplyTo?: string | null;
}

/**
 * Closing the company is permanent, so it takes two deliberate acts: the
 * password, and the company's name typed out.
 */
export class CloseCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;

  @trim()
  @IsString()
  @MaxLength(200)
  confirmName!: string;
}
