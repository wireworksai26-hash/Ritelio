import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from './installPlatform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.12.108 (iPhone14,5; iOS 17_4; en_US; scale=3.00)';
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBDV/iPhone14,5]';
const IPHONE_UNKNOWN_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36';
const WINDOWS_PHONE =
  'Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 930) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537';

describe('detectInstallPlatform', () => {
  it('iPhone Safari: iOS, Safari asli, bukan iPad, bukan browser dalam aplikasi', () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI, platform: 'iPhone', maxTouchPoints: 5 })).toEqual({
      isIOS: true,
      isIPad: false,
      isInAppBrowser: false,
      isSafari: true,
    });
  });

  it('iPad modern (user-agent Mac + layar sentuh) dikenali sebagai iPad', () => {
    const r = detectInstallPlatform({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(r.isIOS).toBe(true);
    expect(r.isIPad).toBe(true);
    expect(r.isSafari).toBe(true);
  });

  it('Mac sungguhan (tanpa layar sentuh) bukan iOS', () => {
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }).isIOS).toBe(false);
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI }).isIOS).toBe(false);
  });

  it('iPad lama yang menyebut dirinya iPad tetap dikenali', () => {
    const ua = IPHONE_SAFARI.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS');
    expect(detectInstallPlatform({ userAgent: ua }).isIPad).toBe(true);
  });

  it('Chrome di iOS: iOS tetapi bukan Safari dan bukan browser dalam aplikasi', () => {
    const r = detectInstallPlatform({ userAgent: IPHONE_CHROME, platform: 'iPhone', maxTouchPoints: 5 });
    expect(r).toMatchObject({ isIOS: true, isInAppBrowser: false, isSafari: false });
  });

  it('Instagram dan Facebook di iOS dikenali sebagai browser dalam aplikasi', () => {
    for (const ua of [IPHONE_INSTAGRAM, IPHONE_FACEBOOK]) {
      const r = detectInstallPlatform({ userAgent: ua, platform: 'iPhone', maxTouchPoints: 5 });
      expect(r).toMatchObject({ isIOS: true, isInAppBrowser: true, isSafari: false });
    }
  });

  it('WebView iOS tanpa nama aplikasi tetap dianggap dalam aplikasi karena tidak punya token Safari/', () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_UNKNOWN_WEBVIEW }).isInAppBrowser).toBe(true);
  });

  it('Android dan Windows Phone bukan iOS', () => {
    expect(detectInstallPlatform({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l', maxTouchPoints: 5 }).isIOS).toBe(false);
    expect(detectInstallPlatform({ userAgent: WINDOWS_PHONE }).isIOS).toBe(false);
  });
});
