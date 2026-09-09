import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { PrismaService } from '../../common/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';

// Modul default per template industri (App Flow §1)
const TEMPLATE_MODULES: Record<string, string[]> = {
  retail: ['inventory', 'pos', 'finance', 'assistant'],
  manufacturing: ['inventory', 'production', 'finance', 'assistant'],
  services: ['booking', 'pos', 'finance', 'assistant'],
};

// COA minimal untuk jurnal otomatis
const DEFAULT_COA = [
  { code: '1000', name: 'Kas', type: 'asset' as const },
  { code: '1100', name: 'Persediaan', type: 'asset' as const },
  { code: '2000', name: 'Hutang Usaha', type: 'liability' as const },
  { code: '4000', name: 'Pendapatan Usaha', type: 'revenue' as const },
  { code: '5000', name: 'Harga Pokok Penjualan', type: 'expense' as const },
  { code: '6100', name: 'Beban Operasional', type: 'expense' as const },
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // Registrasi tenant baru + owner + modul default + COA. Trial +AI 14 hari.
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar. Silakan login.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: dto.businessName,
          industryTemplate: dto.industryTemplate,
          subscriptionPlan: 'plus_ai', // trial 14 hari
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: t.id,
          plan: 'plus_ai',
          status: 'trialing',
          aiQuota: 1000,
          endsAt: trialEnds,
        },
      });

      // Pastikan katalog modul ada (idempotent)
      const catalog = [
        ['inventory', 'Kontrol Inventori'],
        ['pos', 'Kasir & POS'],
        ['finance', 'Laporan Keuangan'],
        ['assistant', 'Retalio Intelligence'],
        ['production', 'Produksi'],
        ['booking', 'Booking & Reservasi'],
      ] as const;
      for (const [key, label] of catalog) {
        await tx.moduleCatalog.upsert({
          where: { key },
          update: {},
          create: { key, label, description: label },
        });
      }

      const activeModules = TEMPLATE_MODULES[dto.industryTemplate] ?? TEMPLATE_MODULES.retail;
      for (const [key] of catalog) {
        await tx.moduleConfig.create({
          data: { tenantId: t.id, moduleKey: key, isActive: activeModules.includes(key) },
        });
      }

      for (const acc of DEFAULT_COA) {
        await tx.chartOfAccount.create({ data: { tenantId: t.id, ...acc } });
      }

      await tx.user.create({
        data: {
          tenantId: t.id,
          name: dto.ownerName,
          email: dto.email,
          passwordHash,
          role: 'owner',
        },
      });

      return t;
    });

    const user = await this.prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, email: dto.email },
    });
    return this.issueTokens(this.toAuthUser(user), tenant.name, tenant.subscriptionPlan);
  }

  async login(dto: LoginDto) {
    const clean = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: clean, mode: 'insensitive' } },
          { email: { equals: `${clean}.id`, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { tenant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email/username atau kata sandi salah.');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Email/username atau kata sandi salah.');

    // 2FA wajib untuk owner/admin yang sudah mengaktifkannya (TRD §keamanan)
    if (user.twoFactorEnabled && (user.role === 'owner' || user.role === 'admin')) {
      if (!dto.otp) {
        throw new UnauthorizedException('Kode OTP 2FA diperlukan.');
      }
      const valid = authenticator.check(dto.otp, user.twoFactorSecret ?? '');
      if (!valid) throw new UnauthorizedException('Kode OTP salah atau kedaluwarsa.');
    }

    return this.issueTokens(
      this.toAuthUser(user),
      user.tenant?.name || 'Retalio Platform',
      user.tenant?.subscriptionPlan || 'custom',
    );
  }

  async refresh(dto: RefreshDto) {
    try {
      const payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      if (payload.type !== 'refresh') throw new Error('bukan refresh token');
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: payload.sub },
        include: { tenant: true },
      });
      if (!user.isActive) throw new Error('nonaktif');
      return this.issueTokens(this.toAuthUser(user), user.tenant.name, user.tenant.subscriptionPlan);
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid. Silakan login ulang.');
    }
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: authUser.sub, tenantId: authUser.tenantId },
      include: { tenant: true, outlets: { include: { outlet: true } } },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      permissions: user.permissions,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        industryTemplate: user.tenant.industryTemplate,
        subscriptionPlan: user.tenant.subscriptionPlan,
      },
      outlets: user.outlets.map((uo) => ({ id: uo.outlet.id, name: uo.outlet.name })),
    };
  }

  // ── 2FA TOTP ──────────────────────────────────────────
  async setup2fa(authUser: AuthUser) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: authUser.sub },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    return {
      secret,
      otpauthUrl: authenticator.keyuri(authUser.email, 'Retalio', secret),
      note: 'Pindai URL ini di aplikasi authenticator, lalu aktifkan dengan kode 6 digit.',
    };
  }

  async enable2fa(authUser: AuthUser, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.sub } });
    if (!user.twoFactorSecret) throw new UnauthorizedException('Setup 2FA belum dimulai.');
    if (!authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Kode OTP salah.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });
    return { enabled: true };
  }

  async disable2fa(authUser: AuthUser, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.sub } });
    if (!user.twoFactorSecret || !authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Kode OTP salah.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    return { enabled: false };
  }

  // ── helper ────────────────────────────────────────────
  private toAuthUser(user: {
    id: string;
    tenantId: string;
    role: AuthUser['role'];
    email: string;
  }): AuthUser {
    return { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
  }

  private async issueTokens(user: AuthUser, tenantName: string, plan: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.sub, tenantId: user.tenantId, role: user.role, email: user.email, type: 'access' },
        { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' },
      ),
      this.jwt.signAsync(
        { sub: user.sub, type: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' },
      ),
    ]);

    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.sub } });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.sub,
        tenantId: user.tenantId,
        name: dbUser.name,
        email: user.email,
        role: user.role,
        tenantName,
        plan,
      },
    };
  }
}
