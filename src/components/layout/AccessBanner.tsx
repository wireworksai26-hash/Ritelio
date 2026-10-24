import { useAccessStore } from '../../stores/accessStore';
import { Icon } from '../icons/Icon';

const REASON_TEXT: Record<string, string> = {
  trial_expired: 'Masa trial akun Anda sudah berakhir.',
  period_ended: 'Masa langganan akun Anda sudah berakhir.',
  cancelled: 'Langganan akun ini sudah dihentikan.',
};

function formatEnd(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : ` (${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})`;
}

// Spanduk saat akun baca saja: data lama tetap bisa dilihat dan diekspor, tetapi tidak bisa ditambah atau diubah.
export function AccessBanner() {
  const access = useAccessStore((s) => s.access);
  if (!access || access.mode !== 'read_only') return null;
  const lead = REASON_TEXT[access.reason] ?? 'Akses akun dibatasi.';
  return (
    <div role="status" className="flex items-start gap-2 border-b border-ash bg-sand px-4 py-2.5 text-body-sm text-smoke">
      <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
      <p>
        <strong className="font-medium text-ink">{lead.replace(/\.$/, '')}{formatEnd(access.endsAt)}.</strong> Akun sekarang hanya bisa
        dibaca: Anda masih bisa melihat dan mengekspor data, tetapi belum bisa menambah atau mengubahnya. Hubungi tim Retalio untuk
        memperpanjang.
      </p>
    </div>
  );
}
