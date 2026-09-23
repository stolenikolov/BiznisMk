import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCompanySettingsDto } from './company-settings.dto.js';

/** Runs the DTO the way the global ValidationPipe does. */
async function check(body: object) {
  const instance = plainToInstance(UpdateCompanySettingsDto, body);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, failed: errors.map((error) => error.property) };
}

describe('UpdateCompanySettingsDto', () => {
  it('accepts any subset of fields', async () => {
    expect((await check({})).failed).toEqual([]);
    expect((await check({ paydayDayOfMonth: 25 })).failed).toEqual([]);
    expect((await check({ name: 'DevShop', isVatPayer: true, defaultVatRate: 10 })).failed).toEqual([]);
  });

  it('reads a cleared optional field as null, and a bare domain as a web address', async () => {
    const { instance, failed } = await check({
      phone: '',
      website: 'devshop.mk',
      emailSenderName: '  ',
      emailReplyTo: ' Info@DevShop.mk ',
      paydayDayOfMonth: null,
    });

    expect(failed).toEqual([]);
    expect(instance).toMatchObject({
      phone: null,
      website: 'https://devshop.mk',
      emailSenderName: null,
      emailReplyTo: 'info@devshop.mk',
      paydayDayOfMonth: null,
    });
  });

  it('clears the website when it is emptied', async () => {
    const { instance, failed } = await check({ website: '' });
    expect(failed).toEqual([]);
    expect(instance.website).toBeNull();
  });

  it.each([
    ['a null name', { name: null }, 'name'],
    ['a blank address', { registeredAddress: '  ' }, 'registeredAddress'],
    ['a VAT rate the law does not have', { defaultVatRate: 20 }, 'defaultVatRate'],
    ['a payday of 32', { paydayDayOfMonth: 32 }, 'paydayDayOfMonth'],
    ['a payday of 0', { paydayDayOfMonth: 0 }, 'paydayDayOfMonth'],
    ['a sender name that would break the header', { emailSenderName: 'DevShop\nBcc: x@y.mk' }, 'emailSenderName'],
    ['a reply address that is not one', { emailReplyTo: 'info@' }, 'emailReplyTo'],
    ['a phone that is not one', { phone: 'call me' }, 'phone'],
    ['a website that is not one', { website: 'not a site' }, 'website'],
    ['changing the ЕДБ', { edb: '4030012345678' }, 'edb'],
  ])('refuses %s', async (_case, body, property) => {
    expect((await check(body)).failed).toEqual([property]);
  });
});
