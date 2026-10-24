import { describe, expect, it } from 'vitest';
import { buildLegalContact } from '../config/legal';
import { buildPrivacy, buildTerms, LEGAL_EFFECTIVE_DATE, type LegalDocument } from './legal';

const contact = buildLegalContact({ name: 'PT Contoh Retalio', address: 'Jl. Merdeka 1, Bandung', email: 'legal@contoh.id' }, 'sales@contoh.id');
const bare = buildLegalContact({}, 'sales@contoh.id');

const textOf = (doc: LegalDocument): string =>
  doc.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])]).join('\n');

describe('buildLegalContact', () => {
  it('membuang spasi dan memakai email cadangan bila email hukum kosong', () => {
    expect(buildLegalContact({ name: '  PT A  ', address: ' ', email: '' }, 'sales@x.id')).toEqual({ companyName: 'PT A', companyAddress: '', email: 'sales@x.id' });
    expect(buildLegalContact({ email: ' legal@x.id ' }, 'sales@x.id').email).toBe('legal@x.id');
  });
});

describe.each([
  ['Syarat & Ketentuan', buildTerms],
  ['Kebijakan Privasi', buildPrivacy],
])('%s', (_name, build) => {
  it('bagian punya id unik dan isi, dan nomor judul berurutan', () => {
    const doc = build(contact);
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    doc.sections.forEach((s, i) => {
      expect(s.heading.startsWith(`${i + 1}. `)).toBe(true);
      expect((s.paragraphs?.length ?? 0) + (s.bullets?.length ?? 0)).toBeGreaterThan(0);
    });
  });

  it('tidak mengandung sisa penanda draf atau nilai kosong', () => {
    for (const c of [contact, bare]) {
      const text = textOf(build(c));
      expect(text).not.toMatch(/TODO|\[isi|\[nama|undefined|null|\{\{/i);
    }
  });

  it('menampilkan email kontak dan tanggal berlaku', () => {
    expect(textOf(build(contact))).toContain('legal@contoh.id');
    expect(textOf(build(bare))).toContain('sales@contoh.id');
    expect(textOf(build(contact))).toContain(LEGAL_EFFECTIVE_DATE);
  });

  it('identitas penyelenggara hanya disebut bila diisi', () => {
    expect(textOf(build(contact))).toContain('PT Contoh Retalio, beralamat di Jl. Merdeka 1, Bandung');
    const text = textOf(build(bare));
    expect(text).toContain('diselenggarakan oleh tim Retalio');
    expect(text).not.toContain('beralamat');
  });
});

describe('isi naskah mengikuti perilaku aplikasi', () => {
  it('S&K menyebut akun tidak dihapus tetapi baca saja setelah langganan berakhir, dan revisi lewat chat sales', () => {
    const text = textOf(buildTerms(contact));
    expect(text).toMatch(/tidak dihapus/);
    expect(text).toMatch(/mode baca saja/);
    expect(text).toMatch(/chat dengan tim sales/);
  });

  it('S&K tidak menyebut angka masa percobaan atau harga, supaya tidak menyimpang dari konfigurasi', () => {
    const text = textOf(buildTerms(contact));
    expect(text).not.toMatch(/\b14 hari\b|Rp\s?\d/);
  });

  it('Privasi menyebut penyedia model AI, redaksi data sensitif, dan UU PDP', () => {
    const text = textOf(buildPrivacy(contact));
    expect(text).toMatch(/penyedia model AI/);
    expect(text).toMatch(/NPWP/);
    expect(text).toMatch(/Nomor 27 Tahun 2022/);
  });
});
