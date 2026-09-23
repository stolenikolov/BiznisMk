import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { ProfileService } from './profile.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import { TrustedDevicesService } from './two-factor/trusted-devices.service.js';
import { requestContext } from './request-context.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SwitchCompanyDto } from './dto/switch-company.dto.js';
import { ForgotPasswordDto, ResetPasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { REFRESH_TOKEN_COOKIE, TRUSTED_DEVICE_COOKIE } from './constants.js';
import { TwoFactorPurpose } from '../generated/prisma/enums.js';
import { toPublicUser } from '../users/user.mapper.js';
import type { AuthenticatedUser } from './types/jwt-payload.type.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly profileService: ProfileService,
    private readonly passwordReset: PasswordResetService,
    private readonly twoFactor: TwoFactorService,
    private readonly trustedDevices: TrustedDevicesService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.register(dto);
    this.tokensService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { user: toPublicUser(user) };
  }

  /**
   * Email and password. With two-factor on — and this browser not trusted by
   * this user — no session is opened yet: a code goes to the login address
   * and the answer says so, and POST /auth/2fa/verify finishes the sign-in.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.verifyCredentials(dto, requestContext(req));

    if (user.twoFactorEnabled && !(await this.trustedDevices.isTrusted(user.id, req.cookies?.[TRUSTED_DEVICE_COOKIE]))) {
      const challenge = await this.twoFactor.start(user, TwoFactorPurpose.LOGIN, requestContext(req));
      return { requires2fa: true as const, ...challenge };
    }

    const tokens = await this.authService.signIn(user);
    this.tokensService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { user: toPublicUser(user) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const tokens = await this.authService.refresh(rawRefreshToken);
    this.tokensService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(rawRefreshToken);
    this.tokensService.clearAuthCookies(res);
    return { success: true };
  }

  /**
   * Reads the profile from the database rather than echoing the token, so a
   * renamed user or company shows up without waiting for the token to expire.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { user: await this.authService.describeCurrentUser(user) };
  }

  /**
   * Name, login address and — when one is typed — a new password, in one go.
   * The address is also a claim in the access token, so a new one re-issues
   * the token — same company, same role — rather than carrying the old
   * address until it expires.
   */
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.profileService.update(user.userId, dto, req.cookies?.[REFRESH_TOKEN_COOKIE]);
    if (result.emailChanged) {
      this.tokensService.setAccessCookie(
        res,
        this.tokensService.signAccessToken({
          sub: result.user.id,
          email: result.user.email,
          companyId: user.companyId,
          role: user.role,
        }),
      );
    }
    return { user: toPublicUser(result.user), passwordChanged: result.passwordChanged };
  }

  /** Always the same answer, whether or not the address has an account. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.request(dto.email);
    return { success: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordReset.reset(dto.token, dto.password);
    return { success: true };
  }

  /** Every company the user belongs to, oldest first — the picker after sign-in and "My businesses". */
  @Get('companies')
  async companies(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.authService.findMemberships(user.userId);
    return {
      companies: memberships.map((m) => ({
        companyId: m.companyId,
        role: m.role,
        name: m.company.name,
        legalForm: m.company.legalForm,
      })),
    };
  }

  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  async switchCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Two-factor is the person's, settled when they signed in; moving between
    // their companies inside that session asks for nothing again.
    const accessToken = await this.authService.switchCompany(
      user.userId,
      user.email,
      dto.companyId,
      req.cookies?.[REFRESH_TOKEN_COOKIE],
    );
    this.tokensService.setAccessCookie(res, accessToken);
    return { success: true };
  }
}
