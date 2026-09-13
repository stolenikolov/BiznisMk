import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CheckAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName!: string;

  @IsString()
  @Matches(/^[A-Z0-9]{5,34}$/, { message: 'iban must be 5-34 letters or digits, no spaces' })
  iban!: string;
}
