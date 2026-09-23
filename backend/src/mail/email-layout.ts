/**
 * The frame every email shares: a white card on a warm grey page, an accent
 * rule, the company as an eyebrow over a heading, then the message's own rows
 * and a muted footer.
 *
 * Light on purpose: mail clients ignore the app's dark theme and several
 * force their own colours on dark mail. Tables and inline styles, because
 * that is the HTML Outlook and Gmail both render the same way.
 */

/** What a template produces; the mail service adds the addresses. */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailLayout {
  /** The document title; plain text. */
  title: string;
  /** Small caps over the heading, usually the company; plain text. */
  eyebrow: string;
  /** Plain text. */
  heading: string;
  /** HTML: the `<tr>` rows between the heading and the footer. */
  rows: string;
  /** HTML: the footer cell's content. */
  footer: string;
  /** The document language; Macedonian unless the email is written in another. */
  lang?: 'mk' | 'en';
}

export function renderEmailLayout({ title, eyebrow, heading, rows, footer, lang = 'mk' }: EmailLayout): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f1ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ee;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e2dd;border-radius:12px;font-family:Inter,Arial,Helvetica,sans-serif;color:#14110f;">
<tr><td style="height:4px;background:#19b9d6;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 0;">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0a8fa0;">${escapeHtml(eyebrow)}</p>
<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(heading)}</h1>
</td></tr>
${rows}
<tr><td style="padding:24px 28px 28px;font-size:13px;line-height:1.6;color:rgba(20,17,15,0.6);">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/** Names, labels and messages are typed by people; none of it is markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
