import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CompanySettingsService } from './company-settings.service.js';
import { CloseCompanyDto, UpdateCompanySettingsDto } from './dto/company-settings.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/constants.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { activeCompany } from '../auth/active-company.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/** The company's settings page. Everything here belongs to the owner. */
@Controller('companies/:companyId/settings')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class CompanySettingsController {
  constructor(
    private readonly settings: CompanySettingsService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  /** The settings, plus the address emails to employees go out from. */
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.settings.get(activeCompany(user, companyId));
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    return { settings: await this.settings.update(activeCompany(user, companyId), dto) };
  }

  /**
   * Closes the company for good. The session ends with it: its company is
   * gone, and so, usually, is the user.
   */
  @Post('close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CloseCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.settings.close(activeCompany(user, companyId), user.userId, dto);
    if (!result.userDeleted) await this.authService.logout(req.cookies?.[REFRESH_TOKEN_COOKIE]);
    this.tokensService.clearAuthCookies(res);
    return result;
  }
}
