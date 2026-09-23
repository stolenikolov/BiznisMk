import { IsOptional, ValidateIf } from 'class-validator';
import type { CompanyRole, EmployeeStatus } from '../../generated/prisma/enums.js';
import {
  EmailField,
  HireDateField,
  IbanField,
  NameField,
  PhoneField,
  PhotoUrlField,
  RoleField,
  SalaryField,
  StatusField,
  VacationDaysField,
} from './employee-fields.js';

/** Every field of CreateEmployeeDto, each optional; only what is sent changes. */
export class UpdateEmployeeDto {
  @IsOptional()
  @NameField()
  firstName?: string;

  @IsOptional()
  @NameField()
  lastName?: string;

  /** `null` clears the photo; leaving the field out keeps it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @PhotoUrlField()
  photoUrl?: string | null;

  @IsOptional()
  @EmailField()
  email?: string;

  @IsOptional()
  @PhoneField()
  phone?: string;

  @IsOptional()
  @RoleField()
  role?: CompanyRole;

  @IsOptional()
  @StatusField()
  status?: EmployeeStatus;

  @IsOptional()
  @SalaryField()
  salary?: string;

  @IsOptional()
  @HireDateField()
  hireDate?: string;

  @IsOptional()
  @VacationDaysField()
  vacationDaysTotal?: number;

  @IsOptional()
  @VacationDaysField()
  vacationDaysRemaining?: number;

  @IsOptional()
  @IbanField()
  iban?: string;
}
