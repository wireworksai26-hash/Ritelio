import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingService } from './onboarding.service';
import type { IntakePayload } from './intake-parse';

const superadmin = { sub: 'u-s', tenantId: 't-p', role: 'superadmin', email: 's@retalio.id' } as never;
const owner = { sub: 'u-o', tenantId: 't-1', role: 'owner', email: 'o@toko.id' } as never;

const payload: IntakePayload = {
  responseId: 'O-1',
  formId: 'F-2',
  submittedAt: new Date('2026-10-24T09:00:00Z'),
  answers: [
    { question: 'Nama Lengkap', answer: 'Budi Santoso' },
    { question: 'Email Akun Retalio', answer: 'Owner@Toko.id' },
    { question: 'Nomor WhatsApp Aktif', answer: '0812-3456-7890' },
    { question: 'Daftar Produk dan Harga', answer: 'Kopi susu | 18000' },
  ],
};

function make(users: Array<{ tenantId: string }> = [{ tenantId: 't-1' }]) {
  const prisma = {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    tenant: { findMany: vi.fn().mockResolvedValue([{ id: 't-1', name: 'Toko Budi' }]) },
    onboardingSubmission: {
      create: vi.fn().mockResolvedValue({ id: 'onb-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'onb-1', tenantId: 't-1', answers: payload.answers }),
      findMany: vi.fn().mockResolvedValue([{ id: 'onb-1', tenantId: 't-1' }, { id: 'onb-2', tenantId: null }]),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'onb-1', ...data })),
    },
  };
  return { service: new OnboardingService(prisma as never), prisma };
}

describe('OnboardingService.ingest', () => {
  it('menyimpan jawaban apa adanya dengan kolom kontak dan petunjuk tenant dari email akun', async () => {
    const { service, prisma } = make();
    expect(await service.ingest(payload)).toEqual({ id: 'onb-1', duplicate: false });
    expect(prisma.onboardingSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalId: 'O-1',
        formId: 'F-2',
        contactName: 'Budi Santoso',
        contactEmail: 'Owner@Toko.id',
        contactPhone: '0812-3456-7890',
        tenantId: 't-1',
        answers: payload.answers,
      }),
      select: { id: true },
    });
  });

  it('mencocokkan email tanpa membedakan huruf besar-kecil dan tidak pernah mencocokkan akun superadmin', async () => {
    const { service, prisma } = make();
    await service.ingest(payload);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'Owner@Toko.id', mode: 'insensitive' }, role: { not: 'superadmin' } } }),
    );
  });

  it('email yang cocok dengan lebih dari satu tenant: tenant tidak ditebak', async () => {
    const { service, prisma } = make([{ tenantId: 't-1' }, { tenantId: 't-2' }]);
    await service.ingest(payload);
    expect(prisma.onboardingSubmission.create.mock.calls[0][0].data.tenantId).toBeNull();
  });

  it('email tidak cocok atau tidak diisi: tenant kosong dan tidak ada pencarian akun bila email kosong', async () => {
    const none = make([]);
    await none.service.ingest(payload);
    expect(none.prisma.onboardingSubmission.create.mock.calls[0][0].data.tenantId).toBeNull();

    const noEmail = make();
    await noEmail.service.ingest({ ...payload, answers: [{ question: 'Nama Lengkap', answer: 'Budi' }] });
    expect(noEmail.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('kiriman ulang (ID respons sama) mengembalikan baris lama sebagai duplikat', async () => {
    const { service, prisma } = make();
    prisma.onboardingSubmission.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.onboardingSubmission.findUnique.mockResolvedValue({ id: 'onb-lama' });
    expect(await service.ingest(payload)).toEqual({ id: 'onb-lama', duplicate: true });
  });

  it('galat database lain tidak ditelan', async () => {
    const { service, prisma } = make();
    prisma.onboardingSubmission.create.mockRejectedValue(new Error('db down'));
    await expect(service.ingest(payload)).rejects.toThrow('db down');
  });
});

describe('OnboardingService akses superadmin', () => {
  it('owner tenant biasa ditolak untuk daftar, detail, dan ubah', async () => {
    const { service, prisma } = make();
    await expect(service.list(owner, {})).rejects.toThrow(ForbiddenException);
    await expect(service.get(owner, 'onb-1')).rejects.toThrow(ForbiddenException);
    await expect(service.update(owner, 'onb-1', { status: 'done' })).rejects.toThrow(ForbiddenException);
    expect(prisma.onboardingSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.onboardingSubmission.update).not.toHaveBeenCalled();
  });

  it('daftar: filter status, tanpa jawaban lengkap, dengan nama tenant lewat satu query', async () => {
    const { service, prisma } = make();
    const res = await service.list(superadmin, { status: 'new', page: 2, limit: 10 });
    const args = prisma.onboardingSubmission.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: 'new' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.select.answers).toBeUndefined();
    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(res.data.map((r) => r.tenantName)).toEqual(['Toko Budi', null]);
    expect(res.meta).toEqual({ page: 2, limit: 10, total: 2 });
  });

  it('detail membawa jawaban dan nama tenant; id tidak dikenal: 404', async () => {
    const { service, prisma } = make();
    expect(await service.get(superadmin, 'onb-1')).toEqual(expect.objectContaining({ tenantName: 'Toko Budi', answers: payload.answers }));
    prisma.onboardingSubmission.findUnique.mockResolvedValue(null);
    await expect(service.get(superadmin, 'x')).rejects.toThrow(NotFoundException);
  });

  it('ubah hanya status dan catatan yang dikirim', async () => {
    const { service, prisma } = make();
    await service.update(superadmin, 'onb-1', { status: 'in_progress' });
    expect(prisma.onboardingSubmission.update).toHaveBeenCalledWith({ where: { id: 'onb-1' }, data: { status: 'in_progress' } });
  });
});
