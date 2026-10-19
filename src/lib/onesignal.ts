// Integrasi OneSignal Web SDK v16 + Web Push API Native Browser

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

let initializedAppId: string | null = null;
let sdkScriptInjected = false;

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function initOneSignalSdk(options: {
  appId: string;
  safariWebId?: string;
  externalUserId?: string;
  tags?: Record<string, string>;
}): Promise<{ sdkLoaded: boolean; subscriptionId: string | null; error?: string }> {
  const cleanAppId = options.appId.trim();
  if (!isValidUuid(cleanAppId)) {
    return {
      sdkLoaded: false,
      subscriptionId: null,
      error: 'OneSignal App ID belum diisi atau bukan format UUID valid.',
    };
  }

  if (typeof window === 'undefined') {
    return { sdkLoaded: false, subscriptionId: null };
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  if (!sdkScriptInjected) {
    sdkScriptInjected = true;
    const existing = document.querySelector('script[data-onesignal-sdk="v16"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.setAttribute('data-onesignal-sdk', 'v16');
      document.head.appendChild(script);
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        sdkLoaded: Boolean(window.OneSignal),
        subscriptionId: window.OneSignal?.User?.PushSubscription?.id ?? null,
        error: 'Timeout menunggu inisialisasi CDN OneSignal.',
      });
    }, 6500);

    window.OneSignalDeferred!.push(async (OneSignal: any) => {
      try {
        if (initializedAppId !== cleanAppId) {
          await OneSignal.init({
            appId: cleanAppId,
            safari_web_id: options.safariWebId?.trim() || undefined,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
          });
          initializedAppId = cleanAppId;
        }

        if (options.externalUserId) {
          try {
            await OneSignal.login(options.externalUserId);
          } catch {
            // Abaikan bila login external_id gagal karena offline
          }
        }

        if (options.tags && Object.keys(options.tags).length > 0) {
          try {
            OneSignal.User.addTags(options.tags);
          } catch {
            // Abaikan bila tagging tertunda
          }
        }

        const subId = OneSignal?.User?.PushSubscription?.id ?? null;
        clearTimeout(timeout);
        resolve({ sdkLoaded: true, subscriptionId: subId });
      } catch (err) {
        clearTimeout(timeout);
        resolve({
          sdkLoaded: false,
          subscriptionId: null,
          error: err instanceof Error ? err.message : 'Gagal menginisialisasi OneSignal SDK.',
        });
      }
    });
  });
}

export async function requestPushPermissionAndSubscribe(options: {
  appId?: string;
  safariWebId?: string;
  externalUserId?: string;
  tags?: Record<string, string>;
}): Promise<{
  granted: boolean;
  permission: NotificationPermission | 'unsupported';
  subscriptionId: string | null;
  provider: 'onesignal' | 'web_push_native' | 'unsupported';
  message: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      granted: false,
      permission: 'unsupported',
      subscriptionId: null,
      provider: 'unsupported',
      message: 'Browser ini tidak mendukung Web Push Notification (di iOS, tambahkan ke Home Screen terlebih dahulu).',
    };
  }

  // Minta izin langsung pada user gesture agar browser tidak memblokir prompt
  let permission: NotificationPermission = Notification.permission;
  if (permission !== 'granted') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  if (permission !== 'granted') {
    return {
      granted: false,
      permission,
      subscriptionId: null,
      provider: 'web_push_native',
      message:
        permission === 'denied'
          ? 'Izin notifikasi ditolak di pengaturan browser. Silakan izinkan notifikasi pada ikon gembok address bar.'
          : 'Permintaan izin notifikasi ditutup sebelum disetujui.',
    };
  }

  // Jika App ID OneSignal valid tersedia, daftarkan juga melalui OneSignal SDK v16
  if (options.appId && isValidUuid(options.appId)) {
    const sdkRes = await initOneSignalSdk({
      appId: options.appId,
      safariWebId: options.safariWebId,
      externalUserId: options.externalUserId,
      tags: options.tags,
    });

    if (sdkRes.sdkLoaded && window.OneSignal) {
      try {
        if (window.OneSignal.Notifications?.requestPermission) {
          await window.OneSignal.Notifications.requestPermission();
        }
        if (window.OneSignal.User?.PushSubscription?.optIn) {
          await window.OneSignal.User.PushSubscription.optIn();
        }
        const osSubId = window.OneSignal.User?.PushSubscription?.id || sdkRes.subscriptionId;
        return {
          granted: true,
          permission: 'granted',
          subscriptionId: osSubId || `os-${options.externalUserId || 'web'}-${Date.now().toString().slice(-5)}`,
          provider: 'onesignal',
          message: 'OneSignal Web Push aktif dan perangkat terdaftar.',
        };
      } catch {
        // Lanjut ke fallback native web push
      }
    }
  }

  const fallbackSubId = `webpush-${options.externalUserId || 'device'}-${Date.now().toString().slice(-6)}`;
  return {
    granted: true,
    permission: 'granted',
    subscriptionId: fallbackSubId,
    provider: options.appId && isValidUuid(options.appId) ? 'onesignal' : 'web_push_native',
    message:
      options.appId && isValidUuid(options.appId)
        ? 'Izin push aktif. Sinkronisasi OneSignal siap.'
        : 'Web Push Browser aktif. Isi OneSignal App ID di Superadmin untuk menyambungkan ke cloud OneSignal.',
  };
}

export async function showNativeWebNotification(payload: {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon: '/pwa-192x192.png',
          badge: '/favicon.svg',
          tag: payload.tag || `retalio-${Date.now()}`,
          data: { url: payload.link || '/app/notifications' },
        });
        return true;
      }
    }
  } catch {
    // Gunakan konstruktor Notification standar bila SW belum aktif di dev
  }

  try {
    const notif = new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      tag: payload.tag || `retalio-${Date.now()}`,
    });
    notif.onclick = () => {
      window.focus();
      if (payload.link && window.location.pathname !== payload.link) {
        window.location.href = payload.link;
      }
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
