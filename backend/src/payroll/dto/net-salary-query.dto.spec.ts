import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NetSalaryQueryDto } from './net-salary-query.dto.js';

/** Query strings arrive as strings; this runs them the way the global ValidationPipe does. */
async function check(query: Record<string, string>) {
  const instance = plainToInstance(NetSalaryQueryDto, query);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, failed: errors.map((error) => error.property) };
}

describe('NetSalaryQueryDto', () => {
  it('accepts a gross amount and turns the year into a number', async () => {
    const { instance, failed } = await check({ gross: '40000.50', year: '2026' });

    expect(failed).toEqual([]);
    expect(instance.year).toBe(2026);
  });

  it('leaves the year out when it is not sent', async () => {
    const { instance, failed } = await check({ gross: '40000' });

    expect(failed).toEqual([]);
    expect(instance.year).toBeUndefined();
  });

  it.each([
    [{ gross: '40.000' }, 'gross'],
    [{ gross: '-1' }, 'gross'],
    [{ gross: '40000', year: '26' }, 'year'],
    [{ gross: '40000', year: 'this' }, 'year'],
  ])('rejects %j', async (query, field) => {
    const { failed } = await check(query);
    expect(failed).toContain(field);
  });
});
