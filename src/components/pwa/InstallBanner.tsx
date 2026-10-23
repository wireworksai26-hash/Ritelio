import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { LogoMark } from '../layout/Logo';
import { Icon } from '../icons/Icon';
import { detectInstallPlatform, type InstallPlatform } from '../../lib/installPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'retalio-install-dismissed';

const NOT_IOS: InstallPlatform = { isIOS: false, isIPad: false, isInAppBrowser: false, isSafari: false };

// Ikon tombol Bagikan iOS (kotak dengan panah ke atas), supaya pengguna tahu persis tombol yang dicari.
function ShareGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block align-text-bottom"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function ArrowGlyph({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={direction === 'up' ? 'rotate-180' : undefined}
    >
      <path d="M12 4v16" />
      <path d="M6 14l6 6 6-6" />
    </svg>
  );
}

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [platform, setPlatform] = useState<InstallPlatform>(NOT_IOS);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { isIOS, isIPad, isInAppBrowser, isSafari } = platform;

  useEffect(() => {
    // Deteksi iOS (iPhone, iPad, dan iPadOS yang menyamar sebagai Mac)
    setPlatform(detectInstallPlatform(window.navigator));

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

  const device = isIPad ? 'iPad' : 'iPhone';
  // Posisi tombol Bagikan hanya pasti di Safari: bilah bawah di iPhone, pojok kanan atas di iPad.
  const shareLocation = isSafari
    ? isIPad
      ? 'di pojok kanan atas Safari'
      : 'di menu bawah Safari'
    : 'di menu browser Anda';
  // Browser dalam aplikasi tidak punya "Tambahkan ke Layar Utama": arahkan ke Safari, bukan ke panduan.
  const needsSafari = !deferred && isIOS && isInAppBrowser;

  return (
    <>
      <div className="fixed bottom-20 lg:bottom-6 left-4 lg:left-6 z-50 w-[calc(100vw-2rem)] max-w-sm bg-paper border border-ash rounded-xl p-4 shadow-xl animate-fade-in">
        <div className="flex items-start gap-3">
          <LogoMark size={38} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-ink">Install Retalio App</p>
            <p className="text-caption text-fossil mt-0.5 leading-relaxed">
              {needsSafari
                ? 'Halaman ini terbuka di browser dalam aplikasi, yang tidak bisa memasang Retalio. Buka di Safari: ketuk ikon titik tiga atau kompas, lalu pilih "Buka di Safari".'
                : 'Akses cepat tanpa browser bar, mode kasir offline, & sinkronisasi otomatis.'}
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
              ) : isIOS && !needsSafari ? (
                <Button size="sm" onClick={() => setShowIOSGuide(true)}>
                  Cara Install di {device}
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

      {/* Modal panduan khusus iOS */}
      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-2xl bg-paper p-6 border border-ash shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="ios-install-title" className="text-heading-sm font-light text-ink">
                Install di {isIPad ? 'iPad' : 'iPhone'}
              </h3>
              <button
                aria-label="Tutup panduan"
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
                <span>
                  Tekan tombol <strong>Bagikan / Share</strong> <ShareGlyph /> (kotak dengan panah ke atas) {shareLocation}.
                </span>
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

          {/* Penunjuk ke tombol Bagikan, hanya di Safari tempat posisinya pasti */}
          {isSafari && (
            <div
              data-testid="share-pointer"
              className={
                isIPad
                  ? 'pointer-events-none fixed right-4 top-2 z-[80] flex flex-col items-center text-chartreuse animate-bounce'
                  : 'pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center text-chartreuse animate-bounce'
              }
            >
              {isIPad && <ArrowGlyph direction="up" />}
              <span className="rounded-full bg-paper px-3 py-1 text-caption font-medium text-ink shadow-lg">
                Ketuk Bagikan di sini
              </span>
              {!isIPad && <ArrowGlyph direction="down" />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
