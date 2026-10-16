import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RejectNulPipe, containsNul } from './reject-nul.pipe';

const pipe = new RejectNulPipe();
const body = { type: 'body' } as const;

describe('containsNul', () => {
  it('mendeteksi NUL di string, objek bersarang, array, dan nama kunci', () => {
    expect(containsNul('a\u0000b')).toBe(true);
    expect(containsNul({ a: { b: ['ok', 'x\u0000'] } })).toBe(true);
    expect(containsNul({ ['k\u0000']: 1 })).toBe(true);
  });

  it('tidak menolak input normal, termasuk unicode dan newline', () => {
    expect(containsNul('Kopi Susu\nRp 10.000 — tes ✓')).toBe(false);
    expect(containsNul({ a: 1, b: null, c: undefined, d: [true, 2] })).toBe(false);
    expect(containsNul(12345)).toBe(false);
  });

  it('tidak rekursi tak terbatas pada struktur sangat dalam', () => {
    let deep: unknown = 'x\u0000';
    for (let i = 0; i < 100; i++) deep = { n: deep };
    expect(() => containsNul(deep)).not.toThrow();
  });
});

describe('RejectNulPipe', () => {
  it('menolak body, query, dan param yang memuat NUL dengan 400', () => {
    for (const type of ['body', 'query', 'param'] as const) {
      expect(() => pipe.transform({ name: 'a\u0000b' }, { type })).toThrow(BadRequestException);
    }
  });

  it('meloloskan input normal tanpa mengubahnya', () => {
    const input = { name: 'Roti', qty: 3 };
    expect(pipe.transform(input, body)).toBe(input);
  });
});
