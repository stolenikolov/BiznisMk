import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from './normalize-email.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** The same length rules as registration. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/**
 * The signed-in user's own account, as one form: name, login address, and a
 * new password when one is typed.
 */
export class UpdateProfileDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Left blank, the password stays as it is. */
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password?: string;
}

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  /** The token from the emailed link: 32 random bytes, base64url. */
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password!: string;
}
