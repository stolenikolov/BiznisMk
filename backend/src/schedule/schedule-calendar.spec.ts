import { describe, expect, it } from 'vitest';
import {
  addDays,
  changedEmployees,
  DAY_OFF,
  dayLeave,
  isCalendarDate,
  isShiftMark,
  leaveOn,
  shiftMinutes,
  snapshotOf,
  summarizeWeek,
  TIME_OF_DAY_PATTERN,
  weekDates,
  weekStartOf,
  type ResolvedEntry,
} from './schedule-calendar.js';

const shift = (label: string, startTime: string, endTime: string) => ({ label, startTime, endTime });

describe('shiftMinutes', () => {
  it('measures a day shift', () => {
    expect(shiftMinutes('08:00', '16:00')).toBe(480);
    expect(shiftMinutes('09:30', '13:15')).toBe(225);
  });

  it('wraps a shift that runs past midnight instead of going negative', () => {
    expect(shiftMinutes('22:00', '06:00')).toBe(480);
    expect(shiftMinutes('23:30', '00:15')).toBe(45);
  });

  it('counts a shift ending exactly at midnight', () => {
    expect(shiftMinutes('16:00', '00:00')).toBe(480);
  });
});

describe('TIME_OF_DAY_PATTERN', () => {
  it.each(['00:00', '08:05', '23:59'])('accepts %s', (value) => {
    expect(TIME_OF_DAY_PATTERN.test(value)).toBe(true);
  });

  it.each(['24:00', '8:00', '08:60', '08:00:00', ''])('rejects %j', (value) => {
    expect(TIME_OF_DAY_PATTERN.test(value)).toBe(false);
  });
});

describe('week arithmetic', () => {
  it('finds the Monday of any day, Sunday included', () => {
    expect(weekStartOf('2026-09-14')).toBe('2026-09-14'); // Monday
    expect(weekStartOf('2026-09-17')).toBe('2026-09-14'); // Thursday
    expect(weekStartOf('2026-09-20')).toBe('2026-09-14'); // Sunday
  });

  it('lists Monday to Sunday across a month and a year boundary', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
    expect(weekDates('2026-12-28').at(-1)).toBe('2027-01-03');
  });

  it('steps back a week for "copy previous"', () => {
    expect(addDays('2026-09-14', -7)).toBe('2026-09-07');
  });

  it('rejects days that do not exist', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('14.09.2026')).toBe(false);
  });
});

describe('leaveOn', () => {
  const today = '2026-09-17';

  it('never locks a day for an active employee', () => {
    expect(leaveOn('ACTIVE', '2026-09-18', today)).toBeNull();
  });

  it('applies leave from today onward', () => {
    expect(leaveOn('SICK_LEAVE', today, today)).toBe('SICK_LEAVE');
    expect(leaveOn('ON_LEAVE', '2026-09-30', today)).toBe('ON_LEAVE');
  });

  it('does not rewrite days already past, since the status carries no start date', () => {
    expect(leaveOn('ON_LEAVE', '2026-09-16', today)).toBeNull();
  });
});

describe('dayLeave', () => {
  const today = '2026-09-17';

  it('reads a day of leave planned in the grid', () => {
    expect(dayLeave('ACTIVE', { leave: 'SICK_LEAVE' }, '2026-09-18', today)).toBe('SICK_LEAVE');
    expect(dayLeave('ACTIVE', { leave: null }, '2026-09-18', today)).toBeNull();
    expect(dayLeave('ACTIVE', undefined, '2026-09-18', today)).toBeNull();
  });

  it('lets the employee’s status win, since that is what locks the day', () => {
    expect(dayLeave('ON_LEAVE', { leave: 'SICK_LEAVE' }, '2026-09-18', today)).toBe('ON_LEAVE');
  });

  it('keeps a planned day of leave in the past, unlike the undated status', () => {
    expect(dayLeave('ACTIVE', { leave: 'ON_LEAVE' }, '2026-09-15', today)).toBe('ON_LEAVE');
  });
});

describe('summarizeWeek', () => {
  const today = '2026-09-17';
  const dates = weekDates('2026-09-14');
  const employees = [
    { id: 'ana', status: 'ACTIVE' as const },
    { id: 'marko', status: 'ACTIVE' as const },
    { id: 'petar', status: 'SICK_LEAVE' as const },
  ];

  it('adds hours, counts today’s shifts, and leaves leave days out of both', () => {
    const entries: ResolvedEntry[] = [
      { employeeId: 'ana', date: '2026-09-17', shift: shift('Прва', '08:00', '16:00') },
      { employeeId: 'ana', date: '2026-09-18', shift: shift('Ноќна', '22:00', '06:00') },
      { employeeId: 'marko', date: '2026-09-15', shift: shift('Прва', '08:00', '16:00') },
      // Before Petar's leave took effect: worked and counted.
      { employeeId: 'petar', date: '2026-09-16', shift: shift('Прва', '08:00', '16:00') },
      // On his leave: shown as leave, not counted.
      { employeeId: 'petar', date: '2026-09-17', shift: shift('Прва', '08:00', '16:00') },
      { employeeId: 'marko', date: '2026-09-19', shift: null },
    ];

    expect(summarizeWeek(employees, entries, dates, today)).toEqual({
      scheduledMinutes: 4 * 480,
      onShiftToday: 1,
      onLeaveThisWeek: 1,
    });
  });

  it('counts nobody as on leave in a week that is entirely past', () => {
    const lastMonth = weekDates('2026-08-10');
    expect(summarizeWeek(employees, [], lastMonth, today).onLeaveThisWeek).toBe(0);
  });
});

describe('snapshotOf / changedEmployees', () => {
  const today = '2026-09-14';
  const employees = [
    { id: 'ana', status: 'ACTIVE' as const },
    { id: 'marko', status: 'ACTIVE' as const },
    { id: 'petar', status: 'ON_LEAVE' as const },
  ];

  const base: ResolvedEntry[] = [
    { employeeId: 'ana', date: '2026-09-14', shift: shift('Прва', '08:00', '16:00') },
    { employeeId: 'marko', date: '2026-09-15', shift: shift('Втора', '14:00', '22:00') },
    { employeeId: 'petar', date: '2026-09-15', shift: shift('Прва', '08:00', '16:00') },
  ];

  it('records only the days each person will actually work', () => {
    expect(snapshotOf(employees, base, today)).toEqual({
      ana: { '2026-09-14': 'Прва|08:00|16:00' },
      marko: { '2026-09-15': 'Втора|14:00|22:00' },
    });
  });

  it('treats a first publication as a change for everyone scheduled', () => {
    expect(changedEmployees({}, snapshotOf(employees, base, today))).toEqual(['ana', 'marko']);
  });

  it('flags only the people whose own days changed', () => {
    const before = snapshotOf(employees, base, today);
    const after = snapshotOf(
      employees,
      [
        base[0]!,
        // Marko's shift retimed through its template.
        { ...base[1]!, shift: shift('Втора', '15:00', '23:00') },
      ],
      today,
    );

    expect(changedEmployees(before, after)).toEqual(['marko']);
  });

  it('flags someone whose shift was removed entirely', () => {
    const before = snapshotOf(employees, base, today);
    const after = snapshotOf(employees, [base[1]!], today);

    expect(changedEmployees(before, after)).toEqual(['ana']);
  });

  it('flags nobody when nothing changed', () => {
    const snapshot = snapshotOf(employees, base, today);
    expect(changedEmployees(snapshot, structuredClone(snapshot))).toEqual([]);
  });

  it('records a day off, and flags it being given or turned back into a shift', () => {
    const dayOff: ResolvedEntry = { employeeId: 'ana', date: '2026-09-15', shift: null, dayOff: true };
    const before = snapshotOf(employees, base, today);
    const after = snapshotOf(employees, [...base, dayOff], today);

    expect(after.ana).toEqual({ '2026-09-14': 'Прва|08:00|16:00', '2026-09-15': DAY_OFF });
    expect(changedEmployees(before, after)).toEqual(['ana']);

    const backToShift = snapshotOf(employees, [...base, { ...dayOff, shift: shift('Прва', '08:00', '16:00'), dayOff: false }], today);
    expect(changedEmployees(after, backToShift)).toEqual(['ana']);
  });

  it('records a planned day of leave, and flags it being planned, changed or cancelled', () => {
    const sick: ResolvedEntry = { employeeId: 'ana', date: '2026-09-15', shift: null, leave: 'SICK_LEAVE' };
    const before = snapshotOf(employees, base, today);
    const after = snapshotOf(employees, [...base, sick], today);

    expect(after.ana).toEqual({ '2026-09-14': 'Прва|08:00|16:00', '2026-09-15': 'LEAVE:SICK_LEAVE' });
    expect(changedEmployees(before, after)).toEqual(['ana']);

    const holiday = snapshotOf(employees, [...base, { ...sick, leave: 'ON_LEAVE' }], today);
    expect(changedEmployees(after, holiday)).toEqual(['ana']);
    expect(changedEmployees(after, before)).toEqual(['ana']);
  });

  it('tells a shift apart from a day off or a day away', () => {
    expect(isShiftMark('Прва|08:00|16:00')).toBe(true);
    expect(isShiftMark(DAY_OFF)).toBe(false);
    expect(isShiftMark('LEAVE:ON_LEAVE')).toBe(false);
  });

  it('does not record a day off on a day the person is on leave anyway', () => {
    const snapshot = snapshotOf(
      employees,
      [{ employeeId: 'petar', date: '2026-09-16', shift: null, dayOff: true }],
      today,
    );
    expect(snapshot).toEqual({});
  });
});
