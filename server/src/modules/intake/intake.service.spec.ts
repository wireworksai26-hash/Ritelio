import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NimNotConfiguredError } from '../ai/nim.service';
import { IntakeService } from './intake.service';
import type { IntakePayload } from './intake-parse';

const superadmin = { sub: 'u-s', tenantId: 't-p', role: 'superadmin', email: 's@retalio.id' } as never;
const owner = { sub: 'u-o', tenantId: 't-1', role: 'owner', email: 'o@toko.id' } as never;

const payload: IntakePayload = {
  responseId: 'R-1',
  formId: 'F-1',
  submittedAt: new Date('2026-10-24T09:00:00Z'),
  answers: [
    { question: 'Nama Lengkap', answer: 'Budi Santoso' },
    { question: 'Nomor WhatsApp / Handphone Aktif', answer: '0812-3456-7890' },
    { question: 'Jenis Usaha / Industri', answer: 'F&B / Kuliner' },
    { question: 'Total Karyawan', answer: '10 - 50 orang' },
    { question: 'Alamat Email Aktif', answer: 'budi@contoh.id' },
  ],
};

const goodReply = JSON.stringify({
  ringkasan: 'Usaha kuliner skala menengah.',
  kecocokan: 'tinggi',
  alasan: ['Butuh kasir'],
  modulDisarankan: ['Kasir (POS)'],
  paketDisarankan: 'plus_ai',
  informasiKurang: ['Jumlah outlet'],
  catatanSales: [],
});

function make(opts: { complete?: ReturnType<typeof vi.fn> } = {}) {
  const row = { id: 'sub-1', answers: payload.answers };
  const prisma = {
    intakeSubmission: {
      create: vi.fn().mockResolvedValue({ id: 'sub-1' }),
      findUnique: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockImplementation(async ({ data }) => ({ id: 'sub-1', ...data })),
    },
  };
  const nim = { complete: opts.complete ?? vi.fn().mockResolvedValue({ text: goodReply, model: 'm-1' }) };
  return { service: new IntakeService(prisma as never, nim as never), prisma, nim };
}

const settled = () => new Promise((r) => setTimeout(r, 0));

describe('IntakeService.ingest', () => {
  it('menyimpan jawaban lengkap beserta kolom hasil ekstraksi, lalu menganalisis di latar belakang', async () => {
    const { service, prisma, nim } = make();
    const res = await service.ingest(payload);
    expect(res).toEqual({ id: 'sub-1', duplicate: false });
    expect(prisma.intakeSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalId: 'R-1',
        formId: 'F-1',
        contactName: 'Budi Santoso',
        contactPhone: '0812-3456-7890',
        contactEmail: 'budi@contoh.id',
        businessType: 'F&B / Kuliner',
        employeeRange: '10 - 50 orang',
        answers: payload.answers,
      }),
      select: { id: true },
    });
    await vi.waitFor(() => expect(nim.complete).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(prisma.intakeSubmission.update).toHaveBeenCalled());
    expect(prisma.intakeSubmission.update.mock.calls[0][0].data).toMatchObject({ analysisStatus: 'done', analysisModel: 'm-1' });
  });

  it('identitas (nama, WhatsApp, email) tidak ikut dikirim ke model AI', async () => {
    const { service, nim } = make();
    await service.ingest(payload);
    await vi.waitFor(() => expect(nim.complete).toHaveBeenCalled());
    const sent = JSON.stringify(nim.complete.mock.calls[0][0]);
    expect(sent).not.toMatch(/Budi|0812-3456-7890|budi@contoh\.id/);
    expect(sent).toContain('F&B / Kuliner');
  });

  it('pengiriman ulang dengan ID respons yang sama mengembalikan data lama tanpa analisis ulang', async () => {
    const { service, prisma, nim } = make();
    prisma.intakeSubmission.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.intakeSubmission.findUnique.mockResolvedValue({ id: 'sub-lama' });
    expect(await service.ingest(payload)).toEqual({ id: 'sub-lama', duplicate: true });
    await settled();
    expect(nim.complete).not.toHaveBeenCalled();
  });

  it('galat database selain duplikat diteruskan', async () => {
    const { service, prisma } = make();
    prisma.intakeSubmission.create.mockRejectedValue(new Error('db mati'));
    await expect(service.ingest(payload)).rejects.toThrow('db mati');
  });
});

describe('IntakeService analisis: kegagalan tidak menggagalkan penyimpanan', () => {
  const statusOf = async (complete: ReturnType<typeof vi.fn>) => {
    const { service, prisma } = make({ complete });
    await service.ingest(payload);
    await vi.waitFor(() => expect(prisma.intakeSubmission.update).toHaveBeenCalled());
    return prisma.intakeSubmission.update.mock.calls[0][0].data;
  };

  it('NIM_API_KEY belum diisi: status skipped dengan penjelasan', async () => {
    const data = await statusOf(vi.fn().mockRejectedValue(new NimNotConfiguredError()));
    expect(data).toMatchObject({ analysisStatus: 'skipped' });
    expect(data.analysisError).toMatch(/NIM_API_KEY/);
  });

  it('balasan AI tidak bisa dibaca: status failed', async () => {
    const data = await statusOf(vi.fn().mockResolvedValue({ text: 'Maaf, tidak bisa.', model: 'm-1' }));
    expect(data).toMatchObject({ analysisStatus: 'failed', analysisModel: 'm-1' });
    expect(data.analysisError).toMatch(/tidak dapat dibaca/);
  });

  it('model error/timeout: status failed dengan pesan singkat (tanpa isi respons)', async () => {
    const data = await statusOf(vi.fn().mockRejectedValue(new Error('NVIDIA NIM mengembalikan status 503')));
    expect(data).toMatchObject({ analysisStatus: 'failed', analysisError: 'NVIDIA NIM mengembalikan status 503' });
  });
});

describe('IntakeService akses superadmin', () => {
  it.each([
    ['list', (s: IntakeService) => s.list(owner, {})],
    ['get', (s: IntakeService) => s.get(owner, 'sub-1')],
    ['update', (s: IntakeService) => s.update(owner, 'sub-1', { status: 'closed' })],
    ['reanalyze', (s: IntakeService) => s.reanalyze(owner, 'sub-1')],
  ])('%s ditolak untuk owner tenant', async (_name, call) => {
    const { service, prisma } = make();
    await expect(call(service)).rejects.toThrow(ForbiddenException);
    expect(prisma.intakeSubmission.findMany).not.toHaveBeenCalled();
    expect(prisma.intakeSubmission.update).not.toHaveBeenCalled();
  });

  it('list: halaman dan batas dinormalkan, filter status dipakai, daftar tanpa jawaban lengkap', async () => {
    const { service, prisma } = make();
    const res = await service.list(superadmin, { status: 'new', page: 0, limit: 999 });
    expect(res.meta).toEqual({ page: 1, limit: 100, total: 0 });
    const args = prisma.intakeSubmission.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: 'new' });
    expect(args.take).toBe(100);
    expect(args.select.answers).toBeUndefined();
    expect(args.select.analysis).toBe(true);
  });

  it('get: id tidak ada -> 404', async () => {
    const { service, prisma } = make();
    prisma.intakeSubmission.findUnique.mockResolvedValue(null);
    await expect(service.get(superadmin, 'x')).rejects.toThrow(NotFoundException);
  });

  it('update: hanya kolom yang dikirim yang berubah', async () => {
    const { service, prisma } = make();
    await service.update(superadmin, 'sub-1', { status: 'contacted' });
    expect(prisma.intakeSubmission.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'contacted' } });
  });

  it('reanalyze menjalankan analisis lagi dan mengembalikan hasilnya', async () => {
    const { service, nim } = make();
    const res: any = await service.reanalyze(superadmin, 'sub-1');
    expect(nim.complete).toHaveBeenCalledTimes(1);
    expect(res.analysisStatus).toBe('done');
  });
});
