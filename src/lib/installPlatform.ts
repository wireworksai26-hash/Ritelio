export interface InstallPlatform {
  /** iPhone, iPod, atau iPad (termasuk iPadOS yang menyamar sebagai Mac). */
  isIOS: boolean;
  isIPad: boolean;
  /** Browser di dalam aplikasi lain (Instagram, Facebook, TikTok, dsb.): tidak bisa "Tambahkan ke Layar Utama". */
  isInAppBrowser: boolean;
  /** Safari asli. Hanya di sini letak tombol Bagikan dapat dipastikan (bawah di iPhone, atas di iPad). */
  isSafari: boolean;
}

interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

// Aplikasi yang membuka tautan di WebView-nya sendiri dan menaruh namanya di user-agent.
const IN_APP_MARKERS = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|Bytedance|Twitter|LinkedInApp/i;
// Browser pihak ketiga di iOS: tetap WebKit, tetapi bukan Safari sehingga posisi tombol Bagikan tidak pasti.
const IOS_THIRD_PARTY = /CriOS|EdgiOS|FxiOS|OPiOS|GSA\//i;

/**
 * Mendeteksi perangkat iOS untuk panduan pemasangan PWA. Safari di iPadOS 13+ melaporkan diri sebagai Mac,
 * jadi iPad dikenali dari Mac yang punya layar sentuh (Mac asli tidak punya titik sentuh).
 */
export function detectInstallPlatform(nav: NavigatorLike): InstallPlatform {
  const ua = nav.userAgent;
  const none: InstallPlatform = { isIOS: false, isIPad: false, isInAppBrowser: false, isSafari: false };
  if (/windows phone/i.test(ua)) return none;

  const iPhoneOrPod = /iPhone|iPod/i.test(ua);
  const iPad = /iPad/i.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  if (!iPhoneOrPod && !iPad) return none;

  // WebView aplikasi tidak memuat token "Safari/" pada user-agent-nya; Safari dan browser iOS lain memuatnya.
  const isInAppBrowser = IN_APP_MARKERS.test(ua) || !/Safari\//.test(ua);
  const isSafari = !isInAppBrowser && !IOS_THIRD_PARTY.test(ua);
  return { isIOS: true, isIPad: iPad, isInAppBrowser, isSafari };
}
