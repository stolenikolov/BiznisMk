import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../auth.service.js';
import { TokensService } from '../tokens.service.js';
import { ProfileService } from '../profile.service.js';
import { Public } from '../decorators/public.decorator.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { TRUSTED_DEVICE_COOKIE } from '../constants.js';
import { requestContext } from '../request-context.js';
import { toPublicUser } from '../../users/user.mapper.js';
import type { AuthenticatedUser } from '../types/jwt-payload.type.js';
import {
  ConfirmTwoFactorDto,
  DisableTwoFactorDto,
  ResendTwoFactorDto,
  VerifyTwoFactorDto,
} from '../dto/two-factor.dto.js';
import { TwoFactorService } from './two-factor.service.js';
import { TrustedDevicesService } from './trusted-devices.service.js';

/** Endpoints that send a code: a handful a minute per address is plenty for a person. */
const SEND_LIMIT = { default: { limit: 5, ttl: 60_000 } };
/** Endpoints that check a code. Each challenge also dies after five wrong guesses. */
const VERIFY_LIMIT = { default: { limit: 10, ttl: 60_000 } };

/**
 * Email two-factor: the second step of signing in, switching it on and off,
 * and the browsers trusted to skip it.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class TwoFactorController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly profileService: ProfileService,
    private readonly twoFactor: TwoFactorService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {}

  // Signing in ----------------------------------------------------------------------

  /** The code from the email, for a sign-in /auth/login answered with requires2fa. */
  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(VERIFY_LIMIT)
  async verify(@Body() dto: VerifyTwoFactorDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const context = requestContext(req);
    const userId = await this.twoFactor.verifyLogin(dto.challengeId, dto.code, context);
    const { user, tokens } = await this.authService.signInById(userId);
    this.tokensService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    if (dto.rememberDevice) {
      const device = await this.trustedDevices.trust(user.id, context);
      this.tokensService.setTrustedDeviceCookie(res, device.token, device.expiresAt);
    }
    return { user: toPublicUser(user) };
  }

  @Public()
  @Post('2fa/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle(SEND_LIMIT)
  async resend(@Body() dto: ResendTwoFactorDto, @Req() req: Request) {
    return this.twoFactor.resendLogin(dto.challengeId, requestContext(req));
  }

  // Settings -------------------------------------------------------------------------

  @Get('2fa/status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.status(user.userId);
  }

  @Post('2fa/enable/start')
  @HttpCode(HttpStatus.OK)
  @Throttle(SEND_LIMIT)
  async startEnable(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.twoFactor.startEnable(user.userId, requestContext(req));
  }

  @Post('2fa/enable/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle(VERIFY_LIMIT)
  async confirmEnable(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmTwoFactorDto, @Req() req: Request) {
    return this.twoFactor.confirmEnable(user.userId, dto.code, requestContext(req));
  }

  /** Sends the code that /auth/2fa/disable asks for together with the password. */
  @Post('2fa/disable/start')
  @HttpCode(HttpStatus.OK)
  @Throttle(SEND_LIMIT)
  async startDisable(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.twoFactor.startDisable(user.userId, requestContext(req));
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle(VERIFY_LIMIT)
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.profileService.assertPassword(user.userId, dto.password);
    const status = await this.twoFactor.disable(user.userId, dto.code, requestContext(req));
    // Every trusted device was just forgotten, this browser's included.
    this.tokensService.clearTrustedDeviceCookie(res);
    return status;
  }

  // Trusted devices --------------------------------------------------------------------

  @Get('trusted-devices')
  async listDevices(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return { devices: await this.trustedDevices.list(user.userId, req.cookies?.[TRUSTED_DEVICE_COOKIE]) };
  }

  @Delete('trusted-devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.trustedDevices.revoke(user.userId, id, requestContext(req));
  }

  @Delete('trusted-devices')
  @HttpCode(HttpStatus.OK)
  async revokeAllDevices(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const revoked = await this.trustedDevices.revokeAll(user.userId, 'USER_REQUEST', requestContext(req));
    this.tokensService.clearTrustedDeviceCookie(res);
    return { revoked };
  }
}
