import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { Icon, type IconName } from '../components/icons/Icon';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { timeAgo } from '../lib/format';
import { isValidUuid, showNativeWebNotification } from '../lib/onesignal';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../stores/businessStore';
import { unreadCount, useNotificationStore } from '../stores/notificationStore';
import { useOneSignalStore } from '../stores/oneSignalStore';
import { toast } from '../stores/toastStore';
import type { AppNotification } from '../types';

const typeIcon: Record<AppNotification['type'], IconName> = {
  low_stock: 'inventory',
  insight_digest: 'assistant',
  approval: 'document',
  sync_conflict: 'warning',
};

export default function Notifications() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const pushNotification = useNotificationStore((s) => s.push);

  const products = useBusinessStore((s) => s.products);
  const stocks = useBusinessStore((s) => s.stocks);
  const tenant = useBusinessStore((s) => s.tenant);

  const oneSignal = useOneSignalStore();
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showChannelPrefs, setShowChannelPrefs] = useState(false);

  useEffect(() => {
    oneSignal.refreshPermissionState();
    void oneSignal.syncConfigFromServer();
  }, []);

  // Otomatis buat notifikasi riil saat ada produk yang stoknya menipis
  useEffect(() => {
    stocks.forEach((stk) => {
      if (stk.quantity <= stk.min_threshold) {
        const prod = products.find((p) => p.id === stk.product_id);
        if (prod) {
          const notifId = `notif-lowstock-${prod.id}`;
          const alreadyExists = notifications.some((n) => n.id === notifId);
          pushNotification({
            id: notifId,
            tenant_id: tenant.id,
            type: 'low_stock',
            title: `Stok menipis: ${prod.name}`,
            body: `Sisa ${stk.quantity} ${prod.unit} (ambang batas: ${stk.min_threshold}). Perlu restock.`,
            link: '/app/inventory',
            created_at: stk.last_updated || new Date().toISOString(),
            read: false,
          });
          if (!alreadyExists && oneSignal.isSubscribed && oneSignal.channels.lowStock) {
            void showNativeWebNotification({
              title: `Stok menipis: ${prod.name}`,
              body: `Sisa ${stk.quantity} ${prod.unit} (ambang batas: ${stk.min_threshold}).`,
              link: '/app/inventory',
              tag: notifId,
            });
          }
        }
      }
    });
  }, [products, stocks, tenant.id, pushNotification, notifications, oneSignal.isSubscribed, oneSignal.channels.lowStock]);

  const handleEnablePush = async () => {
    setIsEnablingPush(true);
    try {
      const activeUser = user ?? {
        id: 'u-guest',
        tenant_id: tenant.id,
        role: 'owner',
        email: 'owner@retalio.id',
      };
      const res = await oneSignal.enablePushForCurrentUser({
        id: activeUser.id,
        tenant_id: activeUser.tenant_id || tenant.id,
        role: activeUser.role,
        email: activeUser.email,
      });
      toast({
        title: res.granted ? 'Push Notification Diaktifkan' : 'Izin Push Belum Aktif',
        description: res.message,
        icon: res.granted ? 'check' : 'warning',
      });
    } finally {
      setIsEnablingPush(false);
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    try {
      const activeUser = user ?? {
        id: 'u-guest',
        tenant_id: tenant.id,
        name: 'Pengguna Retalio',
      };
      const res = await oneSignal.sendTestNotification({
        id: activeUser.id,
        tenant_id: activeUser.tenant_id || tenant.id,
        name: activeUser.name,
      });
      toast({
        title: 'Uji Push Terkirim',
        description: res.message,
        icon: 'bell',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const tenantNotifications = notifications.filter((n) => !n.tenant_id || n.tenant_id === tenant.id);
  const unread = tenantNotifications.filter((n) => !n.read);
  const earlier = tenantNotifications.filter((n) => n.read);

  const hasValidOneSignalAppId = isValidUuid(oneSignal.appId);
  const isGranted = oneSignal.permissionStatus === 'granted' && oneSignal.isSubscribed;

  const renderItem = (n: AppNotification) => (
    <button
      key={n.id}
      type="button"
      className="w-full text-left bg-paper border border-ash rounded-xl p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3 hover:border-pebble active:border-ink transition-colors"
      onClick={() => {
        markRead(n.id);
        navigate(n.link);
      }}
    >
      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-sand inline-flex items-center justify-center shrink-0">
        <Icon name={typeIcon[n.type]} size={16} className="text-smoke" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] sm:text-[15px] text-ink font-medium leading-snug">{n.title}</p>
          {!n.read && <span className="w-2 h-2 rounded-full bg-chartreuse shrink-0" aria-label="Belum dibaca" />}
        </div>
        <p className="text-body-sm text-fossil mt-0.5 leading-normal">{n.body}</p>
        <p className="text-caption text-pebble mt-1">{timeAgo(n.created_at)}</p>
      </div>
      <Icon name="chevron-right" size={16} className="text-pebble mt-1 shrink-0" />
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifikasi"
        subtitle="Peringatan stok menipis, digest AI, persetujuan dokumen, dan push real-time OneSignal."
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              variant="subtle"
              size="sm"
              icon="settings"
              onClick={() => setShowChannelPrefs((v) => !v)}
            >
              {showChannelPrefs ? 'Tutup Kanal' : 'Kanal Push'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="check"
              disabled={unreadCount(tenantNotifications) === 0}
              onClick={() => {
                markAllRead();
                toast({ title: 'Semua notifikasi ditandai dibaca', icon: 'check' });
              }}
            >
              Tandai semua dibaca
            </Button>
          </div>
        }
      />

      {/* Panel Status & Kontrol OneSignal Web Push */}
      <Reveal>
        <Card className="bg-sand/70 border-ash p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-paper border border-ash inline-flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="bell" size={18} className="text-ink" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-medium text-ink">
                    OneSignal Web &amp; Mobile Push Notification
                  </p>
                  {isGranted ? (
                    <Badge variant="accent" icon="check">
                      {hasValidOneSignalAppId ? 'OneSignal Cloud Aktif' : 'Web Push Aktif'}
                    </Badge>
                  ) : oneSignal.permissionStatus === 'denied' ? (
                    <Badge variant="ink" icon="warning">
                      Izin Browser Ditolak
                    </Badge>
                  ) : (
                    <Badge variant="outline">Belum Diaktifkan</Badge>
                  )}
                  {hasValidOneSignalAppId && (
                    <Badge variant="neutral">App ID Terhubung</Badge>
                  )}
                </div>
                <p className="text-body-sm text-fossil">
                  {isGranted
                    ? `Perangkat ini telah terdaftar untuk menerima push notification real-time${oneSignal.subscriptionId ? ` (ID: ${oneSignal.subscriptionId})` : ''}.`
                    : 'Aktifkan izin push agar peringatan stok kritis, persetujuan PO, dan pengumuman sistem muncul langsung di layar perangkat Anda.'}
                </p>
                {oneSignal.lastError && !isGranted && (
                  <p className="text-caption text-ink bg-paper/80 border border-ash rounded-lg px-2.5 py-1.5 mt-1">
                    Status: {oneSignal.lastError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant={isGranted ? 'subtle' : 'primary'}
                size="sm"
                icon="bell"
                disabled={isEnablingPush}
                onClick={handleEnablePush}
              >
                {isEnablingPush
                  ? 'Meminta Izin...'
                  : isGranted
                    ? 'Sinkron Ulang Push'
                    : 'Aktifkan Push Notification'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="megaphone"
                disabled={isSendingTest}
                onClick={handleSendTestPush}
              >
                {isSendingTest ? 'Mengirim...' : 'Uji Kirim Push'}
              </Button>
              {user?.role === 'superadmin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon="settings"
                  onClick={() => navigate('/app/superadmin')}
                >
                  Atur OneSignal
                </Button>
              )}
            </div>
          </div>

          {showChannelPrefs && (
            <div className="pt-4 border-t border-ash/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  key: 'lowStock' as const,
                  label: 'Peringatan Stok Menipis',
                  desc: 'Push otomatis saat stok menyentuh ambang minimum',
                },
                {
                  key: 'approval' as const,
                  label: 'Persetujuan Dokumen',
                  desc: 'Notifikasi PO, jurnal, dan pengajuan baru',
                },
                {
                  key: 'aiDigest' as const,
                  label: 'Digest AI & Insight',
                  desc: 'Ringkasan anomali margin dan rekomendasi AI',
                },
                {
                  key: 'syncConflict' as const,
                  label: 'Status Sinkronisasi POS',
                  desc: 'Peringatan bila ada antrean transaksi offline',
                },
              ].map((ch) => (
                <div
                  key={ch.key}
                  className="bg-paper border border-ash rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink truncate">{ch.label}</p>
                    <p className="text-[11.5px] text-fossil leading-snug mt-0.5">{ch.desc}</p>
                  </div>
                  <Toggle
                    checked={oneSignal.channels[ch.key]}
                    label={ch.label}
                    onChange={(val) => {
                      oneSignal.setChannelToggle(ch.key, val);
                      toast({
                        title: `Kanal ${ch.label} ${val ? 'diaktifkan' : 'dinonaktifkan'}`,
                        icon: 'check',
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>

      {tenantNotifications.length === 0 ? (
        <Reveal delay={0.05}>
          <EmptyState
            icon="bell"
            title="Tidak ada notifikasi"
            body="Notifikasi low stock, digest AI, dan approval akan muncul di sini. Gunakan tombol Uji Kirim Push di atas untuk mengetes pengiriman."
          />
        </Reveal>
      ) : (
        <>
          {unread.length > 0 && (
            <div>
              <p className="text-caption text-fossil mb-2">Belum dibaca ({unread.length})</p>
              <Reveal delay={0.04} stagger={0.04}>
                <div className="space-y-2">{unread.map(renderItem)}</div>
              </Reveal>
            </div>
          )}
          {earlier.length > 0 && (
            <div className="mt-4">
              <p className="text-caption text-fossil mb-2">Sebelumnya</p>
              <Reveal delay={0.08} stagger={0.04}>
                <div className="space-y-2">{earlier.map(renderItem)}</div>
              </Reveal>
            </div>
          )}
        </>
      )}
    </div>
  );
}
