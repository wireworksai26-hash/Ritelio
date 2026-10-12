import { useEffect, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/controls';
import { Modal } from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { ProductSearch, type PickedProduct } from '../crm/LineItemsEditor';

export type QcStageKey = 'incoming' | 'in_process' | 'final';

export const QC_STAGE_ORDER: QcStageKey[] = ['incoming', 'in_process', 'final'];

export const qcStageLabel: Record<QcStageKey, string> = {
  incoming: 'Bahan Masuk',
  in_process: 'Proses',
  final: 'Akhir',
};

export interface QcProgress {
  steps: Array<{ stage: string; result: string }>;
  pending: number;
  failed: number;
  readyToComplete: boolean;
}

const resultBadge: Record<string, { variant: 'accent' | 'outline' | 'neutral'; label: string }> = {
  passed: { variant: 'accent', label: 'Lulus' },
  failed: { variant: 'outline', label: 'Gagal' },
  pending: { variant: 'neutral', label: 'Menunggu' },
};

/** Ringkasan tahap QC wajib untuk satu order, dengan penanda lulus / gagal / menunggu. */
export function QcProgressList({ progress }: { progress: QcProgress | null }) {
  if (!progress) return null;
  if (progress.steps.length === 0) {
    return (
      <p className="text-body-sm text-fossil rounded-xl border border-dashed border-ash px-3.5 py-3">
        Produk ini belum punya tahap QC wajib. Satu pemeriksaan bebas sudah cukup. Atur tahap lewat tombol "Atur Tahap QC".
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {progress.steps.map((s, i) => {
          const badge = resultBadge[s.result] ?? resultBadge.pending;
          return (
            <li key={s.stage} className="flex items-center justify-between gap-3 rounded-lg border border-ash px-3 py-2">
              <span className="text-body-sm text-ink">
                <span className="tnum text-fossil mr-2">{i + 1}.</span>
                {qcStageLabel[s.stage as QcStageKey] ?? s.stage}
              </span>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </li>
          );
        })}
      </ol>
      <p className="text-caption text-fossil">
        {progress.readyToComplete
          ? 'Semua tahap wajib lulus. Order boleh diselesaikan.'
          : progress.failed > 0
            ? `${progress.failed} tahap gagal. Order belum boleh diselesaikan.`
            : `${progress.pending} tahap masih menunggu.`}
      </p>
    </div>
  );
}

interface StageDraft {
  enabled: boolean;
  required: boolean;
  minPassPct: string;
}

const emptyDraft = (): Record<QcStageKey, StageDraft> => ({
  incoming: { enabled: false, required: true, minPassPct: '100' },
  in_process: { enabled: true, required: true, minPassPct: '100' },
  final: { enabled: true, required: true, minPassPct: '100' },
});

/**
 * Atur tahap QC per produk. Backend menimpa seluruh konfigurasi (PUT) dan belum
 * menyediakan GET konfigurasi, jadi form selalu mulai dari bawaan dan memberi tahu pengguna.
 */
export function QcStagesModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setProduct(null);
      setDraft(emptyDraft());
    }
  }, [open]);

  const patch = (stage: QcStageKey, next: Partial<StageDraft>) =>
    setDraft((d) => ({ ...d, [stage]: { ...d[stage], ...next } }));

  async function submit() {
    if (!product) {
      toast({ title: 'Pilih produk.', icon: 'warning' });
      return;
    }
    const stages: Array<{ stage: QcStageKey; isRequired: boolean; minPassPct: number }> = [];
    for (const key of QC_STAGE_ORDER) {
      const d = draft[key];
      if (!d.enabled) continue;
      const pct = Number(d.minPassPct.replace(',', '.'));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast({ title: `Batas lulus tahap ${qcStageLabel[key]} harus 0 sampai 100%.`, icon: 'warning' });
        return;
      }
      stages.push({ stage: key, isRequired: d.required, minPassPct: Math.round(pct * 100) / 100 });
    }
    if (stages.length === 0) {
      toast({ title: 'Aktifkan minimal satu tahap.', icon: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/v1/manufacturing/products/${product.id}/qc-stages`, {
        method: 'PUT',
        body: JSON.stringify({ stages }),
      });
      toast({ title: `Tahap QC ${product.name} disimpan.`, icon: 'check' });
      onDone();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal menyimpan tahap QC.', icon: 'warning' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Atur Tahap QC Produk" maxWidth="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {product ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ash bg-bone/40 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[15px] text-ink break-words">{product.name}</p>
              <p className="text-caption text-fossil tnum">{product.sku}</p>
            </div>
            <Button type="button" variant="subtle" size="sm" onClick={() => setProduct(null)}>
              Ganti
            </Button>
          </div>
        ) : (
          <ProductSearch label="Produk" onPick={setProduct} />
        )}

        <div className="space-y-2.5">
          {QC_STAGE_ORDER.map((key, i) => {
            const d = draft[key];
            return (
              <div key={key} className={`rounded-xl border p-3.5 space-y-3 ${d.enabled ? 'border-ink/30 bg-paper' : 'border-ash bg-bone/30'}`}>
                <label className="flex items-center gap-3 cursor-pointer min-h-[40px]">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => patch(key, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#1c1c1c] shrink-0"
                  />
                  <span className="text-[15px] text-ink">
                    <span className="tnum text-fossil mr-1.5">{i + 1}.</span>
                    {qcStageLabel[key]}
                  </span>
                </label>
                {d.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <Input
                      label="Batas lulus (%)"
                      hint="Persentase barang yang harus lolos."
                      value={d.minPassPct}
                      onChange={(e) => patch(key, { minPassPct: e.target.value })}
                      inputMode="decimal"
                    />
                    <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={d.required}
                        onChange={(e) => patch(key, { required: e.target.checked })}
                        className="h-4 w-4 accent-[#1c1c1c] shrink-0"
                      />
                      <span className="text-body-sm text-ink">Wajib sebelum order selesai</span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-caption text-fossil">
          Tahap dijalankan berurutan: Bahan Masuk, Proses, lalu Akhir. Menyimpan akan menimpa konfigurasi tahap QC produk ini sebelumnya.
        </p>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" full onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" full disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan Tahap'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
