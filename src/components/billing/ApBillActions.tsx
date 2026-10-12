import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { BillFormModal, type OcrContext } from './BillFormModal';
import { InvoiceScanModal } from './InvoiceScanModal';

type Mode = 'closed' | 'scan' | 'form';

/**
 * Dua pintu masuk tagihan pemasok di header: catat manual dan pindai invoice.
 * Alur pindai berakhir di form yang sama dengan manual, hanya terisi dari OCR.
 */
export function ApBillActions({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<Mode>('closed');
  const [ocr, setOcr] = useState<OcrContext | null>(null);

  // Lepas URL pratinjau foto bila form ditutup
  useEffect(() => {
    return () => {
      if (ocr?.imageUrl) URL.revokeObjectURL(ocr.imageUrl);
    };
  }, [ocr]);

  const close = () => {
    setMode('closed');
    setOcr(null);
  };

  return (
    <>
      <Button variant="ghost" icon="camera" className="min-h-[44px]" onClick={() => setMode('scan')}>
        Pindai invoice
      </Button>
      <Button icon="plus" className="min-h-[44px]" onClick={() => setMode('form')}>
        Catat tagihan
      </Button>

      <InvoiceScanModal
        open={mode === 'scan'}
        onClose={close}
        onScanned={(ctx) => {
          setOcr(ctx);
          setMode('form');
        }}
        onManual={() => {
          setOcr(null);
          setMode('form');
        }}
      />
      <BillFormModal open={mode === 'form'} ocr={ocr} onClose={close} onCreated={onCreated} />
    </>
  );
}
