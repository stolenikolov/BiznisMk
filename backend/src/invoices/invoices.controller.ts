import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { PreviewInvoiceTotalsDto } from './dto/preview-invoice-totals.dto.js';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/** CEO-only for now, matching the rest of the finance surface. */
@Controller('invoices')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    // companyId is guaranteed by CompanyRolesGuard.
    return this.invoices.findAllForCompany(user.companyId!);
  }

  /**
   * Totals for lines that have not been issued yet. POST rather than GET
   * because the lines are a structured body, not a query string.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewInvoiceTotalsDto) {
    return this.invoices.previewTotals(user.companyId!, dto.lines);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return { invoice: await this.invoices.findOne(user.companyId!, id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return { invoice: await this.invoices.create(user.companyId!, dto) };
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return { invoice: await this.invoices.updateStatus(user.companyId!, id, dto.status) };
  }
}
