import { BadRequestException } from '@nestjs/common';

export type IntakeAnswerValue = string | string[];

export interface IntakeAnswer {
  question: string;
  answer: IntakeAnswerValue;
}

export interface IntakePayload {
  responseId: string;
  formId: string | null;
  submittedAt: Date;
  answers: IntakeAnswer[];
}

export interface IntakeKnownFields {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  businessType: string | null;
  employeeRange: string | null;
}

// Batas keras: endpoint ini publik (dilindungi tanda tangan), jadi ukuran tiap bagian dibatasi.
const MAX_ANSWERS = 60;
const MAX_QUESTION = 300;
const MAX_TEXT = 4000;
const MAX_CHOICES = 30;
const MAX_CHOICE = 300;
const MAX_ID = 200;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function text(value: unknown, max: number, label: string): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') throw new BadRequestException(`${label} harus berupa teks.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new BadRequestException(`${label} terlalu panjang (maksimal ${max} karakter).`);
  return trimmed;
}

/**
 * Validasi dan rapikan isi webhook formulir. Bentuk yang diharapkan:
 * { responseId, formId?, submittedAt?, answers: [{ question, answer }] }, dengan answer berupa teks
 * atau daftar teks (kotak centang). Jawaban kosong dibuang; pertanyaan tanpa judul ditolak.
 */
export function parseIntakePayload(raw: unknown, now: Date = new Date()): IntakePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Isi permintaan harus berupa objek JSON.');
  }
  const body = raw as Record<string, unknown>;

  const responseId = text(body.responseId, MAX_ID, 'responseId');
  if (!responseId) throw new BadRequestException('responseId wajib diisi.');
  const formId = body.formId === undefined || body.formId === null ? null : text(body.formId, MAX_ID, 'formId') || null;

  let submittedAt = now;
  if (body.submittedAt !== undefined && body.submittedAt !== null) {
    const parsed = new Date(text(body.submittedAt, 64, 'submittedAt'));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('submittedAt bukan tanggal yang valid.');
    submittedAt = parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MS ? now : parsed;
  }

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    throw new BadRequestException('answers wajib berisi minimal satu jawaban.');
  }
  if (body.answers.length > MAX_ANSWERS) {
    throw new BadRequestException(`Terlalu banyak jawaban (maksimal ${MAX_ANSWERS}).`);
  }

  const answers: IntakeAnswer[] = [];
  for (const item of body.answers) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException('Setiap jawaban harus berupa objek { question, answer }.');
    }
    const entry = item as Record<string, unknown>;
    const question = text(entry.question, MAX_QUESTION, 'question');
    if (!question) throw new BadRequestException('Setiap jawaban harus punya judul pertanyaan.');

    let answer: IntakeAnswerValue;
    if (Array.isArray(entry.answer)) {
      if (entry.answer.length > MAX_CHOICES) throw new BadRequestException(`Pilihan terlalu banyak pada "${question}".`);
      answer = entry.answer.map((c) => text(c, MAX_CHOICE, 'pilihan')).filter(Boolean);
      if (answer.length === 0) continue;
    } else if (entry.answer === undefined || entry.answer === null) {
      continue;
    } else {
      answer = text(entry.answer, MAX_TEXT, 'answer');
      if (!answer) continue;
    }
    answers.push({ question, answer });
  }
  if (answers.length === 0) throw new BadRequestException('Semua jawaban kosong.');

  return { responseId, formId, submittedAt, answers };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pemetaan judul pertanyaan ke kolom yang dipakai daftar. Dicocokkan lewat kata kunci, jadi form lain pun tetap terbaca. */
const FIELD_RULES: Array<{ field: keyof IntakeKnownFields; test: (title: string) => boolean }> = [
  { field: 'contactEmail', test: (t) => /e-?mail/.test(t) },
  { field: 'contactPhone', test: (t) => /whatsapp|\bwa\b|telepon|telpon|handphone|\bhp\b|no\.? ?hp/.test(t) },
  { field: 'employeeRange', test: (t) => /karyawan|pegawai|jumlah staf|jumlah tim/.test(t) },
  { field: 'businessType', test: (t) => /jenis usaha|bidang usaha|jenis bisnis|industri/.test(t) },
  { field: 'contactName', test: (t) => /nama lengkap|^nama( anda| kontak| pemilik)?$/.test(t) },
];

function asText(answer: IntakeAnswerValue): string {
  return Array.isArray(answer) ? answer.join(', ') : answer;
}

export function extractKnownFields(answers: IntakeAnswer[]): IntakeKnownFields {
  const result: IntakeKnownFields = {
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    businessType: null,
    employeeRange: null,
  };
  for (const { question, answer } of answers) {
    const title = question.toLowerCase().replace(/\s+/g, ' ').trim();
    const rule = FIELD_RULES.find((r) => r.test(title));
    if (!rule || result[rule.field] !== null) continue;
    const value = asText(answer).trim();
    if (!value) continue;
    result[rule.field] = rule.field === 'contactEmail' ? (EMAIL_SHAPE.test(value) ? value : null) : value;
  }
  return result;
}

/** Pertanyaan yang mengidentifikasi orangnya. Tidak dikirim ke model AI eksternal. */
export function isIdentifyingQuestion(question: string): boolean {
  return /nama lengkap|^nama( anda| kontak| pemilik)?$|whatsapp|\bwa\b|telepon|telpon|handphone|\bhp\b|e-?mail|alamat|domisili/.test(
    question.toLowerCase().replace(/\s+/g, ' ').trim(),
  );
}
