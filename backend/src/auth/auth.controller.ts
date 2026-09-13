import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { SwitchCompanyDto } from './dto/switch-company.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { REFRESH_TOKEN_COOKIE } from './constants.js';
import { toPublicUser } from '../users/user.mapper.js';
import type { AuthenticatedUser } from './types/jwt-payload.type.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.register(dto);
    this.tokensService.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { user: toPublicUser(user) };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto);
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

  @Get('companies')
  async companies(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.authService.findMemberships(user.userId);
    return {
      companies: memberships.map((m) => ({
        companyId: m.companyId,
        role: m.role,
        name: m.company.name,
      })),
    };
  }

  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  async switchCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accessToken = await this.authService.switchCompany(user.userId, user.email, dto.companyId);
    this.tokensService.setAccessCookie(res, accessToken);
    return { success: true };
  }
}
