import { describe, expect, it } from 'vitest';
import { isSecretKey, redactSecrets, sanitizeForAudit } from './redact';

describe('redaksi audit', () => {
  it('mengenali key rahasia termasuk variasi nama', () => {
    for (const key of ['password', 'passwordHash', 'refreshToken', 'tokenHash', 'apiKey', 'api_key', 'webhookSecret', 'twoFactorSecret', 'otp', 'Authorization', 'currentPassword', 'accessToken']) {
      expect(isSecretKey(key), key).toBe(true);
    }
    for (const key of ['code', 'name', 'tokensValidAfter', 'quantity']) expect(isSecretKey(key), key).toBe(false);
  });

  it('sanitizeForAudit meredaksi di kedalaman berapa pun, memotong string panjang, dan membuang gambar base64', () => {
    const out = sanitizeForAudit({
      name: 'Sensor 1',
      apiKey: 'sk-live-123',
      nested: { list: [{ passwordHash: '$2a$12$abc', ok: 1 }] },
      dataBase64: 'A'.repeat(5000),
      note: 'x'.repeat(5000),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }) as Record<string, any>;
    expect(out.apiKey).toBe('[redacted]');
    expect(out.nested.list[0].passwordHash).toBe('[redacted]');
    expect(out.nested.list[0].ok).toBe(1);
    expect(out.dataBase64).toBe('[tidak disimpan]');
    expect(out.note.length).toBeLessThan(400);
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(JSON.stringify(out)).not.toContain('sk-live-123');
  });

  it('redactSecrets tidak memutasi input dan membiarkan Date', () => {
    const input = { token: 'abc', when: new Date(0) };
    const out = redactSecrets(input);
    expect(input.token).toBe('abc');
    expect(out.token).toBe('[redacted]');
    expect(out.when).toBeInstanceOf(Date);
  });
});
