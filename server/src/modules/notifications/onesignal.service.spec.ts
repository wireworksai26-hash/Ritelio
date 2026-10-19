import { describe, expect, it, vi } from 'vitest';
import { OneSignalService } from './onesignal.service';

describe('OneSignalService', () => {
  const createMockPrisma = () => ({
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ settings: {} }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    },
    notification: {
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'notif-1', ...data })),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'u-1' }]),
    },
  });

  it('menyimpan konfigurasi OneSignal dan menyensor REST API Key pada publicConfig', async () => {
    const prisma = createMockPrisma();
    const service = new OneSignalService(prisma as any);

    await service.updateConfig('tenant-1', {
      appId: '11111111-2222-4333-8444-555555555555',
      restApiKey: 'os_v2_app_secretkey1234567890',
      enabled: true,
      channels: { lowStock: true, approval: false },
    });

    const pub = service.getPublicConfig();
    expect(pub.enabled).toBe(true);
    expect(pub.configured).toBe(true);
    expect(pub.appId).toBe('11111111-2222-4333-8444-555555555555');
    expect(pub.hasRestApiKey).toBe(true);
    expect(pub.maskedRestApiKey).toBe('os_v2_...7890');
    expect(pub.channels.approval).toBe(false);
  });

  it('mendaftarkan subscription perangkat dan mencatat broadcast fallback bila OneSignal belum diisi', async () => {
    const prisma = createMockPrisma();
    const service = new OneSignalService(prisma as any);

    const sub = service.registerSubscription('tenant-1', 'u-1', {
      subscriptionId: 'onesignal-sub-abc',
      deviceType: 'Chrome Desktop',
      permissionGranted: true,
    });
    expect(sub.ok).toBe(true);
    expect(sub.subscription.subscriptionId).toBe('onesignal-sub-abc');

    const res = await service.sendTestPush('tenant-1', 'u-1', {
      title: 'Tes Notifikasi',
      body: 'Isi pesan uji coba',
    });
    expect(res.ok).toBe(true);
    expect(res.delivery.mode).toBe('inapp_fallback');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
