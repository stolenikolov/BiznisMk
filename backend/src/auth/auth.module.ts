import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { ProfileService } from './profile.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { MailModule } from '../mail/mail.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import { TrustedDevicesService } from './two-factor/trusted-devices.service.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy.js';
import { JwtAccessGuard } from './guards/jwt-access.guard.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MailModule,
    AuditModule,
    // Per-route limits (@Throttle) on the endpoints that send or check codes;
    // this is only the fallback for the other routes of those controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    TokensService,
    ProfileService,
    PasswordResetService,
    TwoFactorService,
    TrustedDevicesService,
    JwtAccessStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAccessGuard,
    },
  ],
  // CompaniesController re-issues the access token after a company is created,
  // so it needs both of these; closing a company asks for the password, which
  // ProfileService checks.
  exports: [AuthService, TokensService, ProfileService],
})
export class AuthModule {}
