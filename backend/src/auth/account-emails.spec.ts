import { describe, expect, it } from 'vitest';
import { renderAccountChangedEmail, renderPasswordResetEmail } from './account-emails.js';

describe('renderPasswordResetEmail', () => {
  it('carries the link as a button and as plain text, and says it works once for an hour', () => {
    const email = renderPasswordResetEmail({ firstName: 'Столе', link: 'https://app.biznis.mk/reset-password?token=abc' });

    expect(email.subject).toBe('Нова лозинка за BiznisMk');
    expect(email.text).toContain('https://app.biznis.mk/reset-password?token=abc');
    expect(email.text).toContain('Линкот важи 1 час и може да се искористи само еднаш.');
    expect(email.html).toContain('href="https://app.biznis.mk/reset-password?token=abc"');
  });

  it('escapes a name typed at registration', () => {
    const { html } = renderPasswordResetEmail({ firstName: '<img src=x>', link: 'https://app.biznis.mk/r?token=a&b=1' });

    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('href="https://app.biznis.mk/r?token=a&amp;b=1"');
  });
});

describe('renderAccountChangedEmail', () => {
  it('names the new address when the login email changed', () => {
    const email = renderAccountChangedEmail({
      firstName: 'Столе',
      change: 'email',
      newEmail: 'nov@devshop.mk',
      forgotLink: 'https://app.biznis.mk/forgot-password',
    });

    expect(email.subject).toBe('Мејлот за најава на BiznisMk е сменет');
    expect(email.text).toContain('сменет во nov@devshop.mk');
    expect(email.text).toContain('https://app.biznis.mk/forgot-password');
  });

  it('warns about a changed password with a way to set a new one', () => {
    const email = renderAccountChangedEmail({
      firstName: 'Столе',
      change: 'password',
      forgotLink: 'https://app.biznis.mk/forgot-password',
    });

    expect(email.subject).toBe('Лозинката за BiznisMk е сменета');
    expect(email.text).toContain('Ако не си ти, веднаш постави нова лозинка:');
  });
});
