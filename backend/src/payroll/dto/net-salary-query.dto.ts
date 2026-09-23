import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { GROSS_SALARY_PATTERN } from '../net-salary.js';

export class NetSalaryQueryDto {
  /** Monthly gross, as a decimal string: `gross=40000.50`. */
  @IsString()
  @Matches(GROSS_SALARY_PATTERN, { message: 'gross must be a positive amount with at most two decimals' })
  gross!: string;

  /** The tax year the salary is for. Defaults to the current one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
