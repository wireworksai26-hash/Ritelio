import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, formatIDR, formatNumber } from '../../lib/format';
import { toast } from '../../stores/toastStore';
import { Icon } from '../icons/Icon';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface PoPrintData {
  code: string;
  companyName: string;
  createdAt: string;
  supplier: { name: string; email?: string | null; phone?: string | null };
  warehouse: string;
  items: Array<{ name: string; unit?: string | null; qty: number; price: number; subtotal: number }>;
  total: number;
}

/** Respons POST /purchasing/orders/:id/send. */
export interface PoSendResult {
  alreadySent: boolean;
  sentAt: string;
  share: { subject: string; text: string; whatsappUrl: string; mailtoUrl: string; total: number };
  print: PoPrintData;
}

interface PoShareModalProps {
  result: PoSendResult | null;
  onClose: () => void;
  onPrint: (data: PoPrintData) => void;
}

const optionClass =
  'flex items-center gap-3 w-full min-h-[52px] rounded-xl border border-ash bg-paper px-4 py-3 text-left text-[15px] text-ink hover:bg-sand active:scale-[0.99] transition-colors';

/**
 * Lembar bagikan PO. Server tidak mengirim pesan apa pun; di sini pengguna
 * memilih saluran sendiri (share sheet HP, WhatsApp, email, atau cetak).
 */
export function PoShareModal({ result, onClose, onPrint }: PoShareModalProps) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function nativeShare() {
    if (!result) return;
    try {
      await navigator.share({ title: result.share.subject, text: result.share.text });
    } catch (err) {
      // Pengguna menutup share sheet = bukan kesalahan
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast({ title: 'Gagal membuka menu bagikan.', icon: 'warning' });
      }
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.share.text);
      toast({ title: 'Teks PO disalin.', icon: 'check' });
    } catch {
      toast({ title: 'Salin tidak didukung di browser ini.', icon: 'warning' });
    }
  }

  return (
    <Modal open={result !== null} onClose={onClose} title={result ? `Kirim ${result.print.code}` : ''} maxWidth="md">
      {result && (
        <div className="space-y-4">
          <p className="text-body-sm text-fossil">
            {result.alreadySent ? 'PO ini sudah berstatus Dipesan.' : 'PO ditandai Dipesan.'} Sistem tidak mengirim pesan sendiri.
            Pilih cara mengirim ke {result.print.supplier.name}:
          </p>

          <div className="space-y-2">
            {canShare && (
              <button type="button" className={optionClass} onClick={nativeShare}>
                <Icon name="arrow-up" size={20} />
                <span className="flex-1">Bagikan lewat aplikasi lain</span>
              </button>
            )}
            <a className={optionClass} href={result.share.whatsappUrl} target="_blank" rel="noreferrer">
              <Icon name="chat" size={20} />
              <span className="flex-1">
                WhatsApp
                {!result.print.supplier.phone && <span className="block text-caption text-fossil">Nomor pemasok belum diisi, pilih kontak sendiri</span>}
              </span>
            </a>
            <a className={optionClass} href={result.share.mailtoUrl}>
              <Icon name="mail" size={20} />
              <span className="flex-1">
                Email
                {!result.print.supplier.email && <span className="block text-caption text-fossil">Email pemasok belum diisi, isi penerima sendiri</span>}
              </span>
            </a>
            <button type="button" className={optionClass} onClick={copy}>
              <Icon name="copy" size={20} />
              <span className="flex-1">Salin teks pesan</span>
            </button>
            <button type="button" className={optionClass} onClick={() => onPrint(result.print)}>
              <Icon name="printer" size={20} />
              <span className="flex-1">Cetak / simpan PDF</span>
            </button>
          </div>

          <Button variant="ghost" full className="min-h-[44px]" onClick={onClose}>
            Selesai
          </Button>
        </div>
      )}
    </Modal>
  );
}

const PRINT_CSS = `
@media screen { #po-print-root { display: none; } }
@media print {
  body > *:not(#po-print-root) { display: none !important; }
  #po-print-root { display: block; }
  @page { margin: 16mm; }
}`;

/**
 * Dokumen PO untuk dicetak. Dirender lewat portal ke <body> dan stylesheet cetak
 * menyembunyikan seluruh aplikasi, jadi bekerja juga di PWA mode standalone
 * (window.open sering diblokir di sana). Warna dipaksa hitam-putih agar mode gelap
 * tidak ikut tercetak.
 */
export function PoPrintSheet({ data, onDone }: { data: PoPrintData | null; onDone: () => void }) {
  useEffect(() => {
    if (!data) return;
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    window.addEventListener('afterprint', onDone);
    // Satu tick agar portal sudah masuk DOM sebelum dialog cetak dibuka
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', onDone);
      style.remove();
    };
  }, [data, onDone]);

  if (!data) return null;
  const cell = { padding: '6px 8px', borderBottom: '1px solid #ccc', fontSize: 12 } as const;

  return createPortal(
    <div
      id="po-print-root"
      style={{ background: '#fff', color: '#000', fontFamily: 'system-ui, sans-serif', padding: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{data.companyName}</div>
          <div style={{ fontSize: 12, color: '#444' }}>Gudang penerima: {data.warehouse}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 1 }}>PESANAN PEMBELIAN</div>
          <div style={{ fontSize: 13 }}>{data.code}</div>
          <div style={{ fontSize: 12, color: '#444' }}>{formatDate(data.createdAt)}</div>
        </div>
      </div>

      <div style={{ border: '1px solid #999', padding: 10, marginBottom: 16, fontSize: 13 }}>
        <div style={{ fontSize: 11, color: '#555' }}>Kepada</div>
        <div style={{ fontWeight: 600 }}>{data.supplier.name}</div>
        {data.supplier.phone && <div>{data.supplier.phone}</div>}
        {data.supplier.email && <div>{data.supplier.email}</div>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ ...cell, textAlign: 'left' }}>No</th>
            <th style={{ ...cell, textAlign: 'left' }}>Barang</th>
            <th style={{ ...cell, textAlign: 'right' }}>Jumlah</th>
            <th style={{ ...cell, textAlign: 'right' }}>Harga</th>
            <th style={{ ...cell, textAlign: 'right' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{it.name}</td>
              <td style={{ ...cell, textAlign: 'right' }}>
                {formatNumber(it.qty)} {it.unit ?? ''}
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>{formatIDR(it.price)}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{formatIDR(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>
              Total
            </td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{formatIDR(data.total)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ width: 180, textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>Disiapkan oleh</div>
        </div>
        <div style={{ width: 180, textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>Disetujui oleh</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Pengelola status cetak: satu `data` baru = satu dialog cetak. */
export function usePoPrint() {
  const [data, setData] = useState<PoPrintData | null>(null);
  // Stabil: PoPrintSheet memasang listener di efek yang bergantung pada `done`,
  // dan identitas baru tiap render akan memicu dialog cetak berulang.
  const print = useCallback((d: PoPrintData) => setData({ ...d }), []);
  const done = useCallback(() => setData(null), []);
  return { data, print, done };
}
