import { describe, expect, it } from 'vitest';
import { INDUSTRY_TEMPLATES } from '../config/industryTemplates';
import { buildAbout, buildGuide, buildHelp, buildTemplates, type InfoDocument } from './info';
import { buildLegalContact } from '../config/legal';

const contact = buildLegalContact({ name: 'PT Contoh', address: 'Bandung', email: 'legal@contoh.id' }, 'sales@contoh.id');
const bare = buildLegalContact({}, 'sales@contoh.id');
const channels = { email: 'sales@contoh.id', whatsappUrl: 'https://wa.me/6281234567890', whatsappLabel: '0812-3456-7890', formUrl: 'https://docs.google.com/forms/d/e/ID/viewform' };

const textOf = (doc: InfoDocument): string =>
  doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.links ?? []).map((l) => l.label)]).join('\n');

const docs: Array<[string, InfoDocument]> = [
  ['Tentang', buildAbout(contact)],
  ['Panduan', buildGuide()],
  ['Template', buildTemplates()],
  ['Bantuan', buildHelp(channels)],
];

describe.each(docs)('halaman %s', (_name, doc) => {
  it('bagian punya id unik, nomor berurutan, dan isi', () => {
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    doc.sections.forEach((s, i) => {
      expect(s.heading.startsWith(`${i + 1}. `)).toBe(true);
      expect((s.paragraphs?.length ?? 0) + (s.bullets?.length ?? 0) + (s.links?.length ?? 0)).toBeGreaterThan(0);
    });
  });

  it('tidak ada sisa penanda draf, nilai kosong, atau klaim fitur yang belum ada', () => {
    expect(textOf(doc)).not.toMatch(/TODO|undefined|null|\{\{|deteksi anomali|fraud|workflow builder|API publik/i);
  });

  it('setiap tautan punya tujuan', () => {
    for (const s of doc.sections) for (const l of s.links ?? []) expect(Boolean(l.to) !== Boolean(l.href)).toBe(true);
  });
});

describe('Tentang', () => {
  it('memakai data landing: jenis usaha, modul, nilai, dan keamanan', () => {
    const text = textOf(buildAbout(bare));
    expect(text).toContain('Toko Retail');
    expect(text).toContain('Keuangan & Akuntansi');
    expect(text).toContain('Satu sumber untuk semua angka');
    expect(text).toMatch(/Akses per peran/);
  });

  it('identitas penyelenggara hanya disebut bila diisi', () => {
    expect(textOf(buildAbout(contact))).toContain('diselenggarakan oleh PT Contoh, Bandung');
    expect(textOf(buildAbout(bare))).not.toContain('diselenggarakan oleh');
  });
});

describe('Template', () => {
  it('memuat semua template pendaftaran dengan modul aslinya', () => {
    const text = textOf(buildTemplates());
    for (const t of INDUSTRY_TEMPLATES) {
      expect(text).toContain(t.title);
      expect(text).toContain(t.desc);
    }
  });
});

describe('Bantuan', () => {
  const links = (c: typeof channels) => buildHelp(c).sections.find((s) => s.id === 'kontak')!.links!.map((l) => l.label);

  it('menampilkan hanya saluran kontak yang tersedia', () => {
    expect(links(channels)).toEqual(['Isi formulir konsultasi', 'WhatsApp 0812-3456-7890', 'sales@contoh.id']);
    expect(links({ ...channels, whatsappUrl: null, formUrl: null })).toEqual(['sales@contoh.id']);
  });

  it('tidak menjanjikan pemulihan kata sandi mandiri yang belum ada', () => {
    expect(textOf(buildHelp(channels))).not.toMatch(/lupa kata sandi|reset (kata )?sandi|kode OTP/i);
  });
});
