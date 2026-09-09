import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { CreateCustomFieldDto } from './dto/module-config.dto';

// Bentuk satu field kustom hasil Form Builder (disimpan di JSONB customFields)
interface CustomField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

@Injectable()
export class ModulesConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private configKey(tenantId: string, moduleKey: string) {
    return { tenantId_moduleKey: { tenantId, moduleKey } };
  }

  /** Pastikan key modul ada di katalog (FK moduleConfig -> moduleCatalog). */
  private async assertModuleExists(key: string) {
    const module = await this.prisma.moduleCatalog.findUnique({ where: { key } });
    if (!module) throw new NotFoundException('Modul tidak ditemukan di katalog.');
  }

  private readFields(customFields: Prisma.JsonValue | undefined): CustomField[] {
    return Array.isArray(customFields) ? (customFields as unknown as CustomField[]) : [];
  }

  /** Gabungkan katalog global dengan konfigurasi tenant; default nonaktif jika belum ada row. */
  async list(tenantId: string) {
    const [catalog, configs] = await Promise.all([
      this.prisma.moduleCatalog.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.moduleConfig.findMany({ where: { tenantId } }),
    ]);
    const byKey = new Map(configs.map((c) => [c.moduleKey, c]));
    return catalog.map((m) => {
      const cfg = byKey.get(m.key);
      return {
        key: m.key,
        label: m.label,
        description: m.description,
        isActive: cfg?.isActive ?? false,
        customFields: this.readFields(cfg?.customFields),
      };
    });
  }

  async setActive(tenantId: string, key: string, isActive: boolean) {
    await this.assertModuleExists(key);
    return this.prisma.moduleConfig.upsert({
      where: this.configKey(tenantId, key),
      update: { isActive },
      create: { tenantId, moduleKey: key, isActive },
    });
  }

  async getCustomFields(tenantId: string, key: string) {
    const cfg = await this.prisma.moduleConfig.findUnique({
      where: this.configKey(tenantId, key),
    });
    return this.readFields(cfg?.customFields);
  }

  async addCustomField(tenantId: string, key: string, dto: CreateCustomFieldDto) {
    if (dto.type === 'dropdown' && (!dto.options || dto.options.length < 2)) {
      throw new BadRequestException('Tipe dropdown wajib punya minimal 2 opsi.');
    }
    await this.assertModuleExists(key);

    const cfg = await this.prisma.moduleConfig.findUnique({
      where: this.configKey(tenantId, key),
    });
    const fields = this.readFields(cfg?.customFields);

    const field: CustomField = {
      id: `cf-${Date.now().toString(36)}`,
      label: dto.label,
      type: dto.type,
      ...(dto.options ? { options: dto.options } : {}),
    };
    const next = [...fields, field] as unknown as Prisma.InputJsonValue;

    await this.prisma.moduleConfig.upsert({
      where: this.configKey(tenantId, key),
      update: { customFields: next },
      create: { tenantId, moduleKey: key, isActive: false, customFields: next },
    });
    return field;
  }

  async removeCustomField(tenantId: string, key: string, fieldId: string) {
    const cfg = await this.prisma.moduleConfig.findUnique({
      where: this.configKey(tenantId, key),
    });
    const fields = this.readFields(cfg?.customFields);
    const next = fields.filter((f) => f.id !== fieldId);
    if (next.length === fields.length || !cfg) {
      throw new NotFoundException('Field tidak ditemukan.');
    }

    await this.prisma.moduleConfig.update({
      where: { id: cfg.id },
      data: { customFields: next as unknown as Prisma.InputJsonValue },
    });
    return { fieldId, deleted: true };
  }
}
