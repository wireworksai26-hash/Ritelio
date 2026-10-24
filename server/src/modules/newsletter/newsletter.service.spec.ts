import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { SubscribeDto } from './dto/newsletter.dto';
import { EXPORT_LIMIT, NewsletterService } from './newsletter.service';

const superadmin = { sub: 'u-s', tenantId: 't-p', role: 'superadmin', email: 's@retalio.id' } as never;
const owner = { sub: 'u-o', tenantId: 't-1', role: 'owner', email: 'o@toko.id' } as never;

function make(existing: { id: string; status: string } | null = null) {
  const prisma = {
    newsletterSubscriber: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 'n-1' }),
      update: vi.fn().mockResolvedValue({ id: 'n-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'n-1' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };
  return { service: new NewsletterService(prisma as never), db: prisma.newsletterSubscriber };
}

describe('NewsletterService.subscribe', () => {
  it('alamat baru dicatat sebagai pending dengan waktu persetujuan', async () => {
    const { service, db } = make(null);
    await service.subscribe('budi@contoh.id');
    expect(db.create).toHaveBeenCalledWith({ data: { email: 'budi@contoh.id', consentAt: expect.any(Date) } });
  });

  it('alamat yang sudah pending atau confirmed dibiarkan, tanpa menulis apa pun', async () => {
    for (const status of ['pending', 'confirmed']) {
      const { service, db } = make({ id: 'n-1', status });
      await service.subscribe('budi@contoh.id');
      expect(db.create).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    }
  });

  it('alamat yang pernah berhenti dicatat ulang sebagai pending dengan persetujuan baru', async () => {
    const { service, db } = make({ id: 'n-1', status: 'unsubscribed' });
    await service.subscribe('budi@contoh.id');
    expect(db.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'pending', consentAt: expect.any(Date), confirmedAt: null, unsubscribedAt: null },
    });
  });

  it('kolom jebakan terisi (bot): tidak membaca dan tidak menyimpan apa pun', async () => {
    const { service, db } = make(null);
    await service.subscribe('bot@contoh.id', 'http://spam.example');
    expect(db.findUnique).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
  });

  it('kolom jebakan berisi spasi saja dianggap kosong', async () => {
    const { service, db } = make(null);
    await service.subscribe('budi@contoh.id', '   ');
    expect(db.create).toHaveBeenCalled();
  });

  it('dua permintaan bersamaan untuk alamat yang sama: yang kalah balapan tidak menimbulkan galat', async () => {
    const { service, db } = make(null);
    db.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(service.subscribe('budi@contoh.id')).resolves.toBeUndefined();
  });

  it('galat database lain tidak ditelan', async () => {
    const { service, db } = make(null);
    db.create.mockRejectedValue(new Error('db down'));
    await expect(service.subscribe('budi@contoh.id')).rejects.toThrow('db down');
  });
});

describe('SubscribeDto', () => {
  const check = async (input: Record<string, unknown>) => validate(plainToInstance(SubscribeDto, input));

  it('menerima email biasa dan merapikannya menjadi huruf kecil tanpa spasi', async () => {
    const dto = plainToInstance(SubscribeDto, { email: '  Budi@Contoh.ID ' });
    expect(dto.email).toBe('budi@contoh.id');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('menolak email yang tidak valid, kosong, atau terlalu panjang', async () => {
    for (const email of ['bukan-email', '', 'a@', '@b.co', 'a b@c.co', `${'a'.repeat(250)}@x.co`, 123, null, undefined]) {
      expect((await check({ email })).length).toBeGreaterThan(0);
    }
  });

  it('kolom jebakan opsional tetapi dibatasi panjangnya', async () => {
    expect(await check({ email: 'a@b.co' })).toHaveLength(0);
    expect(await check({ email: 'a@b.co', website: '' })).toHaveLength(0);
    expect((await check({ email: 'a@b.co', website: 'x'.repeat(201) })).length).toBeGreaterThan(0);
  });
});

describe('NewsletterService akses superadmin', () => {
  it('owner tenant biasa ditolak untuk daftar, ekspor, berhenti, dan hapus', async () => {
    const { service, db } = make({ id: 'n-1', status: 'pending' });
    await expect(service.list(owner, {})).rejects.toThrow(ForbiddenException);
    await expect(service.exportAll(owner)).rejects.toThrow(ForbiddenException);
    await expect(service.unsubscribe(owner, 'n-1')).rejects.toThrow(ForbiddenException);
    await expect(service.remove(owner, 'n-1')).rejects.toThrow(ForbiddenException);
    expect(db.findMany).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('daftar: filter status dan pencarian email, hitungan per status, dan batas halaman', async () => {
    const { service, db } = make();
    db.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 5 } },
      { status: 'confirmed', _count: { _all: 2 } },
    ]);
    db.count.mockResolvedValue(5);
    const res = await service.list(superadmin, { status: 'pending', q: ' budi ', page: 2, limit: 500 });
    const args = db.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: 'pending', email: { contains: 'budi', mode: 'insensitive' } });
    expect(args.skip).toBe(100);
    expect(args.take).toBe(100);
    expect(res.meta.counts).toEqual({ pending: 5, confirmed: 2, unsubscribed: 0, all: 7 });
    expect(res.meta.total).toBe(5);
  });

  it('ekspor dibatasi jumlah barisnya', async () => {
    const { service, db } = make();
    await service.exportAll(superadmin);
    expect(db.findMany.mock.calls[0][0].take).toBe(EXPORT_LIMIT);
  });

  it('berhenti: hanya mengubah status ke unsubscribed dan mengembalikan id saja (tanpa email)', async () => {
    const { service, db } = make({ id: 'n-1', status: 'pending' });
    const res = await service.unsubscribe(superadmin, 'n-1');
    expect(res).toEqual({ id: 'n-1' });
    expect(db.update).toHaveBeenCalledWith({ where: { id: 'n-1' }, data: { status: 'unsubscribed', unsubscribedAt: expect.any(Date) } });
  });

  it('hapus permanen mengembalikan id saja; id tidak dikenal: 404', async () => {
    const { service, db } = make({ id: 'n-1', status: 'pending' });
    expect(await service.remove(superadmin, 'n-1')).toEqual({ id: 'n-1' });
    expect(db.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
    db.findUnique.mockResolvedValue(null);
    await expect(service.remove(superadmin, 'x')).rejects.toThrow(NotFoundException);
    await expect(service.unsubscribe(superadmin, 'x')).rejects.toThrow(NotFoundException);
  });
});
