import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CODE_PATTERN } from '../two-factor/two-factor-code.js';

const codeRule = () => Matches(CODE_PATTERN, { message: 'code must be six digits' });
/** Challenge ids are cuids: letters and digits, nothing that needs escaping. */
const challengeIdRule = () => Matches(/^[a-z0-9]{1,64}$/i, { message: 'challengeId is not valid' });

export class VerifyTwoFactorDto {
  @IsString()
  @challengeIdRule()
  challengeId!: string;

  @IsString()
  @codeRule()
  code!: string;

  /** Trust this browser for 30 days, so it skips the code. */
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;
}

export class ResendTwoFactorDto {
  @IsString()
  @challengeIdRule()
  challengeId!: string;
}

export class ConfirmTwoFactorDto {
  @IsString()
  @codeRule()
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @IsString()
  @codeRule()
  code!: string;
}
