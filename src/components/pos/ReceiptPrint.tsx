import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatDateTime, formatIDR } from '../../lib/format';

export interface ReceiptData {
  businessName: string;
  outletName?: string;
  timestamp: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: number;
  paymentLabel: string;
  customerName?: string | null;
  /** Nomor referensi (client id); struk offline belum punya nomor invoice server. */
  reference: string;
}

const PRINT_CSS = `
@media screen { #receipt-print-root { display: none; } }
@media print {
  body > *:not(#receipt-print-root) { display: none !important; }
  #receipt-print-root { display: block; width: 72mm; margin: 0 auto; }
  @page { margin: 4mm; }
}`;

/**
 * Struk untuk dicetak lewat dialog cetak browser (printer thermal yang terpasang di
 * sistem, Bluetooth/LAN, atau simpan PDF). Dirender lewat portal agar jalan di PWA standalone.
 * Tidak ada pengiriman langsung ke printer: itu butuh driver/ESC-POS yang belum ada.
 */
export function ReceiptPrintSheet({ data, onDone }: { data: ReceiptData | null; onDone: () => void }) {
  useEffect(() => {
    if (!data) return;
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    window.addEventListener('afterprint', onDone);
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', onDone);
      style.remove();
    };
  }, [data, onDone]);

  if (!data) return null;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 } as const;

  return createPortal(
    <div id="receipt-print-root" style={{ background: '#fff', color: '#000', fontFamily: 'monospace', padding: 0 }}>
      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{data.businessName}</div>
      {data.outletName && <div style={{ textAlign: 'center', fontSize: 12 }}>{data.outletName}</div>}
      <div style={{ textAlign: 'center', fontSize: 11 }}>{formatDateTime(data.timestamp)}</div>
      <div style={{ textAlign: 'center', fontSize: 10, color: '#444' }}>Ref: {data.reference}</div>
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      {data.items.map((i, idx) => (
        <div key={idx} style={row}>
          <span>
            {i.qty}x {i.name}
          </span>
          <span>{formatIDR(i.qty * i.price)}</span>
        </div>
      ))}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ ...row, fontWeight: 600, fontSize: 13 }}>
        <span>Total</span>
        <span>{formatIDR(data.total)}</span>
      </div>
      <div style={{ fontSize: 11, marginTop: 4 }}>
        {data.paymentLabel}
        {data.customerName ? ` - ${data.customerName}` : ''}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, marginTop: 10 }}>Terima kasih</div>
    </div>,
    document.body,
  );
}
