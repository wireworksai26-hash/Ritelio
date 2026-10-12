import { useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { compressImage } from '../../lib/image';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { OcrContext } from './BillFormModal';

interface OcrResponse {
  id: string;
  status: 'pending' | 'processed' | 'needs_review' | 'failed';
  fields: Record<string, unknown> | null;
  confidence: number | string;
  error: string | null;
}

interface InvoiceScanModalProps {
  open: boolean;
  onClose: () => void;
  onScanned: (ctx: OcrContext) => void;
  /** Lewati OCR dan isi form sendiri. */
  onManual: () => void;
}

// Pembacaan oleh model bisa 30-45 detik; batas default apiFetch (8 dtk) terlalu pendek.
const SCAN_TIMEOUT_MS = 60_000;

export function InvoiceScanModal({ open, onClose, onScanned, onManual }: InvoiceScanModalProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'idle' | 'compress' | 'read'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    let previewUrl: string | undefined;
    try {
      setBusy('compress');
      const img = await compressImage(file);
      previewUrl = img.previewUrl;

      setBusy('read');
      const res = await apiFetch<OcrResponse>(
        '/v1/ocr/scan',
        {
          method: 'POST',
          body: JSON.stringify({ fileName: img.fileName, mimeType: img.mimeType, dataBase64: img.dataBase64 }),
        },
        SCAN_TIMEOUT_MS,
      );

      if (res.status === 'failed') {
        URL.revokeObjectURL(previewUrl);
        setError(res.error || 'Invoice tidak bisa dibaca otomatis.');
        return;
      }
      onScanned({
        id: res.id,
        fields: res.fields ?? {},
        confidence: Number(res.confidence) || 0,
        imageUrl: previewUrl,
      });
    } catch (err) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted ? 'Pembacaan memakan waktu terlalu lama. Coba lagi atau isi manual.' : err instanceof Error ? err.message : 'Gagal memindai invoice.');
    } finally {
      setBusy('idle');
      // Izinkan memilih berkas yang sama lagi setelah gagal
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  }

  const working = busy !== 'idle';

  return (
    <Modal open={open} onClose={working ? () => {} : onClose} title="Pindai invoice" maxWidth="md">
      <div className="space-y-4">
        <p className="text-body-sm text-fossil">
          Foto atau unggah invoice pemasok. Sistem membaca nomor, tanggal, dan nilainya, lalu Anda memeriksanya sebelum tagihan
          dibuat. Hasil bacaan tidak pernah langsung menjadi tagihan.
        </p>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {working ? (
          <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
            <Icon name="sync" size={28} className="animate-spin text-fossil" />
            <p className="text-body-sm text-ink">{busy === 'compress' ? 'Menyiapkan foto…' : 'Membaca invoice…'}</p>
            {busy === 'read' && <p className="text-caption text-fossil">Bisa sampai setengah menit.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Button icon="camera" full className="min-h-[48px]" onClick={() => cameraRef.current?.click()}>
              Ambil foto
            </Button>
            <Button variant="ghost" icon="attach" full className="min-h-[48px]" onClick={() => galleryRef.current?.click()}>
              Pilih dari galeri
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-ash bg-bone p-3.5 space-y-2.5" role="alert">
            <div className="flex items-start gap-2.5">
              <Icon name="warning" size={18} className="shrink-0 mt-0.5 text-fossil" />
              <p className="text-body-sm text-ink break-words min-w-0">{error}</p>
            </div>
            <Button variant="subtle" full className="min-h-[44px]" onClick={onManual}>
              Isi manual saja
            </Button>
          </div>
        )}

        {!working && (
          <button
            type="button"
            onClick={onManual}
            className="w-full min-h-[44px] text-body-sm text-fossil hover:text-ink underline underline-offset-4"
          >
            Lewati, catat tagihan manual
          </button>
        )}
      </div>
    </Modal>
  );
}
