import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmPayrollRunDto {
  /**
   * The run the bank priced and is holding, as returned by the preview.
   *
   * Not validated as a UUID: it is the bank's identifier, not ours, and its
   * shape is the bank's business. What matters is checked where it can be —
   * against the bank's own record of whose run it is.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  requestId!: string;
}
