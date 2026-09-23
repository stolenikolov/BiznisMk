/**
 * A message the owner writes to employees from the team page. The text goes
 * out exactly as written — no greeting is added, since the writer usually
 * starts with their own — under the company's name, and ends by saying who
 * wrote it and where a reply will land.
 *
 * Pure, so the wording and the escaping can be tested directly.
 */

import { escapeHtml, renderEmailLayout, type RenderedEmail } from '../mail/email-layout.js';

export interface EmployeeMessageInput {
  companyName: string;
  /** Whoever pressed send: "Столе Николов". */
  senderName: string;
  /** Who a reply reaches: the sender's name, or the company's reply address. */
  replyTarget: string;
  subject: string;
  body: string;
}

export function renderEmployeeMessage(input: EmployeeMessageInput): RenderedEmail {
  const paragraphs = input.body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const signature = `— ${input.senderName}, ${input.companyName}`;
  const replyLine = `Ако одговориш на овој мејл, одговорот стигнува до ${input.replyTarget}.`;

  const text = [paragraphs.join('\n\n'), '', signature, '', replyLine].join('\n');

  const html = renderEmailLayout({
    title: input.subject,
    eyebrow: input.companyName,
    heading: input.subject,
    rows: `<tr><td style="padding:20px 28px 0;font-size:15px;line-height:1.6;">
${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n')}
</td></tr>`,
    footer: `<p style="margin:0 0 4px;">${escapeHtml(signature)}</p>
<p style="margin:0;">${escapeHtml(replyLine)}</p>`,
  });

  return { subject: input.subject, text, html };
}
