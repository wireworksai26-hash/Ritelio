-- ─────────────────────────────────────────────────────────────
-- Row-Level Security (defense-in-depth) — opsional.
-- Isolasi tenant UTAMA ditegakkan di application layer:
-- semua query service memfilter tenant_id + JwtAuthGuard memvalidasi
-- header X-Tenant-ID terhadap klaim tenant di token.
-- Script ini menambah proteksi level database untuk akses SQL langsung.
-- Cara pakai: psql "$DATABASE_URL" -f prisma/rls.sql
-- Catatan: saat RLS aktif, service wajib SET app.current_tenant_id
-- per sesi/transaksi (lihat komentar di bawah).
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'modules_config', 'users', 'outlets', 'product_categories', 'products',
    'warehouses', 'inventory_stock', 'stock_movements', 'suppliers',
    'purchase_orders', 'customers', 'sales_transactions', 'chart_of_accounts',
    'financial_entries', 'ai_insights_log', 'ai_usage_counters',
    'audit_logs', 'notifications', 'subscriptions'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true));',
      t
    );
  END LOOP;
END $$;

-- Contoh penggunaan per transaksi (jika RLS diaktifkan):
--   BEGIN;
--   SELECT set_config('app.current_tenant_id', '<tenant-uuid>', true);
--   -- ... query Prisma dengan $transaction yang sama ...
--   COMMIT;
