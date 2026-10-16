import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_TASKS, assertStageMove, summarizePipeline } from './recruitment-stage';
import { RecruitmentService } from './recruitment.service';

describe('assertStageMove', () => {
  it('maju satu langkah diizinkan sepanjang jalur applied -> offer', () => {
    expect(() => assertStageMove('applied', 'screening')).not.toThrow();
    expect(() => assertStageMove('screening', 'interview')).not.toThrow();
    expect(() => assertStageMove('interview', 'offer')).not.toThrow();
  });

  it('tidak boleh melompat atau mundur atau diam di tempat', () => {
    expect(() => assertStageMove('applied', 'offer')).toThrow(/berurutan/);
    expect(() => assertStageMove('applied', 'interview')).toThrow(/berurutan/);
    expect(() => assertStageMove('interview', 'screening')).toThrow(/berurutan/);
    expect(() => assertStageMove('screening', 'screening')).toThrow(/berurutan/);
  });

  it('"hired" tidak bisa diatur lewat moveStage, termasuk dari offer (harus lewat hire())', () => {
    expect(() => assertStageMove('offer', 'hired')).toThrow(/proses hire/);
    expect(() => assertStageMove('applied', 'hired')).toThrow(BadRequestException);
  });

  it('tolak butuh alasan; spasi saja tidak cukup; boleh dari tahap aktif mana pun', () => {
    for (const s of ['applied', 'screening', 'interview', 'offer']) {
      expect(() => assertStageMove(s, 'rejected', 'Tidak sesuai')).not.toThrow();
    }
    expect(() => assertStageMove('applied', 'rejected')).toThrow(/Alasan penolakan/);
    expect(() => assertStageMove('applied', 'rejected', '   ')).toThrow(/Alasan penolakan/);
  });

  it('status akhir (hired/rejected) tidak bisa digeser lagi', () => {
    expect(() => assertStageMove('hired', 'rejected', 'x')).toThrow(ConflictException);
    expect(() => assertStageMove('rejected', 'screening')).toThrow(ConflictException);
  });

  it('tahap tidak dikenal ditolak', () => {
    expect(() => assertStageMove('applied', 'ghosted')).toThrow(/tidak dikenal/);
    expect(() => assertStageMove('weird', 'screening')).toThrow(ConflictException);
  });
});

describe('summarizePipeline', () => {
  it('hitung per tahap, total, dan hire rate dibulatkan 2 desimal', () => {
    const r = summarizePipeline([
      { stage: 'applied', count: 5 },
      { stage: 'hired', count: 1 },
      { stage: 'rejected', count: 0 },
    ]);
    expect(r.totalApplicants).toBe(6);
    expect(r.hireRatePct).toBe(16.67);
    expect(r.stages.map((s) => s.stage)).toEqual(['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']);
    expect(r.stages.find((s) => s.stage === 'screening')?.count).toBe(0);
  });

  it('tanpa pelamar: hire rate 0, bukan NaN', () => {
    const r = summarizePipeline([]);
    expect(r.hireRatePct).toBe(0);
    expect(r.totalApplicants).toBe(0);
  });
});

type Row = Record<string, any>;

/** Fake Prisma stateful untuk alur hire. */
function setup(applicantOver: Row = {}, postingOver: Row = {}, hiredElsewhere = 0) {
  const state = {
    applicant: {
      id: 'ap-1', tenantId: 't1', companyId: 'c1', stage: 'offer', fullName: 'Sari', email: 'sari@x.id',
      phone: '08', jobPostingId: 'jp-1', employeeId: null, hiredAt: null, ...applicantOver,
    } as Row,
    posting: { id: 'jp-1', openings: 1, status: 'open', positionId: 'pos-1', departmentId: 'dep-1', ...postingOver } as Row,
    employees: [] as Row[],
    users: [] as Row[],
    interleave: undefined as undefined | (() => void),
    hasStaffRole: true,
  };
  const applicantApi = {
    findFirst: async () => ({ ...state.applicant, jobPosting: { ...state.posting, position: null, department: null } }),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      state.interleave?.();
      if (state.applicant.stage !== where.stage) return { count: 0 };
      state.applicant = { ...state.applicant, ...data };
      return { count: 1 };
    },
    update: async ({ data }: { data: Row }) => {
      state.applicant = { ...state.applicant, ...data };
      return state.applicant;
    },
    findUniqueOrThrow: async () => state.applicant,
    count: async () => hiredElsewhere + (state.applicant.stage === 'hired' ? 1 : 0),
  };
  const tx = {
    applicant: applicantApi,
    accessRole: { findFirst: async () => (state.hasStaffRole ? { id: 'role-staff' } : null) },
    user: { create: async ({ data }: { data: Row }) => { state.users.push(data); return { id: 'u-1' }; } },
    employee: { create: async ({ data }: { data: Row }) => { state.employees.push(data); return { id: 'emp-1', ...data }; } },
    jobPosting: { update: async ({ data }: { data: Row }) => { state.posting = { ...state.posting, ...data }; } },
  };
  const prisma: Row = {
    company: { findFirst: async () => ({ id: 'c1' }) },
    applicant: applicantApi,
    documentSequence: { upsert: async () => ({ nextValue: 7 }) },
    employee: { findFirst: async () => null },
    jobPosting: { findFirst: async () => ({ ...state.posting }) },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  return { state, service: new RecruitmentService(prisma as never) };
}

describe('RecruitmentService.hire', () => {
  it('hire pelamar di tahap offer: membuat Employee, menandai hired, menutup lowongan bila kuota penuh', async () => {
    const { state, service } = setup();
    const r = await service.hire('t1', 'ap-1', { baseSalary: 8_000_000, hireDate: '2026-11-01' });
    expect(state.employees).toHaveLength(1);
    expect(state.employees[0]).toMatchObject({ fullName: 'Sari', isActive: true });
    expect(String(state.employees[0].employeeNo)).toMatch(/^EMP-\d{4}-0007$/);
    expect(Number(state.employees[0].baseSalary)).toBe(8_000_000);
    expect(state.applicant).toMatchObject({ stage: 'hired', employeeId: 'emp-1' });
    expect(state.posting.status).toBe('closed');
    expect(r.onboardingTasks).toEqual([...ONBOARDING_TASKS]);
    expect(r.userId).toBeNull();
  });

  it('lowongan multi-kuota tetap terbuka sampai penuh', async () => {
    const { state, service } = setup({}, { openings: 3 });
    await service.hire('t1', 'ap-1', { baseSalary: 5_000_000 });
    expect(state.posting.status).toBe('open');
  });

  it('createUser membuat akun dan menautkan userId ke Employee', async () => {
    const { state, service } = setup();
    const r = await service.hire('t1', 'ap-1', { baseSalary: 5_000_000, createUser: true });
    // roleId wajib FK ke peran 'staff' tenant: string kosong membuat hire gagal 500 di DB nyata.
    expect(state.users[0]).toMatchObject({ email: 'sari@x.id', name: 'Sari', roleId: 'role-staff', role: 'staff' });
    expect(r.userId).toBe('u-1');
    expect(state.employees[0].userId).toBe('u-1');
  });

  it('createUser tanpa peran staff di tenant ditolak jelas (400) dan tidak membuat Employee', async () => {
    const { state, service } = setup();
    state.hasStaffRole = false;
    await expect(service.hire('t1', 'ap-1', { baseSalary: 5_000_000, createUser: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(state.employees).toHaveLength(0);
  });

  it('hire kedua kali ditolak dan tidak membuat Employee kedua', async () => {
    const { state, service } = setup();
    await service.hire('t1', 'ap-1', { baseSalary: 5_000_000 });
    await expect(service.hire('t1', 'ap-1', { baseSalary: 5_000_000 })).rejects.toThrow(/sudah di-hire/);
    expect(state.employees).toHaveLength(1);
  });

  it('dua hire bersamaan: pembaca kedua lolos cek awal tetapi kalah di klaim atomik', async () => {
    const { state, service } = setup();
    // Setelah cek awal (stage masih "offer") proses lain menyelesaikan hire lebih dulu.
    state.interleave = () => {
      state.applicant = { ...state.applicant, stage: 'hired' };
      state.interleave = undefined;
    };
    await expect(service.hire('t1', 'ap-1', { baseSalary: 5_000_000 })).rejects.toThrow(ConflictException);
    expect(state.employees).toHaveLength(0);
  });

  it.each(['applied', 'screening', 'interview', 'rejected'])('pelamar di tahap %s tidak bisa di-hire', async (stage) => {
    const { state, service } = setup({ stage });
    await expect(service.hire('t1', 'ap-1', { baseSalary: 5_000_000 })).rejects.toThrow(/tahap "offer"/);
    expect(state.employees).toHaveLength(0);
  });

  it.each([0, -1, Number.NaN])('gaji pokok tidak valid (%s) ditolak', async (salary) => {
    const { service } = setup();
    await expect(service.hire('t1', 'ap-1', { baseSalary: salary })).rejects.toThrow(/Gaji pokok/);
  });

  it('tanggal masuk rusak ditolak sebelum menyentuh transaksi', async () => {
    const { state, service } = setup();
    await expect(service.hire('t1', 'ap-1', { baseSalary: 5_000_000, hireDate: 'besok' })).rejects.toThrow(/Tanggal masuk/);
    expect(state.employees).toHaveLength(0);
  });
});

describe('RecruitmentService.apply / moveStage / completeOnboarding', () => {
  it('apply ke lowongan tertutup atau kuota terisi ditolak', async () => {
    const { service: closed } = setup({}, { status: 'closed' });
    await expect(closed.apply('t1', { jobPostingId: 'jp-1', fullName: 'A', email: 'a@x.id' })).rejects.toThrow(/ditutup/);

    const { service: full } = setup({}, { openings: 1 }, 1);
    await expect(full.apply('t1', { jobPostingId: 'jp-1', fullName: 'A', email: 'a@x.id' })).rejects.toThrow(/Kuota/);
  });

  it('moveStage menolak hired langsung dari offer dan tidak menulis apa pun', async () => {
    const { state, service } = setup();
    await expect(service.moveStage('t1', 'ap-1', 'hired')).rejects.toThrow(/proses hire/);
    expect(state.applicant.stage).toBe('offer');
  });

  it('moveStage menyimpan alasan penolakan', async () => {
    const { state, service } = setup({ stage: 'interview', rejectReason: '' });
    await service.moveStage('t1', 'ap-1', 'rejected', 'Gaji tidak cocok');
    expect(state.applicant).toMatchObject({ stage: 'rejected', rejectReason: 'Gaji tidak cocok' });
  });

  it('completeOnboarding hanya untuk pelamar yang sudah punya Employee', async () => {
    const { service } = setup({ employeeId: null });
    await expect(service.completeOnboarding('t1', 'ap-1')).rejects.toThrow(/belum di-hire/);
    const { state, service: ok } = setup({ employeeId: 'emp-1', stage: 'hired' });
    await ok.completeOnboarding('t1', 'ap-1');
    expect(state.applicant.onboardingDone).toBe(true);
  });

  it('pelamar tidak ditemukan -> 404', async () => {
    const { service } = setup();
    (service as any).prisma.applicant.findFirst = async () => null;
    await expect(service.moveStage('t1', 'x', 'screening')).rejects.toThrow(NotFoundException);
    await expect(service.hire('t1', 'x', { baseSalary: 1 })).rejects.toThrow(NotFoundException);
  });
});
