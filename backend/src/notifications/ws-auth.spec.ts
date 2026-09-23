import { describe, expect, it } from 'vitest';
import { companyRoom, readCookie, userRoom } from './ws-auth.js';

describe('readCookie', () => {
  it('reads a value out of a multi-cookie header', () => {
    expect(readCookie('theme=dark; access_token=abc.def.ghi; lang=mk', 'access_token')).toBe(
      'abc.def.ghi',
    );
  });

  it('reads a value that is the only cookie', () => {
    expect(readCookie('access_token=abc', 'access_token')).toBe('abc');
  });

  // JWTs contain '.' and can contain '='-padded segments; splitting on the
  // first '=' only is what keeps the value intact.
  it('keeps everything after the first equals sign', () => {
    expect(readCookie('access_token=a=b=c', 'access_token')).toBe('a=b=c');
  });

  it('decodes a percent-encoded value', () => {
    expect(readCookie('access_token=a%20b', 'access_token')).toBe('a b');
  });

  // A malformed cookie should fail authentication downstream, not blow up the
  // connection handler.
  it('returns a badly encoded value verbatim instead of throwing', () => {
    expect(readCookie('access_token=%E0%A4%A', 'access_token')).toBe('%E0%A4%A');
  });

  it('does not match a cookie whose name merely ends the same way', () => {
    expect(readCookie('refresh_token=nope', 'access_token')).toBeNull();
    expect(readCookie('my_access_token=nope', 'access_token')).toBeNull();
  });

  it('treats a missing, empty or valueless cookie as absent', () => {
    expect(readCookie(undefined, 'access_token')).toBeNull();
    expect(readCookie('', 'access_token')).toBeNull();
    expect(readCookie('access_token=', 'access_token')).toBeNull();
    expect(readCookie('access_token', 'access_token')).toBeNull();
  });
});

describe('rooms', () => {
  it('scopes a company room by company id', () => {
    expect(companyRoom('c-1')).toBe('company:c-1');
  });

  // The same person can belong to two companies; a user room that ignored the
  // company would leak one company's notifications into the other.
  it('scopes a user room by company as well as user', () => {
    expect(userRoom('c-1', 'u-1')).toBe('company:c-1:user:u-1');
    expect(userRoom('c-2', 'u-1')).not.toBe(userRoom('c-1', 'u-1'));
  });
});
