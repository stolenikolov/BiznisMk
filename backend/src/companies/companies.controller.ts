import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { REFRESH_TOKEN_COOKIE } from '../auth/constants.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {}

  /**
   * A new company for the signed-in user — at registration, or later from
   * "My businesses", which adds another company to the same login.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const company = await this.companiesService.create(user.userId, dto);

    // The creator is that company's CEO from this moment on, and the session
    // moves into it. Without refreshing the access token here their session
    // would stay in the previous company (or none), and the new company would
    // be refused until they signed in again.
    const accessToken = await this.authService.switchCompany(
      user.userId,
      user.email,
      company.id,
      req.cookies?.[REFRESH_TOKEN_COOKIE],
    );
    this.tokensService.setAccessCookie(res, accessToken);

    return { company };
  }
}
