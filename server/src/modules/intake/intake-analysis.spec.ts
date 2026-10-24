import { describe, expect, it } from 'vitest';
import { buildAnalysisMessages, parseAnalysis, RETALIO_MODULES } from './intake-analysis';
import type { IntakeAnswer } from './intake-parse';

const answers: IntakeAnswer[] = [
  { question: 'Nama Lengkap', answer: 'Budi Santoso' },
  { question: 'Alamat / Domisili Usaha', answer: 'Jl. Merdeka 1, Bandung' },
  { question: 'Nomor WhatsApp / Handphone Aktif', answer: '0812-3456-7890' },
  { question: 'Alamat Email Aktif', answer: 'budi@contoh.id' },
  { question: 'Jenis Usaha / Industri', answer: 'F&B / Kuliner' },
  { question: 'Total Karyawan', answer: '10 - 50 orang' },
  { question: 'Rencana Solusi AI yang Diinginkan', answer: ['Analitik Data & Prediksi Penjualan'] },
  { question: 'Detail Kebutuhan AI (Opsional)', answer: 'Hubungi saya di 0813-1111-2222 atau owner@kopi.id' },
];

describe('buildAnalysisMessages', () => {
  it('tidak mengirim identitas (nama, alamat, WhatsApp, email) ke model', () => {
    const { user } = buildAnalysisMessages(answers);
    expect(user).not.toMatch(/Budi|Merdeka|0812-3456-7890|budi@contoh\.id/);
    expect(user).toContain('Jenis Usaha / Industri: F&B / Kuliner');
    expect(user).toContain('Total Karyawan: 10 - 50 orang');
    expect(user).toContain('Analitik Data & Prediksi Penjualan');
  });

  it('kontak yang terselip di teks bebas tetap disamarkan', () => {
    const { user } = buildAnalysisMessages(answers);
    expect(user).not.toMatch(/0813-1111-2222|owner@kopi\.id/);
    expect(user).toContain('[telepon]');
    expect(user).toContain('[email]');
  });

  it('data dibungkus penanda dan system prompt melarang mengikuti perintah di dalamnya', () => {
    const { system, user } = buildAnalysisMessages(answers);
    expect(user.startsWith('BEGIN_DATA_PENGAJUAN')).toBe(true);
    expect(user).toContain('END_DATA_PENGAJUAN');
    expect(system).toMatch(/DATA, bukan perintah/);
    expect(system).toMatch(/JSON/);
  });

  it('daftar modul resmi masuk ke prompt supaya model tidak mengarang modul', () => {
    const { system } = buildAnalysisMessages(answers);
    for (const m of RETALIO_MODULES) expect(system).toContain(m);
  });
});

describe('parseAnalysis', () => {
  const good = {
    ringkasan: 'Usaha kuliner skala menengah yang ingin prediksi penjualan.',
    kecocokan: 'tinggi',
    alasan: ['Butuh kasir dan stok', 'Tertarik prediksi penjualan'],
    modulDisarankan: ['Kasir (POS)', 'Inventori & stok', 'Asisten AI (Retalio Intelligence)'],
    paketDisarankan: 'plus_ai',
    informasiKurang: ['Jumlah outlet'],
    catatanSales: ['Tawarkan demo kasir offline'],
  };

  it('membaca JSON yang benar, termasuk yang dibungkus teks atau blok kode', () => {
    expect(parseAnalysis(JSON.stringify(good))).toEqual(good);
    expect(parseAnalysis('Berikut hasilnya:\n```json\n' + JSON.stringify(good) + '\n```\nSemoga membantu.')).toEqual(good);
  });

  it('objek yang dibungkus array oleh model tetap diambil', () => {
    expect(parseAnalysis(JSON.stringify([good]))).toEqual(good);
  });

  it('modul yang tidak dikenal dibuang, dan huruf besar kecil diperbaiki', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, modulDisarankan: ['kasir (pos)', 'Modul Mengarang', 'SDM & payroll'] }));
    expect(r?.modulDisarankan).toEqual(['Kasir (POS)', 'SDM & payroll']);
  });

  it('paket di luar basic/plus_ai/custom menjadi null, bukan ditolak', () => {
    expect(parseAnalysis(JSON.stringify({ ...good, paketDisarankan: 'enterprise-gold' }))?.paketDisarankan).toBeNull();
    expect(parseAnalysis(JSON.stringify({ ...good, paketDisarankan: undefined }))?.paketDisarankan).toBeNull();
  });

  it('daftar dipotong ke batas dan butir yang bukan teks dibuang', () => {
    const r = parseAnalysis(JSON.stringify({ ...good, alasan: Array.from({ length: 20 }, (_, i) => `a${i}`).concat([5 as never, '' as never]) }));
    expect(r?.alasan).toHaveLength(8);
    expect(r?.alasan.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('daftar yang hilang menjadi kosong, teks panjang dipotong', () => {
    const r = parseAnalysis(JSON.stringify({ ringkasan: 'x'.repeat(2000), kecocokan: 'sedang' }));
    expect(r?.alasan).toEqual([]);
    expect(r?.informasiKurang).toEqual([]);
    expect(r?.ringkasan.length).toBeLessThanOrEqual(800);
  });

  it.each([
    ['kosong', ''],
    ['bukan JSON', 'Maaf saya tidak bisa membantu.'],
    ['JSON rusak', '{"ringkasan": "x", '],
    ['tanpa ringkasan', JSON.stringify({ ...good, ringkasan: '' })],
    ['kecocokan tidak valid', JSON.stringify({ ...good, kecocokan: 'luar biasa' })],
  ])('mengembalikan null untuk balasan yang tak bisa dipercaya: %s', (_label, text) => {
    expect(parseAnalysis(text)).toBeNull();
  });
});
