import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateShiftTemplateDto, SetScheduleEntryDto, UpdateShiftTemplateDto } from './schedule.dto.js';

async function failed<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((error) => error.property);
}

describe('CreateShiftTemplateDto', () => {
  it('accepts any label and a night shift', async () => {
    expect(await failed(CreateShiftTemplateDto, { label: 'Ноќна', startTime: '22:00', endTime: '06:00' })).toEqual([]);
  });

  it.each([
    [{ label: '   ', startTime: '08:00', endTime: '16:00' }, 'label'],
    [{ label: 'Прва', startTime: '8:00', endTime: '16:00' }, 'startTime'],
    [{ label: 'Прва', startTime: '08:00', endTime: '24:00' }, 'endTime'],
  ])('rejects %j', async (body, field) => {
    expect(await failed(CreateShiftTemplateDto, body)).toContain(field);
  });
});

describe('UpdateShiftTemplateDto', () => {
  it('takes a single field on its own', async () => {
    expect(await failed(UpdateShiftTemplateDto, { endTime: '15:30' })).toEqual([]);
  });
});

describe('SetScheduleEntryDto', () => {
  const base = { employeeId: '6f1c1f7e-8a8b-4b8e-9d1e-0c9a7b3f2a11', date: '2026-09-18' };

  it('accepts a template id, or an explicit null to clear the day', async () => {
    expect(await failed(SetScheduleEntryDto, { ...base, shiftTemplateId: '0b8c7a4e-2f3d-4c1b-9a6e-5d4c3b2a1f00' })).toEqual([]);
    expect(await failed(SetScheduleEntryDto, { ...base, shiftTemplateId: null })).toEqual([]);
  });

  it('will not treat a missing template id as "clear the day"', async () => {
    expect(await failed(SetScheduleEntryDto, base)).toContain('shiftTemplateId');
  });

  it('takes a day of holiday or sick leave, and nothing else as leave', async () => {
    expect(await failed(SetScheduleEntryDto, { ...base, shiftTemplateId: null, leave: 'ON_LEAVE' })).toEqual([]);
    expect(await failed(SetScheduleEntryDto, { ...base, shiftTemplateId: null, leave: 'SICK_LEAVE' })).toEqual([]);
    expect(await failed(SetScheduleEntryDto, { ...base, shiftTemplateId: null, leave: 'ACTIVE' })).toContain('leave');
  });

  it('rejects a date in another format', async () => {
    expect(await failed(SetScheduleEntryDto, { ...base, date: '18.09.2026', shiftTemplateId: null })).toContain('date');
  });
});
