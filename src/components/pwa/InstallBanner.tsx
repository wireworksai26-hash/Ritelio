import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { LogoMark } from '../layout/Logo';
import { Icon } from '../icons/Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'retalio-install-dismissed';

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Deteksi iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isIosDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone);

  if (dismissed || standalone) return null;

  // Tampilkan banner jika event install siap ATAU di perangkat iOS
  const canShow = Boolean(deferred) || isIOS;
  if (!canShow) return null;

  return (
    <>
      <div className="fixed bottom-20 lg:bottom-6 left-4 lg:left-6 z-50 w-[calc(100vw-2rem)] max-w-sm bg-paper border border-ash rounded-xl p-4 shadow-xl animate-fade-in">
        <div className="flex items-start gap-3">
          <LogoMark size={38} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-ink">Install Retalio App</p>
            <p className="text-caption text-fossil mt-0.5 leading-relaxed">
              Akses cepat tanpa browser bar, mode kasir offline, & sinkronisasi otomatis.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {deferred ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    await deferred.prompt();
                    const choice = await deferred.userChoice;
                    if (choice.outcome === 'accepted') setDeferred(null);
                  }}
                >
                  Install Sekarang
                </Button>
              ) : isIOS ? (
                <Button size="sm" onClick={() => setShowIOSGuide(true)}>
                  Cara Install di iPhone
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  localStorage.setItem(DISMISS_KEY, '1');
                  setDismissed(true);
                }}
              >
                Nanti Saja
              </Button>
            </div>
          </div>
          <button
            aria-label="Tutup banner install"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, '1');
              setDismissed(true);
            }}
            className="text-pebble hover:text-ink transition-colors p-1"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>

      {/* Modal panduan khusus iOS Safari */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-paper p-6 border border-ash shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-heading-sm font-light text-ink">Install di iPhone / iPad</h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-fossil hover:text-ink"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <ol className="space-y-3.5 text-body-sm text-ink">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sand text-caption font-medium text-ink">
                  1
                </span>
                <span>Tekan tombol <strong>Bagikan / Share</strong> (ikon kotak berpanah ke atas) di menu bawah Safari.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sand text-caption font-medium text-ink">
                  2
                </span>
                <span>Scroll ke bawah dan pilih <strong>"Tambahkan ke Layar Utama"</strong> (<em>Add to Home Screen</em>).</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sand text-caption font-medium text-ink">
                  3
                </span>
                <span>Tekan <strong>Tambah (Add)</strong> di pojok kanan atas. Retalio siap dibuka seperti aplikasi native.</span>
              </li>
            </ol>
            <div className="mt-6">
              <Button full onClick={() => setShowIOSGuide(false)}>
                Mengerti
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
