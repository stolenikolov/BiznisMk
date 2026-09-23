import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceDirection,
  InvoiceStatus,
  TransactionCategory,
  TransactionDirection,
} from '../generated/prisma/enums.js';
import { calculateInvoiceTotals } from './invoice-totals.js';
import { buildInvoiceIssuerHeader, type InvoiceIssuerHeader } from './invoice-issuer.js';
import { formatInvoiceNumber, nextSequence } from './invoice-number.js';
import { allowedTransitionsFrom, canTransition, isOverdue } from './invoice-status.js';
import { chooseSettlementAccount } from './invoice-settlement.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';

const Decimal = Prisma.Decimal;

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * How many times to retry numbering when two invoices are issued at the same
 * instant. The unique constraint on (companyId, year, sequence) is what
 * actually guarantees correctness; this just turns a lost race into a retry
 * instead of an error the user sees.
 */
const NUMBERING_ATTEMPTS = 3;

export interface InvoiceSummary {
  id: string;
  /** OUTGOING: we issued it. INCOMING: a supplier bill we owe. */
  direction: InvoiceDirection;
  invoiceNumber: string;
  clientName: string;
  status: InvoiceStatus;
  currency: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
  issueDate: string;
  dueDate: string | null;
  /** Derived, not stored — a sent invoice past its due date. */
  overdue: boolean;
  /** Which account the money moved on, once it was marked paid. */
  settledAccountId: string | null;
  settledAt: string | null;
}

export interface InvoiceLineView {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string | null;
  netAmount: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  clientAddress: string;
  clientEdb: string | null;
  notes: string | null;
  vatApplied: boolean;
  lines: InvoiceLineView[];
  /** Recomputed from the stored lines so the document renders its VAT rows. */
  vatBreakdown: { rate: string; base: string; amount: string }[];
  issuer: InvoiceIssuerHeader;
}

export interface InvoiceTotalsPreview {
  net: string;
  vatApplied: boolean;
  vatBreakdown: { rate: string; base: string; amount: string }[];
  vatTotal: string;
  total: string;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAllForCompany(companyId: string): Promise<{ invoices: InvoiceSummary[] }> {
    const rows = await this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    });

    const now = new Date();
    return { invoices: rows.map((row) => toSummary(row, now)) };
  }

  async findOne(companyId: string, invoiceId: string): Promise<InvoiceDetail> {
    const invoice = await this.prisma.invoice.findFirst({
      // Scoped by companyId as well as id: an id from another tenant must read
      // as "not found", never as someone else's invoice.
      where: { id: invoiceId, companyId },
      include: {
        lines: { orderBy: { position: 'asc' } },
        company: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const now = new Date();
    const totals = calculateInvoiceTotals(
      invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        ...(line.vatRate === null ? {} : { vatRate: line.vatRate }),
      })),
      { isVatPayer: invoice.vatApplied, defaultVatRate: invoice.company.defaultVatRate },
    );

    return {
      ...toSummary(invoice, now),
      clientAddress: invoice.clientAddress,
      clientEdb: invoice.clientEdb,
      notes: invoice.notes,
      vatApplied: invoice.vatApplied,
      lines: invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity.toFixed(3),
        unitPrice: line.unitPrice.toFixed(2),
        vatRate: line.vatRate === null ? null : line.vatRate.toFixed(2),
        netAmount: line.netAmount.toFixed(2),
      })),
      vatBreakdown: totals.vatBreakdown.map((entry) => ({
        rate: entry.rate.toFixed(2),
        base: entry.base.toFixed(2),
        amount: entry.amount.toFixed(2),
      })),
      issuer: buildInvoiceIssuerHeader(invoice.company),
    };
  }

  /**
   * Totals for lines the user is still typing, computed by the same function
   * that will freeze them at issue time. The form shows this live so the VAT
   * breakdown on screen is never a second, drifting implementation.
   */
  async previewTotals(
    companyId: string,
    lines: CreateInvoiceDto['lines'],
  ): Promise<InvoiceTotalsPreview> {
    const company = await this.loadIssuer(companyId);
    const totals = calculateInvoiceTotals(lines, company);

    return {
      net: totals.net.toFixed(2),
      vatApplied: totals.vatApplied,
      vatBreakdown: totals.vatBreakdown.map((entry) => ({
        rate: entry.rate.toFixed(2),
        base: entry.base.toFixed(2),
        amount: entry.amount.toFixed(2),
      })),
      vatTotal: totals.vatTotal.toFixed(2),
      total: totals.total.toFixed(2),
    };
  }

  async create(companyId: string, dto: CreateInvoiceDto): Promise<InvoiceDetail> {
    const company = await this.loadIssuer(companyId);
    const totals = calculateInvoiceTotals(dto.lines, company);

    const issueDate = new Date(dto.issueDate);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    if (dueDate && dueDate.getTime() < issueDate.getTime()) {
      throw new BadRequestException('dueDate cannot fall before issueDate');
    }

    const direction =
      dto.direction === 'INCOMING' ? InvoiceDirection.INCOMING : InvoiceDirection.OUTGOING;

    // A supplier's bill already has a number. Taking one out of our own
    // sequence for it would leave a hole in the invoices we issue, which is
    // exactly what the tax authority looks for.
    if (direction === InvoiceDirection.INCOMING) {
      const supplierNumber = dto.invoiceNumber?.trim();
      if (!supplierNumber) {
        throw new BadRequestException('invoiceNumber is required for an incoming bill');
      }

      // The same number from the same supplier is the same bill entered twice.
      // The same number from a different supplier is an ordinary coincidence —
      // every company numbers its own invoices from one upwards.
      const duplicate = await this.prisma.invoice.findFirst({
        where: {
          companyId,
          direction: InvoiceDirection.INCOMING,
          invoiceNumber: supplierNumber,
          ...(dto.clientEdb?.trim()
            ? { clientEdb: dto.clientEdb.trim() }
            : { clientName: dto.clientName }),
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException(
          `A bill numbered ${supplierNumber} from this supplier is already recorded`,
        );
      }

      const bill = await this.prisma.invoice.create({
        data: {
          ...this.invoiceFields(companyId, dto, totals, issueDate, dueDate, company),
          direction,
          year: null,
          sequence: null,
          invoiceNumber: supplierNumber,
        },
        select: { id: true },
      });

      return this.findOne(companyId, bill.id);
    }

    // The year comes from the issue date, not from today: an invoice issued on
    // 31 December belongs to that year's sequence even if it is entered later.
    const year = issueDate.getFullYear();

    const created = await this.allocateAndCreate(companyId, year, async (sequence) =>
      this.prisma.invoice.create({
        data: {
          ...this.invoiceFields(companyId, dto, totals, issueDate, dueDate, company),
          direction,
          year,
          sequence,
          invoiceNumber: formatInvoiceNumber(year, sequence),
        },
        select: { id: true },
      }),
    );

    return this.findOne(companyId, created.id);
  }

  /** Everything both invoice directions store identically. */
  private invoiceFields(
    companyId: string,
    dto: CreateInvoiceDto,
    totals: ReturnType<typeof calculateInvoiceTotals>,
    issueDate: Date,
    dueDate: Date | null,
    company: { currency: string; defaultVatRate: Prisma.Decimal },
  ) {
    return {
      companyId,
      clientName: dto.clientName,
      clientAddress: dto.clientAddress,
      clientEdb: dto.clientEdb ?? null,
      netAmount: totals.net,
      vatAmount: totals.vatTotal,
      totalAmount: totals.total,
      vatApplied: totals.vatApplied,
      currency: company.currency,
      status: InvoiceStatus.DRAFT,
      issueDate,
      dueDate,
      notes: dto.notes ?? null,
      lines: {
        create: totals.lines.map((line, index) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          // Rates are dropped entirely for a non-VAT-payer, matching the
          // totals: the stored document must not imply a 0% rate.
          vatRate: totals.vatApplied
            ? new Decimal(dto.lines[index]!.vatRate ?? company.defaultVatRate)
            : null,
          netAmount: line.net,
          position: index,
        })),
      },
    };
  }

  async updateStatus(
    companyId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<InvoiceDetail> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      select: {
        id: true,
        status: true,
        direction: true,
        currency: true,
        totalAmount: true,
        invoiceNumber: true,
        clientName: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!canTransition(invoice.status, status)) {
      const allowed = allowedTransitionsFrom(invoice.status);
      throw new BadRequestException(
        allowed.length === 0
          ? `An invoice that is ${invoice.status} can no longer change status`
          : `Cannot move an invoice from ${invoice.status} to ${status}; allowed: ${allowed.join(', ')}`,
      );
    }

    if (status === InvoiceStatus.PAID) {
      await this.settle(companyId, invoice);
    } else {
      // Only from the status the transition was checked against: another
      // request may have moved it since.
      const { count } = await this.prisma.invoice.updateMany({
        where: { id: invoice.id, companyId, status: invoice.status },
        data: { status },
      });
      if (count === 0) throw changedMeanwhile();
    }

    return this.findOne(companyId, invoice.id);
  }

  /**
   * Moves the money behind a PAID invoice.
   *
   * One we issued credits the first account that can hold it; a supplier bill
   * debits the first account that can cover it in full. The transaction, the
   * new balance and the invoice's status are written together, so an invoice is
   * never marked paid without the money having actually moved.
   *
   * Two requests can race here — a double click is enough. The invoice is
   * claimed inside the transaction, from the status it was read with, so only
   * one of them moves money; the balance changes by the amount rather than
   * being overwritten with a figure read earlier, and a debit only goes
   * through while the account still covers it.
   */
  private async settle(
    companyId: string,
    invoice: {
      id: string;
      status: InvoiceStatus;
      direction: InvoiceDirection;
      currency: string;
      totalAmount: Prisma.Decimal;
      invoiceNumber: string;
      clientName: string;
    },
  ): Promise<void> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        iban: true,
        bankName: true,
        currency: true,
        balance: true,
        status: true,
      },
    });

    const choice = chooseSettlementAccount(
      accounts,
      invoice.direction,
      invoice.totalAmount,
      invoice.currency,
    );

    if (!choice.ok) {
      throw new UnprocessableEntityException(
        choice.reason === 'NO_ELIGIBLE_ACCOUNT'
          ? `No active ${invoice.currency} account to settle this invoice against`
          : `No single account holds enough to pay this invoice; short by ${choice.shortfall.toFixed(2)} ${invoice.currency}`,
      );
    }

    const isIncoming = invoice.direction === InvoiceDirection.INCOMING;
    const settledAt = new Date();

    const booked = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, companyId, status: invoice.status },
        data: { status: InvoiceStatus.PAID, settledAccountId: choice.account.id, settledAt },
      });
      if (claimed.count === 0) throw changedMeanwhile();

      const moved = await tx.bankAccount.updateMany({
        where: {
          id: choice.account.id,
          ...(isIncoming ? { balance: { gte: invoice.totalAmount } } : {}),
        },
        data: {
          balance: isIncoming ? { decrement: invoice.totalAmount } : { increment: invoice.totalAmount },
        },
      });
      if (moved.count === 0) {
        throw new UnprocessableEntityException(
          'The account no longer holds enough to pay this invoice; reload and try again',
        );
      }

      const transaction = await tx.transaction.create({
        data: {
          companyId,
          bankAccountId: choice.account.id,
          description: `${invoice.invoiceNumber} — ${invoice.clientName}`,
          category: TransactionCategory.INVOICE,
          direction: isIncoming ? TransactionDirection.OUT : TransactionDirection.IN,
          amount: invoice.totalAmount,
          bookedAt: settledAt,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { settledTransactionId: transaction.id },
      });

      return transaction;
    });

    // Settling is the one place in the app where money moves by hand, so
    // this is a genuine inflow or outflow and is announced as one. Outside
    // the database transaction on purpose: the money has already moved, and
    // a notification must never be the thing that rolls it back.
    await this.notifications.transactionsRecorded(companyId, choice.account, [
      {
        id: booked.id,
        direction: booked.direction,
        amount: booked.amount.toFixed(2),
        description: booked.description,
        bookedAt: booked.bookedAt,
      },
    ]);
  }

  /** The issuing company's invoice-relevant fields. */
  private async loadIssuer(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  /**
   * Allocates the next counter for the year and runs `create` with it, retrying
   * if a concurrent issue took the same number first. Reading the highest
   * counter and inserting are not atomic together, so the unique constraint is
   * what enforces the invariant and this loop just absorbs the collision.
   */
  private async allocateAndCreate<T>(
    companyId: string,
    year: number,
    create: (sequence: number) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= NUMBERING_ATTEMPTS; attempt += 1) {
      const highest = await this.prisma.invoice.findFirst({
        where: { companyId, year },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      try {
        return await create(nextSequence(highest?.sequence ?? null));
      } catch (error) {
        const lostRace =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_VIOLATION &&
          attempt < NUMBERING_ATTEMPTS;
        if (!lostRace) throw error;
      }
    }

    // Unreachable: the loop either returns or rethrows on its last attempt.
    throw new Error('Failed to allocate an invoice number');
  }
}

function toSummary(
  row: {
    id: string;
    direction: InvoiceDirection;
    invoiceNumber: string;
    clientName: string;
    status: InvoiceStatus;
    currency: string;
    netAmount: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    issueDate: Date;
    dueDate: Date | null;
    settledAccountId: string | null;
    settledAt: Date | null;
  },
  now: Date,
): InvoiceSummary {
  return {
    id: row.id,
    direction: row.direction,
    invoiceNumber: row.invoiceNumber,
    clientName: row.clientName,
    status: row.status,
    currency: row.currency,
    netAmount: row.netAmount.toFixed(2),
    vatAmount: row.vatAmount.toFixed(2),
    totalAmount: row.totalAmount.toFixed(2),
    issueDate: row.issueDate.toISOString().slice(0, 10),
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    overdue: isOverdue(row, now),
    settledAccountId: row.settledAccountId,
    settledAt: row.settledAt ? row.settledAt.toISOString().slice(0, 10) : null,
  };
}

function changedMeanwhile() {
  return new ConflictException({
    errorCode: 'INVOICE_CHANGED',
    message: 'This invoice changed while it was being updated; reload it and try again',
  });
}
