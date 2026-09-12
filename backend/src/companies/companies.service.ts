import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompanyRole } from '../generated/prisma/enums.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a company and grants the creating user the OWNER role on it. */
  async create(ownerId: string, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { OR: [{ embs: dto.embs }, { edb: dto.edb }] },
      select: { embs: true, edb: true },
    });
    if (existing) {
      // Name the colliding identifier — ЕМБС and ЕДБ are distinct numbers and
      // "already registered" alone would leave the user guessing which one.
      throw new ConflictException(
        existing.embs === dto.embs
          ? 'A company with this ЕМБС is already registered'
          : 'A company with this ЕДБ is already registered',
      );
    }

    return this.prisma.company.create({
      data: {
        name: dto.name,
        embs: dto.embs,
        edb: dto.edb,
        legalForm: dto.legalForm,
        registeredAddress: dto.registeredAddress,
        isVatPayer: dto.isVatPayer,
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
