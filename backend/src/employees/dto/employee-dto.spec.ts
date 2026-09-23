import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto.js';
import { UpdateEmployeeDto } from './update-employee.dto.js';

const valid = {
  firstName: 'Марко',
  lastName: 'Стојановски',
  email: 'marko@firma.mk',
  phone: '070 123 456',
  role: 'EMPLOYEE',
  salary: '40000',
  hireDate: '2026-09-17',
  vacationDaysRemaining: 20,
  iban: 'MK07300000000042425',
};

/** Runs the DTO the way the global ValidationPipe does. */
async function check<T extends object>(cls: new () => T, body: object) {
  const instance = plainToInstance(cls, body);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, failed: errors.map((error) => error.property) };
}

describe('CreateEmployeeDto', () => {
  it('accepts what the add-employee form sends', async () => {
    const { failed } = await check(CreateEmployeeDto, valid);
    expect(failed).toEqual([]);
  });

  it('normalises an IBAN typed in groups, and an email typed in capitals', async () => {
    const { instance, failed } = await check(CreateEmployeeDto, {
      ...valid,
      iban: 'mk07 3000 0000 0042 425',
      email: '  Marko@Firma.MK ',
    });

    expect(failed).toEqual([]);
    expect(instance.iban).toBe('MK07300000000042425');
    expect(instance.email).toBe('marko@firma.mk');
  });

  it.each([
    ['iban', 'MK0730000000004242'],
    ['iban', 'DE89370400440532013000'],
    ['salary', '0'],
    ['salary', '-500'],
    ['salary', '40000.555'],
    ['salary', 40000],
    ['hireDate', '17.09.2026'],
    ['role', 'OWNER'],
    ['phone', 'call me'],
    ['email', 'not-an-email'],
    ['firstName', '   '],
    ['vacationDaysRemaining', -1],
    ['vacationDaysRemaining', 2.5],
  ])('rejects %s = %j', async (field, value) => {
    const { failed } = await check(CreateEmployeeDto, { ...valid, [field]: value });
    expect(failed).toContain(field);
  });

  it('refuses fields that are not part of an employee', async () => {
    const { failed } = await check(CreateEmployeeDto, { ...valid, companyId: 'someone-else' });
    expect(failed).toContain('companyId');
  });
});

describe('UpdateEmployeeDto', () => {
  it('accepts a single field on its own', async () => {
    const { failed } = await check(UpdateEmployeeDto, { status: 'ON_LEAVE' });
    expect(failed).toEqual([]);
  });

  it('still validates the fields it is given', async () => {
    const { failed } = await check(UpdateEmployeeDto, { status: 'TERMINATED', iban: 'nope' });
    expect(failed.sort()).toEqual(['iban', 'status']);
  });

  it('lets a photo be cleared with null', async () => {
    const { failed } = await check(UpdateEmployeeDto, { photoUrl: null });
    expect(failed).toEqual([]);
  });
});
