import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendEmployeeMessageDto } from './send-employee-message.dto.js';

const valid = {
  employeeIds: ['6f1c2a4e-8d3b-4a7e-9c1f-2b5d8e0a3c71'],
  subject: 'Собир во петок',
  body: 'Во 16:00 во канцеларија.',
};

/** Runs the DTO the way the global ValidationPipe does. */
async function check(body: object) {
  const instance = plainToInstance(SendEmployeeMessageDto, body);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, failed: errors.map((error) => error.property) };
}

describe('SendEmployeeMessageDto', () => {
  it('accepts what the message form sends, trimmed', async () => {
    const { instance, failed } = await check({ ...valid, subject: '  Собир  ', body: '\n Текст \n' });

    expect(failed).toEqual([]);
    expect(instance.subject).toBe('Собир');
    expect(instance.body).toBe('Текст');
  });

  it.each([
    ['no recipients', { employeeIds: [] }, 'employeeIds'],
    ['the same recipient twice', { employeeIds: [valid.employeeIds[0], valid.employeeIds[0]] }, 'employeeIds'],
    ['a recipient that is not an id', { employeeIds: ['ana'] }, 'employeeIds'],
    ['a blank subject', { subject: '   ' }, 'subject'],
    ['a subject over two lines', { subject: 'Собир\nBcc: someone@else.mk' }, 'subject'],
    ['a blank message', { body: ' \n ' }, 'body'],
    ['a message over 5000 characters', { body: 'а'.repeat(5001) }, 'body'],
  ])('refuses %s', async (_case, change, property) => {
    const { failed } = await check({ ...valid, ...change });
    expect(failed).toEqual([property]);
  });
});
