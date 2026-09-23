/**
 * Emails about the owner's own account: the "forgot password" link, and the
 * notice that goes out when the login address or password changes.
 *
 * Macedonian, the app's default language. Pure, so the wording and the
 * escaping can be tested directly.
 */

import { escapeHtml, renderEmailLayout, type RenderedEmail } from '../mail/email-layout.js';

const BRAND = 'BiznisMk';

/** How long a reset link works, in the words the email uses. */
export const RESET_LINK_LIFETIME = '1 час';

export function renderPasswordResetEmail(input: { firstName: string; link: string }): RenderedEmail {
  const subject = 'Нова лозинка за BiznisMk';
  const lines = [
    `Здраво ${input.firstName},`,
    'Побара нова лозинка за BiznisMk. Кликни на копчето за да ја поставиш.',
    `Линкот важи ${RESET_LINK_LIFETIME} и може да се искористи само еднаш.`,
  ];
  const ignore = 'Ако не си побарал/а нова лозинка, игнорирај го овој мејл: лозинката останува иста.';

  return {
    subject,
    text: [...lines, '', input.link, '', ignore].join('\n'),
    html: renderEmailLayout({
      title: subject,
      eyebrow: BRAND,
      heading: 'Нова лозинка',
      rows: `${paragraphs(lines)}
${button('Постави нова лозинка', input.link)}`,
      footer: `<p style="margin:0 0 8px;">${escapeHtml(ignore)}</p>
<p style="margin:0;word-break:break-all;">${escapeHtml(input.link)}</p>`,
    }),
  };
}

/**
 * Sent after the login address or the password changes. Changing them does
 * not ask for the current password, so this is how the owner finds out if it
 * was not them. A changed address is announced to the old one.
 */
export function renderAccountChangedEmail(input: {
  firstName: string;
  change: 'email' | 'password';
  /** The new login address, when that is what changed. */
  newEmail?: string;
  /** Where to set a new password straight away. */
  forgotLink: string;
}): RenderedEmail {
  const isEmail = input.change === 'email';
  const subject = isEmail ? 'Мејлот за најава на BiznisMk е сменет' : 'Лозинката за BiznisMk е сменета';
  const lines = [
    `Здраво ${input.firstName},`,
    isEmail
      ? `Мејлот за најава на твојата сметка е сменет во ${input.newEmail}.`
      : 'Лозинката за твојата сметка е сменета.',
    isEmail ? 'Ако ти го смени, не треба ништо да правиш.' : 'Ако ти ја смени, не треба ништо да правиш.',
  ];
  const warning = 'Ако не си ти, веднаш постави нова лозинка:';

  return {
    subject,
    text: [...lines, '', warning, input.forgotLink].join('\n'),
    html: renderEmailLayout({
      title: subject,
      eyebrow: BRAND,
      heading: isEmail ? 'Мејлот за најава е сменет' : 'Лозинката е сменета',
      rows: `${paragraphs(lines)}
${button('Постави нова лозинка', input.forgotLink)}`,
      footer: `<p style="margin:0;">${escapeHtml(warning)} ${escapeHtml(input.forgotLink)}</p>`,
    }),
  };
}

/**
 * Sent when wrong passwords lock the account. A lock the owner did not cause
 * means someone is guessing their password, so this says what to do about it.
 */
export function renderAccountLockedEmail(input: {
  firstName: string;
  attempts: number;
  minutes: number;
  /** Setting a new password lifts the lock at once. */
  forgotLink: string;
}): RenderedEmail {
  const subject = 'Најавата на BiznisMk е привремено заклучена';
  const lines = [
    `Здраво ${input.firstName},`,
    `Некој внесе погрешна лозинка ${input.attempts} пати по ред за твојата сметка, па ја заклучивме најавата на ${input.minutes} минути.`,
    'Ако тоа беше ти, почекај и обиди се повторно, или постави нова лозинка — тоа веднаш ја отклучува сметката.',
  ];
  const warning =
    'Ако не беше ти, некој ја погодува твојата лозинка. Постави нова и вклучи двостепена заштита во поставките:';

  return {
    subject,
    text: [...lines, '', warning, input.forgotLink].join('\n'),
    html: renderEmailLayout({
      title: subject,
      eyebrow: BRAND,
      heading: 'Најавата е заклучена',
      rows: `${paragraphs(lines)}
${button('Постави нова лозинка', input.forgotLink)}`,
      footer: `<p style="margin:0;">${escapeHtml(warning)} ${escapeHtml(input.forgotLink)}</p>`,
    }),
  };
}

function paragraphs(lines: readonly string[]): string {
  return `<tr><td style="padding:20px 28px 0;font-size:15px;line-height:1.6;">
${lines.map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`).join('\n')}
</td></tr>`;
}

/** A pill in the app's accent, the way mail clients render a button: a styled link. */
function button(label: string, href: string): string {
  return `<tr><td style="padding:8px 28px 4px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#19b9d6;color:#0f1011;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr>`;
}
