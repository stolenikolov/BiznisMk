import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a company and grants the creating user the OWNER role on it. */
  async create(ownerId: string, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { taxId: dto.taxId } });
    if (existing) {
      throw new ConflictException('A company with this tax ID is already registered');
    }

    return this.prisma.company.create({
      data: {
        name: dto.name,
        taxId: dto.taxId,
        registrationNo: dto.registrationNo,
        address: dto.address,
        city: dto.city,
        memberships: {
          create: {
            userId: ownerId,
            role: CompanyRole.OWNER,
          },
        },
      },
    });
  }
}
