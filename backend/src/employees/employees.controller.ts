import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { EmployeeMessagesService } from './employee-messages.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { SendEmployeeMessageDto } from './dto/send-employee-message.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { activeCompany } from '../auth/active-company.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/**
 * The company's team. CEO-only for now, like the rest of the salary-bearing
 * surface; Manager access is a later layer.
 *
 * The company sits in the path, but the access token decides: a caller can
 * only reach the company they have switched into, so a hand-edited id in the
 * URL is refused rather than quietly served.
 */
@Controller('companies/:companyId/employees')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly messages: EmployeeMessagesService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.employees.findAllForCompany(activeCompany(user, companyId));
  }

  @Get(':employeeId')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return { employee: await this.employees.findOne(activeCompany(user, companyId), employeeId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return { employee: await this.employees.create(activeCompany(user, companyId), dto) };
  }

  /** Emails a written message to the chosen employees; replies go to the sender. */
  @Post('messages')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SendEmployeeMessageDto,
  ) {
    return this.messages.send(activeCompany(user, companyId), { userId: user.userId, email: user.email }, dto);
  }

  @Patch(':employeeId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return { employee: await this.employees.update(activeCompany(user, companyId), employeeId, dto) };
  }

  @Delete(':employeeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    await this.employees.remove(activeCompany(user, companyId), employeeId);
  }
}
