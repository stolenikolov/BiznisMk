import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** A message from the team page to some or all of the company's employees. */
export class SendEmployeeMessageDto {
  /** Who gets it. Each id must be one of this company's employees. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  /** One line: it becomes a mail header. */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/^[^\r\n]*$/, { message: 'subject must be a single line' })
  subject!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
