import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { PrismaService } from '../../common/prisma.service';
import { trialAiQuota, trialEndsAt } from '../../common/config/plans.config';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ensureFiscalCalendar } from '../../common/utils/fiscal-calendar';
import { ensureTenantRoles } from '../../common/rbac/ensure-tenant-roles';
import { AuthThrottleService } from './auth-throttle.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { ReuseDetectedException, RefreshSessionService, type SessionContext } from './refresh-session.service';

// Modul default per template industri (App Flow Â§1)
const TEMPLATE_MODULES: Record<string, string[]> = {
  retail: ['inventory', 'pos', 'finance', 'assistant'],
  manufacturing: ['inventory', 'production', 'finance', 'assistant'],
  services: ['booking', 'pos', 'finance', 'assistant'],
};

// COA minimal untuk jurnal otomatis
const DEFAULT_COA = [
  { code: '1000', name: 'Kas', type: 'asset' as const },
  { code: '1100', name: 'Persediaan', type: 'asset' as const },
  { code: '1200', name: 'Piutang Usaha', type: 'asset' as const },
  { code: '2000', name: 'Hutang Usaha', type: 'liability' as const },
  { code: '2100', name: 'Utang PPN', type: 'liability' as const },
  { code: '2150', name: 'Piutang PPN', type: 'asset' as const },
  { code: '4000', name: 'Pendapatan Usaha', type: 'revenue' as const },
  { code: '5000', name: 'Harga Pokok Penjualan', type: 'expense' as const },
  { code: '6100', name: 'Beban Operasional', type: 'expense' as const },
  { code: '6110', name: 'Beban PPN Masukan', type: 'expense' as const },
];

const BASE_CURRENCY = {
  code: 'IDR',
  name: 'Indonesian Rupiah',
  symbol: 'Rp',
  decimalPlaces: 0,
} as const;

const BCRYPT_ROUNDS = 12;

// Hash bcrypt atas kata sandi tetap. Login tetap membandingkan terhadap hash ini
// ketika email tidak ditemukan sehingga waktu respons seragam â€” tanpa itu, enumerasi
// akun lewat timing tetap mungkin.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.eSMWCG2mfGBY1j0hOW9C0lZ1nAmBqii';

/** Hash bcrypt valid ($2a/$2b/$2y, 60 karakter). Penanda seperti '!pending-invite' bukan hash. */
export function isUsablePasswordHash(hash: string | null | undefined): hash is string {
  return typeof hash === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

// Tolak OTP dalam radius waktu default otplib (membuat tebakan 6 digit 3x lebih lambat).
authenticator.options = { window: 0 } as typeof authenticator.options;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly sessions: RefreshSessionService,
    private readonly throttle: AuthThrottleService,
  ) {}

  /**
   * Peristiwa auth dicatat langsung, bukan lewat interceptor: route-nya @Public()
   * sehingga tidak punya req.user, dan login gagal tidak boleh membocorkan
   * email ke audit — yang disimpan hanya status dan alasan generik.
   */
  private async auditAuth(
    tenantId: string,
    action: string,
    outcome: 'success' | 'failure',
    userId: string | null,
    reason?: string,
  ): Promise<void> {
    await this.audit
      .record({
        tenantId,
        userId,
        action,
        entity: 'auth',
        entityId: userId,
        outcome,
        reason: reason ?? null,
      })
      .catch(() => undefined);
  }

  // Registrasi tenant baru + owner + modul default + COA. Trial +AI 14 hari.
  async register(dto: RegisterDto, ctx: SessionContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing) throw new ConflictException('Email sudah terdaftar. Silakan login.');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const trialEnds = trialEndsAt();

    const tenant = await this.prisma.$transaction(async (tx) => {
      await tx.currency.upsert({
        where: { code: BASE_CURRENCY.code },
        update: {},
        create: BASE_CURRENCY,
      });

      const t = await tx.tenant.create({
        data: {
          name: dto.businessName,
          industryTemplate: dto.industryTemplate,
          subscriptionPlan: 'plus_ai', // trial; lama dan kuota AI dari plans.config (TRIAL_DAYS, TRIAL_AI_QUOTA)
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: t.id,
          code: 'MAIN',
          name: dto.businessName,
          legalName: dto.businessName,
          defaultCurrencyCode: BASE_CURRENCY.code,
        },
      });
      await ensureFiscalCalendar(tx, t.id, company.id, new Date().getUTCFullYear());
      const roleIds = await ensureTenantRoles(tx, t.id);

      await tx.subscription.create({
        data: {
          tenantId: t.id,
          plan: 'plus_ai',
          status: 'trialing',
          aiQuota: trialAiQuota(),
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
        await tx.chartOfAccount.create({
          data: { tenantId: t.id, companyId: company.id, ...acc },
        });
      }

      await tx.user.create({
        data: {
          tenantId: t.id,
          name: dto.ownerName,
          email,
          passwordHash,
          role: 'owner',
          roleId: roleIds.owner,
        },
      });

      return t;
    });

    const user = await this.prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, email },
    });
    await this.auditAuth(tenant.id, 'register', 'success', user.id);
    return this.issueTokens(this.toAuthUser(user), tenant.name, tenant.subscriptionPlan, user.name, {
      mfaVerified: false,
      ctx,
    });
  }

  async login(dto: LoginDto, ctx: SessionContext = {}) {
    const clean = dto.email.trim().toLowerCase();
    // Kunci throttle tidak bergantung pada ada/tidaknya akun: email tak terdaftar
    // dan salah kata sandi menghasilkan respons 401 dan lock 429 yang identik.
    const throttleKeys = this.throttle.loginKeys(clean, ctx.ip);
    await this.throttle.assertNotLocked(throttleKeys);

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

    // Bandingkan terhadap hash tetap bila user tidak ada agar waktu respons sama.
    // Akun tanpa hash valid (undangan tertunda, '!pending-invite') tidak pernah bisa login.
    const candidateHash = user?.passwordHash;
    const usableHash = isUsablePasswordHash(candidateHash) ? candidateHash : DUMMY_HASH;
    const ok = (await bcrypt.compare(dto.password, usableHash)) && usableHash !== DUMMY_HASH;
    if (!user || !user.isActive || !ok) {
      await this.throttle.recordFailure(throttleKeys);
      await this.auditAuth(user?.tenantId ?? 'unknown', 'login', 'failure', user?.id ?? null, 'kredensial salah');
      throw new UnauthorizedException('Email/username atau kata sandi salah.');
    }

    // Subscription ended: stop refresh sesi, tapi tetap izinkan akses read-only
    // agar pengguna bisa melihat billing di akunnya.
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
    });
    if (
      subscription?.status === 'trialing' &&
      subscription.endsAt &&
      subscription.endsAt.getTime() < Date.now()
    ) {
      throw new ForbiddenException('Masa trial akun Anda sudah berakhir. Perpanjang langganan untuk melanjutkan.');
    }

    // 2FA wajib untuk owner/admin yang sudah mengaktifkannya (TRD Â§keamanan)
    if (user.twoFactorEnabled && (user.role === 'owner' || user.role === 'admin')) {
      if (!dto.otp) {
        throw new UnauthorizedException('Kode OTP 2FA diperlukan.');
      }
      const valid = authenticator.check(dto.otp, user.twoFactorSecret ?? '');
      if (!valid) {
        await this.throttle.recordFailure(throttleKeys);
        await this.auditAuth(user.tenantId, 'login', 'failure', user.id, 'OTP 2FA salah');
        throw new UnauthorizedException('Kode OTP salah atau kedaluwarsa.');
      }
    }

    await this.throttle.recordSuccess(throttleKeys);
    await this.auditAuth(user.tenantId, 'login', 'success', user.id);

    return this.issueTokens(
      this.toAuthUser(user),
      user.tenant?.name || 'Retalio Platform',
      user.tenant?.subscriptionPlan || 'custom',
      user.name,
      { mfaVerified: user.twoFactorEnabled, ctx },
    );
  }

  async refresh(dto: RefreshDto, ctx: SessionContext = {}) {
    let session;
    try {
      session = await this.sessions.findUsable(dto.refreshToken);
    } catch (err) {
      if (err instanceof ReuseDetectedException) {
        await this.auditAuth(
          err.session.tenantId,
          'refresh_reuse',
          'failure',
          err.session.userId,
          'refresh token dipakai ulang; sesi dicabut',
        );
      }
      throw err;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: session.userId, tenantId: session.tenantId },
      include: { tenant: true },
    });
    if (!user || !user.isActive || !user.tenant) {
      await this.sessions.revokeFamily(session.familyId, 'user_inactive');
      throw new UnauthorizedException('Refresh token tidak valid. Silakan login ulang.');
    }

    // Refresh harus melewati kontrol yang sama seperti login. Sesi owner/admin dengan
    // 2FA hanya boleh diperpanjang bila sesinya dibuka dengan OTP (mfaVerified).
    const needsMfa = user.twoFactorEnabled && (user.role === 'owner' || user.role === 'admin');
    if (needsMfa && !session.mfaVerified) {
      await this.sessions.revokeFamily(session.familyId, 'mfa_required');
      throw new UnauthorizedException('Sesi 2FA telah berakhir. Silakan login ulang.');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
    });
    if (
      subscription?.status === 'trialing' &&
      subscription.endsAt &&
      subscription.endsAt.getTime() < Date.now()
    ) {
      throw new ForbiddenException('Masa trial akun Anda sudah berakhir. Perpanjang langganan untuk melanjutkan.');
    }

    const refreshToken = await this.sessions.rotate(session, session.mfaVerified, ctx);
    await this.auditAuth(user.tenantId, 'refresh', 'success', user.id);

    return this.buildTokens(
      this.toAuthUser(user),
      user.tenant.name,
      user.tenant.subscriptionPlan,
      user.name,
      refreshToken,
      session.familyId,
    );
  }

  /** Cabut sesi dari refresh token. Selalu sukses agar token tak dikenal tidak bisa ditebak. */
  async logout(refreshToken: string): Promise<{ ok: true }> {
    const owner = await this.sessions.revokeByToken(refreshToken);
    if (owner) await this.auditAuth(owner.tenantId, 'logout', 'success', owner.userId);
    return { ok: true };
  }

  /** Cabut semua sesi user, termasuk access token yang masih berlaku. */
  async logoutAll(authUser: AuthUser): Promise<{ ok: true; revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(authUser.sub, 'logout_all');
    await this.auditAuth(authUser.tenantId, 'logout_all', 'success', authUser.sub);
    return { ok: true, revoked };
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

  // â”€â”€ 2FA TOTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Semua mutasi 2FA memerlukan step-up auth: kata sandi saat ini (membuktikan
  // kepemilikan akun) dan OTP dari secret yang sudah terpasang (jika ada).
  async setup2fa(authUser: AuthUser, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.sub } });
    await this.assertStepUp(user.passwordHash, password);

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: authUser.sub },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    await this.auditAuth(authUser.tenantId, '2fa_setup', 'success', authUser.sub);
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, 'Retalio', secret),
      note: 'Pindai URL ini di aplikasi authenticator, lalu aktifkan dengan kode 6 digit.',
    };
  }

  async enable2fa(authUser: AuthUser, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.sub } });
    if (!user.twoFactorSecret) throw new UnauthorizedException('Setup 2FA belum dimulai.');
    await this.assertStepUp(user.passwordHash, password);
    if (!authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Kode OTP salah.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });
    // Sesi yang dibuka sebelum 2FA aktif tidak boleh diperpanjang tanpa login ulang dengan OTP.
    await this.sessions.downgradeMfa(user.id);
    await this.auditAuth(authUser.tenantId, '2fa_enable', 'success', authUser.sub);
    return { enabled: true };
  }

  async disable2fa(authUser: AuthUser, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.sub } });
    if (!user.twoFactorSecret) throw new UnauthorizedException('2FA tidak aktif pada akun ini.');
    await this.assertStepUp(user.passwordHash, password);
    if (!authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Kode OTP salah.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.auditAuth(authUser.tenantId, '2fa_disable', 'success', authUser.sub);
    return { enabled: false };
  }

  // â”€â”€ helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** Step-up auth: kata sandi saat ini wajib sebelum 2FA boleh diubah. */
  private async assertStepUp(passwordHash: string, password: string) {
    const ok = await bcrypt.compare(password, passwordHash ?? DUMMY_HASH);
    if (!ok) {
      throw new UnauthorizedException('Verifikasi gagal. Periksa kata sandi Anda.');
    }
  }

  private toAuthUser(user: {
    id: string;
    tenantId: string;
    role: AuthUser['role'];
    email: string;
  }): AuthUser {
    return { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
  }

  private async issueTokens(
    user: AuthUser,
    tenantName: string,
    plan: string,
    displayName: string,
    session: { mfaVerified: boolean; ctx?: SessionContext },
  ) {
    const started = await this.sessions.start({
      tenantId: user.tenantId,
      userId: user.sub,
      mfaVerified: session.mfaVerified,
      ctx: session.ctx,
    });
    return this.buildTokens(user, tenantName, plan, displayName, started.token, started.familyId);
  }

  private async buildTokens(
    user: AuthUser,
    tenantName: string,
    plan: string,
    displayName: string,
    refreshToken: string,
    familyId: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.sub,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
        sid: familyId,
        type: 'access',
      },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.sub,
        tenantId: user.tenantId,
        name: displayName,
        email: user.email,
        role: user.role,
        tenantName,
        plan,
      },
    };
  }
}
