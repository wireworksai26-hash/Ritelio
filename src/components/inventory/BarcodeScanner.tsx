import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';

// BarcodeDetector belum ada di lib.dom TypeScript; deklarasi minimal sesuai spesifikasi Shape Detection API.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
};

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const SCAN_INTERVAL_MS = 250;
// Kode yang sama tidak dilaporkan ulang selama jeda ini (kamera menangkap barcode berkali-kali).
const REPEAT_GUARD_MS = 1500;

type ScannerState = 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

interface BarcodeScannerProps {
  onDetect: (code: string) => void;
  /** Hentikan kamera tanpa melepas komponen (mis. modal ditutup). */
  active?: boolean;
}

/**
 * Pemindai barcode dari kamera. Memakai BarcodeDetector bawaan browser (Chrome/Edge/Android);
 * di browser tanpa dukungan (mis. Safari iOS) komponen menampilkan penjelasan dan
 * pemanggil tetap menyediakan input manual / alat scan USB sebagai jalur cadangan.
 */
export function BarcodeScanner({ onDetect, active = true }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectRef = useRef(onDetect);
  const [state, setState] = useState<ScannerState>('starting');

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    if (!active) return;

    const Detector = getDetectorCtor();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let last = { code: '', at: 0 };
    setState('starting');

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        if (cancelled) return;
        setState('live');

        const detector = new Detector({ formats: FORMATS });
        let busy = false;
        timer = window.setInterval(async () => {
          if (busy || video.readyState < 2) return;
          busy = true;
          try {
            const found = await detector.detect(video);
            const code = found[0]?.rawValue?.trim();
            if (code && !(code === last.code && Date.now() - last.at < REPEAT_GUARD_MS)) {
              last = { code, at: Date.now() };
              onDetectRef.current(code);
            }
          } catch {
            // frame gagal dibaca — coba lagi pada interval berikutnya
          } finally {
            busy = false;
          }
        }, SCAN_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active]);

  const message: Record<Exclude<ScannerState, 'live' | 'starting'>, string> = {
    denied: 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, atau ketik kode secara manual.',
    unsupported: 'Browser ini belum mendukung pemindaian kamera. Ketik kode secara manual atau pakai alat scan barcode.',
    error: 'Kamera tidak dapat dibuka. Pastikan tidak dipakai aplikasi lain, atau ketik kode secara manual.',
  };
  const showVideo = state === 'starting' || state === 'live';

  return (
    <div className="relative rounded-xl bg-bone border border-ash aspect-video overflow-hidden flex items-center justify-center">
      {showVideo && (
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      )}
      {state === 'live' && (
        <div
          className="pointer-events-none absolute inset-x-[12%] top-1/2 h-px bg-chartreuse shadow-[0_0_0_1px_rgba(28,28,28,0.35)]"
          aria-hidden="true"
        />
      )}
      {state === 'starting' && (
        <p className="relative z-10 text-caption text-fossil bg-paper/80 rounded-md px-2 py-1">Membuka kamera…</p>
      )}
      {!showVideo && (
        <div className="flex flex-col items-center gap-2 px-5 text-center" role="status">
          <Icon name={state === 'denied' ? 'lock' : 'camera'} size={28} className="text-pebble" />
          <p className="text-caption text-fossil">{message[state as keyof typeof message]}</p>
        </div>
      )}
    </div>
  );
}
