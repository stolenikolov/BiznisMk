/**
 * The email an employee gets when their week is published: their own seven
 * days, nothing about anyone else's.
 *
 * Macedonian, like the rest of the stored copy — employees have no language
 * setting because they never log in. Pure and Prisma-free, so the wording and
 * the escaping can be tested directly.
 */

import { dayLeave, shiftMinutes, type LeaveKind, type ResolvedEntry } from './schedule-calendar.js';
import { escapeHtml as escape, renderEmailLayout, type RenderedEmail } from '../mail/email-layout.js';
import type { EmployeeStatus } from '../generated/prisma/enums.js';

export type EmailDay =
  | { date: string; kind: 'shift'; label: string; startTime: string; endTime: string }
  | { date: string; kind: 'dayOff' }
  | { date: string; kind: 'leave'; leave: LeaveKind }
  | { date: string; kind: 'unplanned' };

export interface ScheduleEmailInput {
  companyName: string;
  firstName: string;
  weekStart: string;
  weekEnd: string;
  days: readonly EmailDay[];
  /** A re-publication after changes, rather than the first time this week went out. */
  isUpdate: boolean;
  /** Whether replies reach a person (the manager who published). */
  canReply: boolean;
}

const WEEKDAYS = ['Понеделник', 'Вторник', 'Среда', 'Четврток', 'Петок', 'Сабота', 'Недела'];
const MONTHS = [
  'јануари', 'февруари', 'март', 'април', 'мај', 'јуни',
  'јули', 'август', 'септември', 'октомври', 'ноември', 'декември',
];
const LEAVE_LABEL: Record<LeaveKind, string> = { ON_LEAVE: 'На одмор', SICK_LEAVE: 'Боледување' };
const DAY_OFF_LABEL = 'Слободен/на';

/**
 * One employee's week as the email shows it. Leave — from their status or
 * planned for the day in the grid — wins over whatever else the day holds,
 * exactly as it does for hours and notifications.
 */
export function emailDaysFor(
  status: EmployeeStatus,
  dates: readonly string[],
  entries: readonly ResolvedEntry[],
  today: string,
): EmailDay[] {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));

  return dates.map((date): EmailDay => {
    const entry = byDate.get(date);
    const leave = dayLeave(status, entry, date, today);
    if (leave) return { date, kind: 'leave', leave };

    if (entry?.shift) return { date, kind: 'shift', ...entry.shift };
    if (entry?.dayOff) return { date, kind: 'dayOff' };
    return { date, kind: 'unplanned' };
  });
}

export function renderScheduleEmail(input: ScheduleEmailInput): RenderedEmail {
  const range = formatWeekRange(input.weekStart, input.weekEnd);
  const minutes = input.days.reduce(
    (sum, day) => (day.kind === 'shift' ? sum + shiftMinutes(day.startTime, day.endTime) : sum),
    0,
  );
  const total = formatHours(minutes);

  const subject = `${input.isUpdate ? 'Изменет распоред' : 'Распоред'} за ${range} · ${input.companyName}`;
  const intro = input.isUpdate
    ? `Твојот распоред за неделата ${range} е изменет. Ова е новата верзија.`
    : `Ова е твојот распоред за неделата ${range}.`;
  const replyLine = 'Ако имаш прашање, само одговори на овој мејл.';

  const text = [
    `Здраво ${input.firstName},`,
    '',
    intro,
    '',
    ...input.days.map((day) => `${dayName(day.date)}: ${dayText(day)}`),
    '',
    `Вкупно: ${total}`,
    '',
    ...(input.canReply ? [replyLine, ''] : []),
    `— ${input.companyName}`,
  ].join('\n');

  const html = renderEmailLayout({
    title: subject,
    eyebrow: input.companyName,
    heading: `${input.isUpdate ? 'Изменет распоред' : 'Распоред'} за ${range}`,
    rows: `<tr><td style="padding:16px 28px 8px;font-size:15px;line-height:1.6;">
<p style="margin:0 0 4px;">Здраво ${escape(input.firstName)},</p>
<p style="margin:0;">${escape(intro)}</p>
</td></tr>
<tr><td style="padding:8px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${input.days.map(dayRow).join('\n')}
</table>
</td></tr>
<tr><td style="padding:16px 28px 0;font-size:14px;">
<span style="color:rgba(20,17,15,0.6);">Вкупно оваа недела:</span> <strong>${escape(total)}</strong>
</td></tr>`,
    footer: `${input.canReply ? `<p style="margin:0 0 4px;">${escape(replyLine)}</p>` : ''}
<p style="margin:0;">— ${escape(input.companyName)}</p>`,
  });

  return { subject, text, html };
}

function dayRow(day: EmailDay): string {
  const cell = 'padding:12px 0;border-bottom:1px solid #e6e2dd;vertical-align:middle;';
  const [, month, dayOfMonth] = day.date.split('-');

  return `<tr>
<td style="${cell}font-size:14px;"><strong>${WEEKDAYS[weekdayIndex(day.date)]}</strong><br><span style="font-size:12px;color:rgba(20,17,15,0.6);">${dayOfMonth}.${month}</span></td>
<td align="right" style="${cell}font-size:14px;">${dayHtml(day)}</td>
</tr>`;
}

function dayHtml(day: EmailDay): string {
  switch (day.kind) {
    case 'shift':
      return `<strong>${escape(day.label)}</strong><br><span style="font-size:13px;color:#0a8fa0;">${day.startTime}–${day.endTime}</span>`;
    case 'dayOff':
      return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#f3f1ee;color:rgba(20,17,15,0.7);font-weight:600;">${DAY_OFF_LABEL}</span>`;
    case 'leave':
      return `<span style="color:#b86a1c;font-weight:600;">${LEAVE_LABEL[day.leave]}</span>`;
    case 'unplanned':
      return '<span style="color:rgba(20,17,15,0.44);">—</span>';
  }
}

function dayText(day: EmailDay): string {
  switch (day.kind) {
    case 'shift':
      return `${day.label}, ${day.startTime}–${day.endTime}`;
    case 'dayOff':
      return DAY_OFF_LABEL;
    case 'leave':
      return LEAVE_LABEL[day.leave];
    case 'unplanned':
      return '—';
  }
}

/** "Понеделник 21.09" */
function dayName(date: string): string {
  const [, month, day] = date.split('-');
  return `${WEEKDAYS[weekdayIndex(date)]} ${day}.${month}`;
}

/** 0 for Monday … 6 for Sunday. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** "21 – 27 септември 2026", "28 септември – 4 октомври 2026", or across a new year. */
export function formatWeekRange(start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split('-').map(Number) as [number, number, number];
  const [endYear, endMonth, endDay] = end.split('-').map(Number) as [number, number, number];
  const month = (value: number) => MONTHS[value - 1];

  if (startYear !== endYear) {
    return `${startDay} ${month(startMonth)} ${startYear} – ${endDay} ${month(endMonth)} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startDay} ${month(startMonth)} – ${endDay} ${month(endMonth)} ${endYear}`;
  }
  return `${startDay} – ${endDay} ${month(endMonth)} ${endYear}`;
}

/** 2400 → "40 ч", 450 → "7,5 ч". */
function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${String(hours).replace('.', ',')} ч`;
}
