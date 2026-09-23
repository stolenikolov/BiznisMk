import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../notifications.service.js';

export class ListNotificationsDto {
  /** How many rows to return. The dropdown asks for a screenful at a time. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  /**
   * Id of the last row on the previous page. Cursor rather than offset: new
   * notifications arrive at the top while the panel is open, and an offset
   * would make that shift repeat a row on the next page.
   */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
