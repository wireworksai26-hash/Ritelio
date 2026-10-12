import { describe, expect, it } from 'vitest';
import { normalizeAndValidateJournalLines } from './journal-validation';

describe('normalizeAndValidateJournalLines', () => {
  it('accepts a balanced multi-line journal and rounds to cents', () => {
    const lines = normalizeAndValidateJournalLines([
      { accountId: 'cash', direction: 'debit', amount: 0.1 + 0.2 },
      { accountId: 'revenue-a', direction: 'credit', amount: 0.1 },
      { accountId: 'revenue-b', direction: 'credit', amount: 0.2 },
    ]);

    expect(lines.map((line) => line.amount)).toEqual([0.3, 0.1, 0.2]);
  });

  it('rejects journals whose debit and credit totals differ', () => {
    expect(() => normalizeAndValidateJournalLines([
      { accountId: 'cash', direction: 'debit', amount: 100 },
      { accountId: 'revenue', direction: 'credit', amount: 99.99 },
    ])).toThrow('Total debit dan kredit jurnal harus sama');
  });

  it('rejects zero and negative lines', () => {
    expect(() => normalizeAndValidateJournalLines([
      { accountId: 'cash', direction: 'debit', amount: 0 },
      { accountId: 'revenue', direction: 'credit', amount: 0 },
    ])).toThrow('nilai positif');
  });
});
