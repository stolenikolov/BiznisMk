import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CompanyRole, EmployeeStatus } from '../../generated/prisma/enums.js';
import { NormalizeEmail } from '../../auth/dto/normalize-email.js';
import { MK_IBAN_PATTERN, normalizeIban } from '../../common/iban.js';
import { GROSS_SALARY_PATTERN } from '../../payroll/net-salary.js';

/**
 * Validation for each employee field, defined once.
 *
 * Creating and editing an employee accept the same fields under the same rules
 * — the edit just makes every one optional. Composing the rules here keeps the
 * two DTOs from drifting apart.
 */

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const NameField = () => applyDecorators(trim(), IsString(), MinLength(1), MaxLength(100));

export const PhotoUrlField = () =>
  applyDecorators(IsUrl({ protocols: ['https'], require_protocol: true }), MaxLength(2048));

export const EmailField = () => applyDecorators(NormalizeEmail(), IsEmail(), MaxLength(254));

/** Digits with the usual separators, optionally international: "070 123 456", "+389 70 123 456". */
export const PhoneField = () =>
  applyDecorators(
    trim(),
    IsString(),
    Matches(/^\+?[\d\s\-/()]{6,20}$/, { message: 'phone must be a phone number' }),
  );

export const RoleField = () => applyDecorators(IsEnum(CompanyRole));

export const StatusField = () => applyDecorators(IsEnum(EmployeeStatus));

/** Monthly gross as a decimal string; the rule is shared with the payroll endpoints. */
export const SalaryField = () =>
  applyDecorators(
    IsString(),
    Matches(GROSS_SALARY_PATTERN, { message: 'salary must be a positive amount with at most two decimals' }),
  );

/** A calendar date, YYYY-MM-DD — no time, no zone. */
export const HireDateField = () =>
  applyDecorators(
    Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
      message: 'hireDate must be a date in YYYY-MM-DD form',
    }),
  );

/** Macedonian statutory leave is 20–26 working days; the cap only stops typos. */
export const VacationDaysField = () => applyDecorators(IsInt(), Min(0), Max(60));

export const IbanField = () =>
  applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? normalizeIban(value) : value)),
    IsString(),
    Matches(MK_IBAN_PATTERN, { message: 'iban must be a Macedonian IBAN: MK followed by 17 digits' }),
  );
