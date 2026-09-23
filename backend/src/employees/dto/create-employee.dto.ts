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

export class CreateEmployeeDto {
  @NameField()
  firstName!: string;

  @NameField()
  lastName!: string;

  /** Optional and nullable: there is no upload flow yet. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @PhotoUrlField()
  photoUrl?: string | null;

  @EmailField()
  email!: string;

  @PhoneField()
  phone!: string;

  @RoleField()
  role!: CompanyRole;

  /** Defaults to ACTIVE — a new hire is not usually on leave on day one. */
  @IsOptional()
  @StatusField()
  status?: EmployeeStatus;

  @SalaryField()
  salary!: string;

  @HireDateField()
  hireDate!: string;

  /** Yearly entitlement. Defaults to 20, the statutory minimum. */
  @IsOptional()
  @VacationDaysField()
  vacationDaysTotal?: number;

  /** Defaults to the full entitlement; never more than it. */
  @IsOptional()
  @VacationDaysField()
  vacationDaysRemaining?: number;

  @IbanField()
  iban!: string;
}
