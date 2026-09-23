import { describe, expect, it } from 'vitest';
import { emailDaysFor, formatWeekRange, renderScheduleEmail, type ScheduleEmailInput } from './schedule-email.js';
import { weekDates } from './schedule-calendar.js';

const DATES = weekDates('2026-09-21');
const shift = (label: string, startTime: string, endTime: string) => ({ label, startTime, endTime });

const input = (overrides: Partial<ScheduleEmailInput> = {}): ScheduleEmailInput => ({
  companyName: 'Пекара Здравје',
  firstName: 'Ана',
  weekStart: '2026-09-21',
  weekEnd: '2026-09-27',
  days: DATES.map((date) => ({ date, kind: 'unplanned' as const })),
  isUpdate: false,
  canReply: true,
  ...overrides,
});

describe('emailDaysFor', () => {
  it('reads each day as a shift, a day off, leave, or nothing planned', () => {
    const days = emailDaysFor(
      'ACTIVE',
      DATES,
      [
        { employeeId: 'ana', date: '2026-09-21', shift: shift('Прва', '07:00', '15:00') },
        { employeeId: 'ana', date: '2026-09-22', shift: null, dayOff: true },
        { employeeId: 'ana', date: '2026-09-23', shift: null }, // its template was deleted
      ],
      '2026-09-18',
    );

    expect(days.slice(0, 4)).toEqual([
      { date: '2026-09-21', kind: 'shift', label: 'Прва', startTime: '07:00', endTime: '15:00' },
      { date: '2026-09-22', kind: 'dayOff' },
      { date: '2026-09-23', kind: 'unplanned' },
      { date: '2026-09-24', kind: 'unplanned' },
    ]);
  });

  it('lets leave win over whatever the grid holds', () => {
    const days = emailDaysFor(
      'SICK_LEAVE',
      DATES,
      [{ employeeId: 'ana', date: '2026-09-21', shift: shift('Прва', '07:00', '15:00') }],
      '2026-09-18',
    );

    expect(days.every((day) => day.kind === 'leave' && day.leave === 'SICK_LEAVE')).toBe(true);
  });
});

describe('renderScheduleEmail', () => {
  it('lists the seven days and totals only the shifts, night shifts included', () => {
    const email = renderScheduleEmail(
      input({
        days: [
          { date: '2026-09-21', kind: 'shift', label: 'Прва смена', startTime: '07:00', endTime: '15:00' },
          { date: '2026-09-22', kind: 'shift', label: 'Ноќна', startTime: '22:00', endTime: '06:00' },
          { date: '2026-09-23', kind: 'dayOff' },
          { date: '2026-09-24', kind: 'leave', leave: 'ON_LEAVE' },
          { date: '2026-09-25', kind: 'unplanned' },
          { date: '2026-09-26', kind: 'dayOff' },
          { date: '2026-09-27', kind: 'shift', label: 'Кратка', startTime: '09:00', endTime: '13:30' },
        ],
      }),
    );

    expect(email.subject).toBe('Распоред за 21 – 27 септември 2026 · Пекара Здравје');
    expect(email.text.split('\n')).toEqual([
      'Здраво Ана,',
      '',
      'Ова е твојот распоред за неделата 21 – 27 септември 2026.',
      '',
      'Понеделник 21.09: Прва смена, 07:00–15:00',
      'Вторник 22.09: Ноќна, 22:00–06:00',
      'Среда 23.09: Слободен/на',
      'Четврток 24.09: На одмор',
      'Петок 25.09: —',
      'Сабота 26.09: Слободен/на',
      'Недела 27.09: Кратка, 09:00–13:30',
      '',
      'Вкупно: 20,5 ч',
      '',
      'Ако имаш прашање, само одговори на овој мејл.',
      '',
      '— Пекара Здравје',
    ]);
    expect(email.html).toContain('Слободен/на');
  });

  it('says so when it is a change to a week already sent', () => {
    const email = renderScheduleEmail(input({ isUpdate: true }));

    expect(email.subject).toBe('Изменет распоред за 21 – 27 септември 2026 · Пекара Здравје');
    expect(email.text).toContain('е изменет');
  });

  it('does not invite a reply nobody will read', () => {
    const email = renderScheduleEmail(input({ canReply: false }));

    expect(email.text).not.toContain('одговори');
    expect(email.html).not.toContain('одговори');
  });

  it('escapes names and labels typed by people', () => {
    const email = renderScheduleEmail(
      input({
        companyName: 'Бар <b>&</b> Ко',
        firstName: '<script>',
        days: [{ date: '2026-09-21', kind: 'shift', label: '"Прва" <i>', startTime: '07:00', endTime: '15:00' }],
      }),
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>&</b>');
    expect(email.html).toContain('Бар &lt;b&gt;&amp;&lt;/b&gt; Ко');
    expect(email.html).toContain('&quot;Прва&quot; &lt;i&gt;');
  });
});

describe('formatWeekRange', () => {
  it('names the month once, twice, or with both years as needed', () => {
    expect(formatWeekRange('2026-09-21', '2026-09-27')).toBe('21 – 27 септември 2026');
    expect(formatWeekRange('2026-09-28', '2026-10-04')).toBe('28 септември – 4 октомври 2026');
    expect(formatWeekRange('2026-12-28', '2027-01-03')).toBe('28 декември 2026 – 3 јануари 2027');
  });
});
