import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../constants.js';
import type { AccessTokenPayload, AuthenticatedUser } from '../types/jwt-payload.type.js';

function extractFromCookie(req: Request): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: extractFromCookie,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      role: payload.role,
    };
  }
}
