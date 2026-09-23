import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** The account security log; any module that changes how someone signs in records here. */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
