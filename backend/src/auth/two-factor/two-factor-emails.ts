/**
 * Two-factor emails: the code itself, and the notice that goes out when
 * two-factor is switched on or off. Macedonian or English, following the
 * language the person is using the app in. Pure, so wording and escaping can
 * be tested directly.
 */

import { escapeHtml, renderEmailLayout, type RenderedEmail } from '../../mail/email-layout.js';
import { CODE_TTL_MINUTES } from './two-factor-code.js';

export type EmailLocale = 'mk' | 'en';
export type CodePurpose = 'LOGIN' | 'ENABLE' | 'DISABLE';

const BRAND = 'BiznisMk';

const COPY = {
  mk: {
    subject: {
      LOGIN: 'Код за најава на BiznisMk',
      ENABLE: 'Код за вклучување на двостепена заштита',
      DISABLE: 'Код за исклучување на двостепена заштита',
    },
    heading: {
      LOGIN: 'Потврди ја најавата',
      ENABLE: 'Вклучи двостепена заштита',
      DISABLE: 'Исклучи двостепена заштита',
    },
    intro: {
      LOGIN: 'Некој се најавува на твојата сметка со точна лозинка. Внеси го овој код за да ја потврдиш најавата:',
      ENABLE: 'Внеси го овој код во Поставки → Безбедност за да ја вклучиш двостепената заштита:',
      DISABLE: 'Внеси го овој код во Поставки → Безбедност за да ја исклучиш двостепената заштита:',
    },
    greeting: (name: string) => `Здраво ${name},`,
    expiry: (minutes: number, until: string) => `Кодот важи ${minutes} минути (до ${until}) и може да се искористи само еднаш.`,
    notYou: 'Ако не си ти, веднаш смени ја лозинката и никому не го давај кодот.',
    alertSubject: { enabled: 'Двостепената заштита е вклучена', disabled: 'Двостепената заштита е исклучена' },
    alertBody: {
      enabled: 'Двостепената заштита на твојата BiznisMk сметка е вклучена. Од сега, при најава од нов уред ќе бараме и код испратен на овој мејл.',
      disabled: 'Двостепената заштита на твојата BiznisMk сметка е исклучена, а запомнетите уреди се отстранети. Од сега најавата бара само лозинка.',
    },
    alertNotYou: 'Ако не си ти, веднаш постави нова лозинка:',
    resetButton: 'Постави нова лозинка',
  },
  en: {
    subject: {
      LOGIN: 'Your BiznisMk sign-in code',
      ENABLE: 'Code to turn on two-step verification',
      DISABLE: 'Code to turn off two-step verification',
    },
    heading: {
      LOGIN: 'Confirm your sign-in',
      ENABLE: 'Turn on two-step verification',
      DISABLE: 'Turn off two-step verification',
    },
    intro: {
      LOGIN: 'Someone is signing in to your account with the correct password. Enter this code to confirm it:',
      ENABLE: 'Enter this code in Settings → Security to turn on two-step verification:',
      DISABLE: 'Enter this code in Settings → Security to turn off two-step verification:',
    },
    greeting: (name: string) => `Hi ${name},`,
    expiry: (minutes: number, until: string) => `The code works for ${minutes} minutes (until ${until}) and only once.`,
    notYou: "If this wasn't you, change your password right away and never share this code.",
    alertSubject: { enabled: 'Two-step verification is on', disabled: 'Two-step verification is off' },
    alertBody: {
      enabled: 'Two-step verification is now on for your BiznisMk account. From now on, signing in on a new device also asks for a code sent to this address.',
      disabled: 'Two-step verification is now off for your BiznisMk account, and remembered devices were removed. Signing in now asks for your password only.',
    },
    alertNotYou: "If this wasn't you, set a new password right away:",
    resetButton: 'Set a new password',
  },
} as const;

/** "16:52", in the server's clock, which is the business's. */
function timeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function renderTwoFactorCodeEmail(input: {
  firstName: string;
  code: string;
  purpose: CodePurpose;
  expiresAt: Date;
  locale: EmailLocale;
}): RenderedEmail {
  const copy = COPY[input.locale];
  const subject = copy.subject[input.purpose];
  const expiry = copy.expiry(CODE_TTL_MINUTES, timeOfDay(input.expiresAt));

  return {
    subject,
    text: [copy.greeting(input.firstName), '', copy.intro[input.purpose], '', input.code, '', expiry, '', copy.notYou].join(
      '\n',
    ),
    html: renderEmailLayout({
      lang: input.locale,
      title: subject,
      eyebrow: BRAND,
      heading: copy.heading[input.purpose],
      rows: `<tr><td style="padding:20px 28px 0;font-size:15px;line-height:1.6;">
<p style="margin:0 0 12px;">${escapeHtml(copy.greeting(input.firstName))}</p>
<p style="margin:0;">${escapeHtml(copy.intro[input.purpose])}</p>
</td></tr>
<tr><td style="padding:20px 28px 4px;">
<div style="display:inline-block;padding:14px 22px;border:1px solid #e6e2dd;border-radius:12px;background:#faf9f7;font-family:'Roboto Mono',Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#14110f;">${escapeHtml(input.code)}</div>
</td></tr>
<tr><td style="padding:12px 28px 0;font-size:14px;line-height:1.6;color:rgba(20,17,15,0.72);">
<p style="margin:0;">${escapeHtml(expiry)}</p>
</td></tr>`,
      footer: `<p style="margin:0;">${escapeHtml(copy.notYou)}</p>`,
    }),
  };
}

/** Sent whenever two-factor is switched on or off, so a change nobody asked for is noticed. */
export function renderTwoFactorAlertEmail(input: {
  firstName: string;
  change: 'enabled' | 'disabled';
  /** Where to set a new password straight away. */
  forgotLink: string;
  locale: EmailLocale;
}): RenderedEmail {
  const copy = COPY[input.locale];
  const subject = copy.alertSubject[input.change];
  const body = copy.alertBody[input.change];

  return {
    subject,
    text: [copy.greeting(input.firstName), '', body, '', copy.alertNotYou, input.forgotLink].join('\n'),
    html: renderEmailLayout({
      lang: input.locale,
      title: subject,
      eyebrow: BRAND,
      heading: subject,
      rows: `<tr><td style="padding:20px 28px 0;font-size:15px;line-height:1.6;">
<p style="margin:0 0 12px;">${escapeHtml(copy.greeting(input.firstName))}</p>
<p style="margin:0 0 12px;">${escapeHtml(body)}</p>
</td></tr>
<tr><td style="padding:8px 28px 4px;">
<a href="${escapeHtml(input.forgotLink)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#19b9d6;color:#0f1011;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(copy.resetButton)}</a>
</td></tr>`,
      footer: `<p style="margin:0;">${escapeHtml(copy.alertNotYou)} ${escapeHtml(input.forgotLink)}</p>`,
    }),
  };
}
