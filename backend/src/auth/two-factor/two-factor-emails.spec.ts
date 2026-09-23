import { describe, expect, it } from 'vitest';
import { renderTwoFactorAlertEmail, renderTwoFactorCodeEmail } from './two-factor-emails.js';

const expiresAt = new Date(2026, 8, 19, 16, 52);

describe('renderTwoFactorCodeEmail', () => {
  it('shows the code, how long it works and what to do if it was not you', () => {
    const email = renderTwoFactorCodeEmail({ firstName: 'Ана', code: '042917', purpose: 'LOGIN', expiresAt, locale: 'mk' });

    expect(email.subject).toBe('Код за најава на BiznisMk');
    expect(email.text).toContain('042917');
    expect(email.text).toContain('Кодот важи 10 минути (до 16:52)');
    expect(email.text).toContain('Ако не си ти, веднаш смени ја лозинката');
    expect(email.html).toContain('042917');
    expect(email.html).toContain('monospace');
  });

  it('speaks English to someone using the app in English', () => {
    const email = renderTwoFactorCodeEmail({ firstName: 'Ana', code: '042917', purpose: 'ENABLE', expiresAt, locale: 'en' });

    expect(email.subject).toBe('Code to turn on two-step verification');
    expect(email.text).toContain('The code works for 10 minutes (until 16:52)');
    expect(email.html).toContain('<html lang="en">');
  });

  it('escapes the name, which a person typed', () => {
    const email = renderTwoFactorCodeEmail({
      firstName: '<script>',
      code: '042917',
      purpose: 'DISABLE',
      expiresAt,
      locale: 'mk',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('renderTwoFactorAlertEmail', () => {
  it('says what changed and links straight to a new password', () => {
    const email = renderTwoFactorAlertEmail({
      firstName: 'Ана',
      change: 'disabled',
      forgotLink: 'https://app.biznis.mk/forgot-password',
      locale: 'mk',
    });

    expect(email.subject).toBe('Двостепената заштита е исклучена');
    expect(email.text).toContain('запомнетите уреди се отстранети');
    expect(email.html).toContain('https://app.biznis.mk/forgot-password');
  });
});
