import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { LeaveType } from '../../generated/prisma/enums.js';
import { CALENDAR_DATE_PATTERN, TIME_OF_DAY_PATTERN } from '../schedule-calendar.js';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const timeMessage = (field: string) => ({ message: `${field} must be a time of day, HH:mm` });

export class CreateShiftTemplateDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @Matches(TIME_OF_DAY_PATTERN, timeMessage('startTime'))
  startTime!: string;

  @Matches(TIME_OF_DAY_PATTERN, timeMessage('endTime'))
  endTime!: string;
}

/** Any subset of a template's fields; the result is checked as a whole. */
export class UpdateShiftTemplateDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, timeMessage('startTime'))
  startTime?: string;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, timeMessage('endTime'))
  endTime?: string;
}

export class SetScheduleEntryDto {
  @IsUUID()
  employeeId!: string;

  @Matches(CALENDAR_DATE_PATTERN, { message: 'date must be a date in YYYY-MM-DD form' })
  date!: string;

  /**
   * The shift to assign, or null to clear the day. Required either way, so a
   * forgotten field cannot silently remove somebody's shift.
   */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  shiftTemplateId!: string | null;

  /** Marks the day as a day off ("Слободен/на"). Only together with `shiftTemplateId: null`. */
  @IsOptional()
  @IsBoolean()
  dayOff?: boolean;

  /** Marks the day as a day of holiday or sick leave. Only with `shiftTemplateId: null` and no day off. */
  @IsOptional()
  @IsEnum(LeaveType)
  leave?: LeaveType;
}
