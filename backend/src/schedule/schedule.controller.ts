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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service.js';
import { CreateShiftTemplateDto, SetScheduleEntryDto, UpdateShiftTemplateDto } from './dto/schedule.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { activeCompany } from '../auth/active-company.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type.js';

/**
 * The shifts a company works. Managed by the CEO and managers — unlike the
 * salary-bearing parts of the team section, nothing here involves pay.
 */
@Controller('companies/:companyId/schedule/shift-templates')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO, CompanyRole.MANAGER)
export class ShiftTemplatesController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return { templates: await this.schedule.listTemplates(activeCompany(user, companyId)) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateShiftTemplateDto,
  ) {
    return { template: await this.schedule.createTemplate(activeCompany(user, companyId), dto) };
  }

  @Patch(':templateId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateShiftTemplateDto,
  ) {
    return { template: await this.schedule.updateTemplate(activeCompany(user, companyId), templateId, dto) };
  }

  /** Answers with how many assignments lost their shift, so the grid can say so. */
  @Delete(':templateId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.schedule.removeTemplate(activeCompany(user, companyId), templateId);
  }
}

/** The weekly grid: reading a week, assigning a day, copying, publishing. */
@Controller('companies/:companyId/schedule')
@UseGuards(CompanyRolesGuard)
@Roles(CompanyRole.CEO, CompanyRole.MANAGER)
export class ScheduleEntriesController {
  constructor(private readonly schedule: ScheduleService) {}

  /** Everything the grid shows for one week, named by its Monday. */
  @Get('weeks/:weekStart')
  async week(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('weekStart') weekStart: string,
  ) {
    return { week: await this.schedule.getWeek(activeCompany(user, companyId), weekStart) };
  }

  /** Assigns a shift to one employee for one day, or clears it with `shiftTemplateId: null`. */
  @Put('entries')
  async setEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SetScheduleEntryDto,
  ) {
    return { entry: await this.schedule.setEntry(activeCompany(user, companyId), dto) };
  }

  @Post('weeks/:weekStart/copy-previous')
  @HttpCode(HttpStatus.OK)
  async copyPrevious(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('weekStart') weekStart: string,
  ) {
    return this.schedule.copyPreviousWeek(activeCompany(user, companyId), weekStart);
  }

  /** Locks the week and emails employees their shifts; replies go to whoever published. */
  @Post('weeks/:weekStart/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('weekStart') weekStart: string,
  ) {
    return this.schedule.publish(activeCompany(user, companyId), weekStart, user.email);
  }

  @Post('weeks/:weekStart/unlock')
  @HttpCode(HttpStatus.OK)
  async unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('weekStart') weekStart: string,
  ) {
    return { week: await this.schedule.unlock(activeCompany(user, companyId), weekStart) };
  }
}
