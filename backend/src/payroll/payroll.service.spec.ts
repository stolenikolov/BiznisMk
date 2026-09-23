import { describe, expect, it, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const Decimal = Prisma.Decimal;

/** A tax_settings row as Prisma returns it. */
const MK_2026_ROW = {
  id: 'ts-2026',
  country: 'MK',
  year: 2026,
  personalAllowanceMonthly: new Decimal('10932.00'),
  incomeTaxRate: new Decimal('10.00'),
  contributionsRate: new Decimal('28.00'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function serviceWith(row: typeof MK_2026_ROW | null, country = 'MK') {
  const prisma = {
    taxSettings: { findUnique: vi.fn().mockResolvedValue(row) },
    company: { findUniqueOrThrow: vi.fn().mockResolvedValue({ country }) },
  };
  return { service: new PayrollService(prisma as unknown as PrismaService), prisma };
}

describe('PayrollService', () => {
  it('reads the parameters for exactly one country and year', async () => {
    const { service, prisma } = serviceWith(MK_2026_ROW);

    const parameters = await service.parametersFor('MK', 2026);

    expect(prisma.taxSettings.findUnique).toHaveBeenCalledWith({
      where: { country_year: { country: 'MK', year: 2026 } },
    });
    expect(parameters?.personalAllowanceMonthly.toFixed(2)).toBe('10932.00');
  });

  it('reports a year nobody has entered as missing instead of borrowing another year', async () => {
    const { service } = serviceWith(null);

    expect(await service.parametersFor('MK', 2027)).toBeNull();
    await expect(service.requireParametersFor('MK', 2027)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('names the missing year in the refusal, so the fix is obvious', async () => {
    const { service } = serviceWith(null);

    const error = await service.requireParametersFor('MK', 2027).catch((e: UnprocessableEntityException) => e);

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      errorCode: 'TAX_SETTINGS_MISSING',
      country: 'MK',
      year: 2027,
    });
  });

  it('prices a salary with the company’s own country and the requested year', async () => {
    const { service, prisma } = serviceWith(MK_2026_ROW);

    const breakdown = await service.calculateNetSalary('company-1', '40000', 2026);

    expect(prisma.company.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      select: { country: true },
    });
    expect(breakdown).toMatchObject({ net: '27013.20', taxYear: 2026, incomeTaxRate: '10.00' });
  });
});
