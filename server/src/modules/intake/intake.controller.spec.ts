import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeWebhookSignature } from '../operations/carrier-webhook';
import { IntakeController } from './intake.controller';

const SECRET = 's'.repeat(40);
const now = () => Math.floor(Date.now() / 1000);
const body = () => ({
  responseId: 'R-1',
  formId: 'F-1',
  submittedAt: new Date().toISOString(),
  answers: [{ question: 'Jenis Usaha / Industri', answer: 'F&B / Kuliner' }],
});

function setup() {
  const intake = { ingest: vi.fn().mockResolvedValue({ id: 'sub-1', duplicate: false }) };
  return { controller: new IntakeController(intake as never), intake };
}

describe('IntakeController.receive (webhook Google Form)', () => {
  const original = process.env.INTAKE_WEBHOOK_SECRET;
  beforeEach(() => {
    process.env.INTAKE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.INTAKE_WEBHOOK_SECRET;
    else process.env.INTAKE_WEBHOOK_SECRET = original;
  });

  it('tanda tangan benar: disimpan dan dijawab ok', async () => {
    const { controller, intake } = setup();
    const b = body();
    const ts = now();
    const res = await controller.receive(b, computeWebhookSignature(SECRET, ts, b), String(ts));
    expect(res).toEqual({ ok: true, id: 'sub-1', duplicate: false });
    expect(intake.ingest).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'R-1' }));
  });

  it('rahasia belum dikonfigurasi di server: 503, tidak ada yang disimpan', async () => {
    delete process.env.INTAKE_WEBHOOK_SECRET;
    const { controller, intake } = setup();
    const b = body();
    const ts = now();
    await expect(controller.receive(b, computeWebhookSignature(SECRET, ts, b), String(ts))).rejects.toThrow(ServiceUnavailableException);
    expect(intake.ingest).not.toHaveBeenCalled();
  });

  it('tanda tangan salah (rahasia lain, atau isi diubah): ditolak', async () => {
    const { controller, intake } = setup();
    const b = body();
    const ts = now();
    await expect(controller.receive(b, computeWebhookSignature('x'.repeat(40), ts, b), String(ts))).rejects.toThrow(/Signature/);
    const tampered = { ...b, answers: [{ question: 'Jenis Usaha / Industri', answer: 'Disusupi' }] };
    await expect(controller.receive(tampered, computeWebhookSignature(SECRET, ts, b), String(ts))).rejects.toThrow(/Signature/);
    expect(intake.ingest).not.toHaveBeenCalled();
  });

  it('tanpa tanda tangan atau tanpa waktu: ditolak', async () => {
    const { controller, intake } = setup();
    const b = body();
    await expect(controller.receive(b, undefined, String(now()))).rejects.toThrow(BadRequestException);
    await expect(controller.receive(b, computeWebhookSignature(SECRET, now(), b), undefined)).rejects.toThrow(/Timestamp/);
    expect(intake.ingest).not.toHaveBeenCalled();
  });

  it('waktu kedaluwarsa (kiriman lama dipakai ulang) ditolak walau tanda tangannya cocok', async () => {
    const { controller, intake } = setup();
    const b = body();
    const old = now() - 3600;
    await expect(controller.receive(b, computeWebhookSignature(SECRET, old, b), String(old))).rejects.toThrow(/kedaluwarsa/);
    expect(intake.ingest).not.toHaveBeenCalled();
  });

  it('isi tidak valid walau tanda tangan benar: ditolak sebelum disimpan', async () => {
    const { controller, intake } = setup();
    const b = { responseId: '', answers: [] };
    const ts = now();
    await expect(controller.receive(b, computeWebhookSignature(SECRET, ts, b), String(ts))).rejects.toThrow(BadRequestException);
    expect(intake.ingest).not.toHaveBeenCalled();
  });

  it('pengiriman ulang melaporkan duplicate:true', async () => {
    const { controller, intake } = setup();
    intake.ingest.mockResolvedValue({ id: 'sub-lama', duplicate: true });
    const b = body();
    const ts = now();
    expect(await controller.receive(b, computeWebhookSignature(SECRET, ts, b), String(ts))).toEqual({ ok: true, id: 'sub-lama', duplicate: true });
  });
});
