import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { extractKnownFields, isIdentifyingQuestion, parseIntakePayload, type IntakeAnswer } from './intake-parse';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const valid = () => ({
  responseId: 'ABC123',
  formId: 'form-1',
  submittedAt: '2026-10-24T09:00:00.000Z',
  answers: [{ question: 'Nama Lengkap', answer: 'Budi Santoso' }],
});

describe('parseIntakePayload', () => {
  it('menerima isi yang benar dan merapikan spasi', () => {
    const res = parseIntakePayload(
      { ...valid(), answers: [{ question: '  Jenis Usaha ', answer: '  F&B / Kuliner  ' }, { question: 'Solusi', answer: [' A ', 'B'] }] },
      NOW,
    );
    expect(res.responseId).toBe('ABC123');
    expect(res.formId).toBe('form-1');
    expect(res.submittedAt.toISOString()).toBe('2026-10-24T09:00:00.000Z');
    expect(res.answers).toEqual([
      { question: 'Jenis Usaha', answer: 'F&B / Kuliner' },
      { question: 'Solusi', answer: ['A', 'B'] },
    ]);
  });

  it('jawaban kosong atau null dibuang, angka diubah jadi teks', () => {
    const res = parseIntakePayload(
      { ...valid(), answers: [{ question: 'A', answer: '' }, { question: 'B', answer: null }, { question: 'C', answer: [] }, { question: 'D', answer: 12 }] },
      NOW,
    );
    expect(res.answers).toEqual([{ question: 'D', answer: '12' }]);
  });

  it('tanggal kirim kosong memakai sekarang; tanggal di masa depan dipotong ke sekarang', () => {
    expect(parseIntakePayload({ ...valid(), submittedAt: undefined }, NOW).submittedAt).toEqual(NOW);
    expect(parseIntakePayload({ ...valid(), submittedAt: '2027-01-01T00:00:00Z' }, NOW).submittedAt).toEqual(NOW);
  });

  it.each([
    ['bukan objek', 'teks'],
    ['array', []],
    ['tanpa responseId', { ...valid(), responseId: '' }],
    ['responseId bukan teks', { ...valid(), responseId: { a: 1 } }],
    ['answers kosong', { ...valid(), answers: [] }],
    ['answers bukan array', { ...valid(), answers: 'x' }],
    ['tanggal tidak valid', { ...valid(), submittedAt: 'besok' }],
    ['pertanyaan tanpa judul', { ...valid(), answers: [{ question: ' ', answer: 'x' }] }],
    ['jawaban berupa objek', { ...valid(), answers: [{ question: 'Q', answer: { a: 1 } }] }],
    ['semua jawaban kosong', { ...valid(), answers: [{ question: 'Q', answer: '' }] }],
  ])('menolak: %s', (_label, input) => {
    expect(() => parseIntakePayload(input, NOW)).toThrow(BadRequestException);
  });

  it('menolak jumlah dan ukuran yang melewati batas', () => {
    const many = Array.from({ length: 61 }, (_, i) => ({ question: `Q${i}`, answer: 'x' }));
    expect(() => parseIntakePayload({ ...valid(), answers: many }, NOW)).toThrow(/Terlalu banyak/);
    expect(() => parseIntakePayload({ ...valid(), answers: [{ question: 'Q', answer: 'x'.repeat(4001) }] }, NOW)).toThrow(/terlalu panjang/);
    expect(() => parseIntakePayload({ ...valid(), answers: [{ question: 'Q'.repeat(301), answer: 'x' }] }, NOW)).toThrow(/terlalu panjang/);
    expect(() => parseIntakePayload({ ...valid(), answers: [{ question: 'Q', answer: Array(31).fill('x') }] }, NOW)).toThrow(/Pilihan terlalu banyak/);
  });
});

describe('extractKnownFields (judul pertanyaan dari form yang dipakai sekarang)', () => {
  const answers: IntakeAnswer[] = [
    { question: 'Nama Lengkap ', answer: 'Budi Santoso' },
    { question: 'Alamat / Domisili Usaha ', answer: 'Bandung' },
    { question: 'Nomor WhatsApp / Handphone Aktif ', answer: '0812-3456-7890' },
    { question: 'Jenis Usaha / Industri ', answer: 'F&B / Kuliner' },
    { question: 'Total Karyawan ', answer: '10 - 50 orang' },
    { question: 'Rencana Solusi AI yang Diinginkan ', answer: ['Chatbot CS & Layanan Pelanggan 24/7', 'Analitik Data & Prediksi Penjualan'] },
    { question: 'Detail Kebutuhan AI (Opsional) ', answer: 'Ingin laporan otomatis' },
    { question: 'Alamat Email Aktif ', answer: 'budi@contoh.id' },
    { question: 'Preferensi Tanggal Google Meet ', answer: '2026-10-30' },
  ];

  it('memetakan kontak dan usaha dari judul pertanyaan', () => {
    expect(extractKnownFields(answers)).toEqual({
      contactName: 'Budi Santoso',
      contactEmail: 'budi@contoh.id',
      contactPhone: '0812-3456-7890',
      businessType: 'F&B / Kuliner',
      employeeRange: '10 - 50 orang',
    });
  });

  it('"Alamat Email" tidak tertukar dengan alamat usaha, dan nama usaha bukan nama kontak', () => {
    const r = extractKnownFields([
      { question: 'Nama Usaha', answer: 'Kopi Senja' },
      { question: 'Alamat Email Aktif', answer: 'a@b.co' },
    ]);
    expect(r.contactName).toBeNull();
    expect(r.contactEmail).toBe('a@b.co');
  });

  it('email yang bentuknya tidak masuk akal tidak disimpan di kolom email', () => {
    expect(extractKnownFields([{ question: 'Email', answer: 'bukan email' }]).contactEmail).toBeNull();
  });

  it('tanpa pertanyaan yang dikenal semua kolom kosong, dan jawaban pertama yang cocok yang dipakai', () => {
    expect(extractKnownFields([{ question: 'Hobi', answer: 'x' }])).toEqual({
      contactName: null, contactEmail: null, contactPhone: null, businessType: null, employeeRange: null,
    });
    const two = extractKnownFields([
      { question: 'Nomor WhatsApp', answer: '0811' },
      { question: 'Telepon kantor', answer: '021' },
    ]);
    expect(two.contactPhone).toBe('0811');
  });
});

describe('isIdentifyingQuestion', () => {
  it('menandai pertanyaan identitas, bukan pertanyaan bisnis', () => {
    for (const q of ['Nama Lengkap', 'Alamat / Domisili Usaha', 'Nomor WhatsApp / Handphone Aktif', 'Alamat Email Aktif']) {
      expect(isIdentifyingQuestion(q)).toBe(true);
    }
    for (const q of ['Jenis Usaha / Industri', 'Total Karyawan', 'Rencana Solusi AI yang Diinginkan', 'Detail Kebutuhan AI (Opsional)', 'Nama Usaha']) {
      expect(isIdentifyingQuestion(q)).toBe(false);
    }
  });
});
