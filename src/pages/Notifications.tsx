import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { Icon, type IconName } from '../components/icons/Icon';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { timeAgo } from '../lib/format';
import { useBusinessStore } from '../stores/businessStore';
import { unreadCount, useNotificationStore } from '../stores/notificationStore';
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
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const pushNotification = useNotificationStore((s) => s.push);

  const products = useBusinessStore((s) => s.products);
  const stocks = useBusinessStore((s) => s.stocks);
  const tenant = useBusinessStore((s) => s.tenant);

  // Otomatis buat notifikasi riil saat ada produk yang stoknya menipis
  useEffect(() => {
    stocks.forEach((stk) => {
      if (stk.quantity <= stk.min_threshold) {
        const prod = products.find((p) => p.id === stk.product_id);
        if (prod) {
          pushNotification({
            id: `notif-lowstock-${prod.id}`,
            tenant_id: tenant.id,
            type: 'low_stock',
            title: `Stok menipis: ${prod.name}`,
            body: `Sisa ${stk.quantity} ${prod.unit} (ambang batas: ${stk.min_threshold}). Perlu restock.`,
            link: '/app/inventory',
            created_at: stk.last_updated || new Date().toISOString(),
            read: false,
          });
        }
      }
    });
  }, [products, stocks, tenant.id, pushNotification]);

  const tenantNotifications = notifications.filter((n) => !n.tenant_id || n.tenant_id === tenant.id);
  const unread = tenantNotifications.filter((n) => !n.read);
  const earlier = tenantNotifications.filter((n) => n.read);

  const renderItem = (n: AppNotification) => (
    <button
      key={n.id}
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
          {!n.read && <span className="w-2 h-2 rounded-full bg-chartreuse shrink-0" />}
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
        subtitle="Low stock, digest AI, approval, dan status sinkronisasi"
        actions={
          <div className="w-full sm:w-auto">
            <Button
              variant="ghost"
              icon="check"
              className="w-full sm:w-auto"
              disabled={unreadCount(notifications) === 0}
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

      {/* Info push notification */}
      <Reveal>
        <Card className="bg-sand border-transparent p-3.5 sm:p-4 flex gap-3">
          <Icon name="bell" size={18} className="text-smoke mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm text-ink">
              Notifikasi push aktif untuk Android & Desktop. Di iOS, notifikasi tampil sebagai
              badge in-app.
            </p>
            <Button
              variant="subtle"
              size="sm"
              icon="bell"
              className="mt-2.5"
              onClick={() => toast({ title: 'Izin push diminta (mock)', icon: 'bell' })}
            >
              Aktifkan Push Notification
            </Button>
          </div>
        </Card>
      </Reveal>

      {notifications.length === 0 ? (
        <Reveal delay={0.05}>
          <EmptyState
            icon="bell"
            title="Tidak ada notifikasi"
            body="Notifikasi low stock, digest AI, dan approval akan muncul di sini."
          />
        </Reveal>
      ) : (
        <>
          {unread.length > 0 && (
            <div>
              <p className="text-caption text-fossil mb-2">Belum dibaca</p>
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
