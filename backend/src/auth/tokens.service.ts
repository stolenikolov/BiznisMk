import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import ms from 'ms';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './constants.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload.type.js';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('jwt.accessSecret', { infer: true }),
      expiresIn: this.accessExpiresIn(),
    });
  }

  signRefreshToken(payload: RefreshTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('jwt.refreshSecret', { infer: true }),
      expiresIn: this.refreshExpiresIn(),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>('jwt.refreshSecret', { infer: true }),
    });
  }

  refreshExpiryDate(): Date {
    return new Date(Date.now() + ms(this.refreshExpiresIn()));
  }

  private accessExpiresIn(): ms.StringValue {
    return this.configService.getOrThrow<string>('jwt.accessExpiresIn', { infer: true }) as ms.StringValue;
  }

  private refreshExpiresIn(): ms.StringValue {
    return this.configService.getOrThrow<string>('jwt.refreshExpiresIn', { infer: true }) as ms.StringValue;
  }

  private cookieBaseOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('app.cookieSecure', { infer: true }),
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.cookieBaseOptions(),
      maxAge: ms(this.accessExpiresIn()),
    });
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.cookieBaseOptions(),
      maxAge: ms(this.refreshExpiresIn()),
      path: '/auth',
    });
  }

  setAccessCookie(res: Response, accessToken: string) {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.cookieBaseOptions(),
      maxAge: ms(this.accessExpiresIn()),
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { ...this.cookieBaseOptions() });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { ...this.cookieBaseOptions(), path: '/auth' });
  }
}
