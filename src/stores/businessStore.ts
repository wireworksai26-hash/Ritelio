import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiConfigured, apiFetch } from '../lib/api';
import { broadcastStateChange } from '../lib/broadcast';
import { toSalePayload } from '../lib/offlineQueue';
import { useModuleStore } from './moduleStore';
import type {
  Customer,
  FinancialEntry,
  IndustryTemplate,
  InventoryStock,
  Outlet,
  Product,
  ProductCategory,
  PurchaseOrder,
  Role,
  SalesTransaction,
  StockMovement,
  SubscriptionPlan,
  Supplier,
  Tenant,
  User,
  Warehouse,
} from '../types';

export interface OnboardingPayload {
  businessName: string;
  industry: IndustryTemplate;
  subscriptionPlan?: SubscriptionPlan;
  outletName: string;
  outletAddress: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  productName: string;
  productPrice: string;
  productCostPrice?: string;
  productUnit?: string;
  productStock: string;
}

// ─── Default Master Data (Persisted Local & Offline Baseline) ────────────────

const defaultTenant: Tenant = {
  id: 'tenant-newsem',
  name: 'Newsem Bakery',
  industry_template: 'manufacturing',
  subscription_plan: 'plus_ai',
  status: 'active',
  created_at: '2026-01-01T08:00:00Z',
  monthly_revenue: 124000000,
  outlets_count: 2,
  users_count: 4,
  ai_quota_used: 120,
  ai_quota_limit: 3000,
  settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
};

const defaultAllTenants: Tenant[] = [
  defaultTenant,
  {
    id: 'tenant-kopisenja',
    name: 'Kopi Senja',
    industry_template: 'retail',
    subscription_plan: 'plus_ai',
    status: 'active',
    created_at: '2026-01-12T09:30:00Z',
    monthly_revenue: 68500000,
    outlets_count: 2,
    users_count: 5,
    ai_quota_used: 340,
    ai_quota_limit: 1000,
    settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  },
  {
    id: 'tenant-rotinusantara',
    name: 'Roti Nusantara',
    industry_template: 'manufacturing',
    subscription_plan: 'custom',
    status: 'active',
    created_at: '2026-02-03T10:15:00Z',
    monthly_revenue: 215000000,
    outlets_count: 2,
    users_count: 5,
    ai_quota_used: 890,
    ai_quota_limit: 5000,
    settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  },
  {
    id: 'tenant-laundrysegar',
    name: 'Laundry Segar Jaya',
    industry_template: 'services',
    subscription_plan: 'basic',
    status: 'trial',
    created_at: '2026-03-10T11:00:00Z',
    monthly_revenue: 24800000,
    outlets_count: 2,
    users_count: 5,
    ai_quota_used: 0,
    ai_quota_limit: 0,
    settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  },
];

const defaultOutlets: Outlet[] = [
  { id: 'outlet-newsem-1', tenant_id: 'tenant-newsem', name: 'Newsem Bakery - Kitchen & Store Pusat', address: 'Jl. Roti Kencana No. 8, Jakarta Selatan' },
  { id: 'outlet-newsem-2', tenant_id: 'tenant-newsem', name: 'Newsem Bakery - Booth Express Mall', address: 'Grand Mall Lantai LG No. 12, Jakarta Pusat' },
];

const defaultWarehouses: Warehouse[] = [
  { id: 'wh-newsem-1', tenant_id: 'tenant-newsem', outlet_id: 'outlet-newsem-1', name: 'Gudang Produksi Roti & Bahan', location: 'Jl. Roti Kencana No. 8' },
  { id: 'wh-newsem-2', tenant_id: 'tenant-newsem', outlet_id: 'outlet-newsem-2', name: 'Display & Storage Express', location: 'Grand Mall Lantai LG' },
];

const defaultCategories: ProductCategory[] = [
  { id: 'cat-nb-1', tenant_id: 'tenant-newsem', name: 'Roti Manis & Isi', parent_id: null },
  { id: 'cat-nb-2', tenant_id: 'tenant-newsem', name: 'Roti Tawar & Artisan', parent_id: null },
  { id: 'cat-nb-3', tenant_id: 'tenant-newsem', name: 'Pastry & Croissant', parent_id: null },
  { id: 'cat-nb-4', tenant_id: 'tenant-newsem', name: 'Cake & Donat', parent_id: null },
];

const defaultProducts: Product[] = [
  { id: 'p-nb-1', tenant_id: 'tenant-newsem', category_id: 'cat-nb-2', sku: 'NB-RTI-001', barcode: '8991001001', name: 'Roti Tawar Gandum Premium', sell_price: 24000, cost_price: 12000, unit: 'loaf', custom_fields: { expired_days: 4 } },
  { id: 'p-nb-2', tenant_id: 'tenant-newsem', category_id: 'cat-nb-1', sku: 'NB-RTI-002', barcode: '8991001002', name: 'Roti Cokelat Keju Lumer', sell_price: 12000, cost_price: 5500, unit: 'pcs', custom_fields: { expired_days: 3 } },
  { id: 'p-nb-3', tenant_id: 'tenant-newsem', category_id: 'cat-nb-1', sku: 'NB-RTI-003', barcode: '8991001003', name: 'Roti Sisir Mentega Gula', sell_price: 15000, cost_price: 7000, unit: 'pcs', custom_fields: { expired_days: 3 } },
  { id: 'p-nb-4', tenant_id: 'tenant-newsem', category_id: 'cat-nb-3', sku: 'NB-PST-001', barcode: '8991001004', name: 'Croissant Butter Premium', sell_price: 28000, cost_price: 14000, unit: 'pcs', custom_fields: { expired_days: 2 } },
  { id: 'p-nb-5', tenant_id: 'tenant-newsem', category_id: 'cat-nb-3', sku: 'NB-PST-002', barcode: '8991001005', name: 'Almond Croissant Toast', sell_price: 35000, cost_price: 18000, unit: 'pcs', custom_fields: { expired_days: 2 } },
  { id: 'p-nb-6', tenant_id: 'tenant-newsem', category_id: 'cat-nb-4', sku: 'NB-DNT-001', barcode: '8991001006', name: 'Donat Kentang Glaze Cokelat', sell_price: 10000, cost_price: 4500, unit: 'pcs', custom_fields: { expired_days: 2 } },
  { id: 'p-nb-7', tenant_id: 'tenant-newsem', category_id: 'cat-nb-4', sku: 'NB-DNT-002', barcode: '8991001007', name: 'Donat Salju Gula Halus', sell_price: 9000, cost_price: 4000, unit: 'pcs', custom_fields: { expired_days: 2 } },
  { id: 'p-nb-8', tenant_id: 'tenant-newsem', category_id: 'cat-nb-2', sku: 'NB-RTI-004', barcode: '8991001008', name: 'Baguette French Bread', sell_price: 22000, cost_price: 10000, unit: 'pcs', custom_fields: { expired_days: 2 } },
];

const defaultStocks: InventoryStock[] = [
  { id: 'stk-nb-1', product_id: 'p-nb-1', warehouse_id: 'wh-newsem-1', quantity: 45, min_threshold: 10, last_updated: new Date().toISOString() },
  { id: 'stk-nb-2', product_id: 'p-nb-2', warehouse_id: 'wh-newsem-1', quantity: 60, min_threshold: 15, last_updated: new Date().toISOString() },
  { id: 'stk-nb-3', product_id: 'p-nb-3', warehouse_id: 'wh-newsem-1', quantity: 35, min_threshold: 10, last_updated: new Date().toISOString() },
  { id: 'stk-nb-4', product_id: 'p-nb-4', warehouse_id: 'wh-newsem-1', quantity: 6, min_threshold: 12, last_updated: new Date().toISOString() },
  { id: 'stk-nb-5', product_id: 'p-nb-5', warehouse_id: 'wh-newsem-1', quantity: 18, min_threshold: 8, last_updated: new Date().toISOString() },
  { id: 'stk-nb-6', product_id: 'p-nb-6', warehouse_id: 'wh-newsem-1', quantity: 4, min_threshold: 10, last_updated: new Date().toISOString() },
  { id: 'stk-nb-7', product_id: 'p-nb-7', warehouse_id: 'wh-newsem-1', quantity: 25, min_threshold: 10, last_updated: new Date().toISOString() },
  { id: 'stk-nb-8', product_id: 'p-nb-8', warehouse_id: 'wh-newsem-1', quantity: 15, min_threshold: 5, last_updated: new Date().toISOString() },
];

const defaultUsers: User[] = [
  {
    id: 'u-superadmin',
    tenant_id: 'tenant-global',
    name: 'Super Admin Retalio',
    email: 'superadmin@retalio.id',
    password: 'admin123',
    role: 'superadmin',
    permissions: {},
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-newsem-owner',
    tenant_id: 'tenant-newsem',
    name: 'Owner Newsem Bakery',
    email: 'owner@newsembakery.id',
    password: 'admin123',
    role: 'owner',
    outlet_id: 'outlet-newsem-1',
    permissions: {
      pos_access: true,
      inventory_access: true,
      finance_access: true,
      discount_permission: true,
      void_transaction: true,
      export_data: true,
      manage_products: true,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-newsem-ferry',
    tenant_id: 'tenant-newsem',
    name: 'Ferry (Manager)',
    email: 'ferry@newsembakery.id',
    password: 'ferry123',
    role: 'manager',
    outlet_id: 'outlet-newsem-1',
    permissions: {
      pos_access: true,
      inventory_access: true,
      finance_access: true,
      discount_permission: true,
      void_transaction: true,
      export_data: true,
      manage_products: true,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-newsem-kasir',
    tenant_id: 'tenant-newsem',
    name: 'Siti Rahma (Kasir)',
    email: 'kasir@newsembakery.id',
    password: 'admin123',
    role: 'cashier',
    outlet_id: 'outlet-newsem-1',
    permissions: {
      pos_access: true,
      inventory_access: false,
      finance_access: false,
      discount_permission: false,
      void_transaction: false,
      export_data: false,
      manage_products: false,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-kopisenja-owner',
    tenant_id: 'tenant-kopisenja',
    name: 'Rina Marlina (Owner Kopi Senja)',
    email: 'owner@kopisenja.test',
    password: 'admin123',
    role: 'owner',
    permissions: {
      pos_access: true,
      inventory_access: true,
      finance_access: true,
      discount_permission: true,
      void_transaction: true,
      export_data: true,
      manage_products: true,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-rotinusantara-owner',
    tenant_id: 'tenant-rotinusantara',
    name: 'Hendra Wijaya (Owner Roti Nusantara)',
    email: 'owner@rotinusantara.test',
    password: 'admin123',
    role: 'owner',
    permissions: {
      pos_access: true,
      inventory_access: true,
      finance_access: true,
      discount_permission: true,
      void_transaction: true,
      export_data: true,
      manage_products: true,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
  {
    id: 'u-laundrysegar-owner',
    tenant_id: 'tenant-laundrysegar',
    name: 'Siti Aminah (Owner Laundry Segar)',
    email: 'owner@laundrysegar.test',
    password: 'admin123',
    role: 'owner',
    permissions: {
      pos_access: true,
      inventory_access: true,
      finance_access: true,
      discount_permission: true,
      void_transaction: true,
      export_data: true,
      manage_products: true,
    },
    is_active: true,
    last_login: new Date().toISOString(),
  },
];

const defaultSuppliers: Supplier[] = [
  { id: 'sup-nb-1', tenant_id: 'tenant-newsem', name: 'PT Gandum Sejahtera Abadi', contact: '081299887766' },
  { id: 'sup-nb-2', tenant_id: 'tenant-newsem', name: 'CV Dairy Butter Nusantara', contact: '081344556677' },
];

const defaultPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-nb-1',
    tenant_id: 'tenant-newsem',
    supplier_id: 'sup-nb-2',
    warehouse_id: 'wh-newsem-1',
    status: 'ordered',
    created_at: new Date().toISOString(),
    items: [
      { product_id: 'p-nb-4', qty: 50, price: 13000 },
    ],
  },
];

const defaultCustomers: Customer[] = [
  { id: 'c-nb-1', tenant_id: 'tenant-newsem', name: 'Restoran Senja Bistro', contact: '081122334455', loyalty_points: 150 },
  { id: 'c-nb-2', tenant_id: 'tenant-newsem', name: 'Ibu Ratna Bakery Cafe', contact: '081233445566', loyalty_points: 80 },
];

const defaultTransactions: SalesTransaction[] = [
  {
    id: 'txn-nb-001',
    tenant_id: 'tenant-newsem',
    outlet_id: 'outlet-newsem-1',
    cashier_id: 'u-newsem-kasir',
    customer_id: 'c-nb-1',
    client_generated_id: 'cli-nb-001',
    sync_status: 'synced',
    client_timestamp: new Date().toISOString(),
    server_timestamp: new Date().toISOString(),
    total: 94000,
    payment_method: 'qris',
    items: [
      { product_id: 'p-nb-1', qty: 2, price: 24000 },
      { product_id: 'p-nb-2', qty: 2, price: 12000 },
      { product_id: 'p-nb-3', qty: 1, price: 15000 },
      { product_id: 'p-nb-7', qty: 1, price: 9000 },
    ],
  },
];

const defaultFinancialEntries: FinancialEntry[] = [
  {
    id: 'fe-nb-1',
    tenant_id: 'tenant-newsem',
    source_module: 'pos',
    source_ref_id: 'txn-nb-001',
    debit_account: 'Bank QRIS',
    credit_account: 'Penjualan Roti & Pastry',
    amount: 94000,
    entry_date: new Date().toISOString(),
    is_anomaly_flagged: false,
  },
];

const defaultMovements: StockMovement[] = [
  {
    id: 'mov-nb-1',
    product_id: 'p-nb-1',
    warehouse_id: 'wh-newsem-1',
    type: 'purchase',
    quantity: 50,
    note: 'Stok awal produksi',
    created_at: new Date().toISOString(),
  },
];

// ─── Store Interface ─────────────────────────────────────────────────────────

interface BusinessState {
  tenant: Tenant;
  allTenants: Tenant[];
  outlets: Outlet[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  products: Product[];
  stocks: InventoryStock[];
  transactions: SalesTransaction[];
  financialEntries: FinancialEntry[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  customers: Customer[];
  users: User[];
  isSyncing: boolean;

  // Actions
  fetchBusinessData: () => Promise<void>;
  registerBusiness: (data: OnboardingPayload) => { tenant: Tenant; outlet: Outlet; product: Product; ownerUser: User };
  resetToDemo: () => void;
  updateTenant: (updates: Partial<Tenant>) => void;
  switchActiveTenant: (tenantId: string) => Tenant | null;
  upsertTenantInList: (tenant: Tenant & { modules?: Record<string, boolean> }) => void;
  deleteTenantFromList: (tenantId: string) => void;
  setSubscriptionPlan: (plan: SubscriptionPlan) => void;
  addOutlet: (outlet: Outlet) => void;
  addCategory: (category: ProductCategory) => void;
  addProduct: (product: Product, initialStock?: number) => void;
  updateProduct: (id: string, updates: Partial<Product>, newStockQty?: number) => void;
  deleteProduct: (id: string) => void;
  addTransaction: (tx: SalesTransaction) => void;
  addFinancialEntry: (entry: FinancialEntry) => void;
  adjustStock: (productId: string, warehouseId: string, delta: number, reason: string) => void;
  addUser: (user: User) => void;
  updateUserById: (userId: string, updates: Partial<User>) => void;
  updateUserPermissions: (userId: string, permissions: Record<string, boolean>) => void;
  updateUserRole: (userId: string, role: Role) => void;
  deleteUser: (userId: string) => void;
  toggleUserStatus: (userId: string) => void;
  updateUserPassword: (email: string, newPassword: string) => boolean;
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      tenant: defaultTenant,
      allTenants: defaultAllTenants,
      outlets: defaultOutlets,
      warehouses: defaultWarehouses,
      categories: defaultCategories,
      products: defaultProducts,
      stocks: defaultStocks,
      transactions: defaultTransactions,
      financialEntries: defaultFinancialEntries,
      suppliers: defaultSuppliers,
      purchaseOrders: defaultPurchaseOrders,
      stockMovements: defaultMovements,
      customers: defaultCustomers,
      users: defaultUsers,
      isSyncing: false,

      fetchBusinessData: async () => {
        if (!apiConfigured()) return;
        set({ isSyncing: true });
        try {
          const [productsRes, categoriesRes, warehousesRes, stocksRes, outletsRes, txRes, finRes] = await Promise.allSettled([
            apiFetch<any>('/v1/inventory/products'),
            apiFetch<any>('/v1/inventory/categories'),
            apiFetch<any>('/v1/inventory/warehouses'),
            apiFetch<any>('/v1/inventory/stock'),
            apiFetch<any>('/v1/outlets'),
            apiFetch<any>('/v1/sales/transactions'),
            apiFetch<any>('/v1/finance/entries'),
          ]);

          const updates: Partial<BusinessState> = {};

          const rawProducts =
            productsRes.status === 'fulfilled'
              ? Array.isArray(productsRes.value)
                ? productsRes.value
                : Array.isArray((productsRes.value as any)?.data)
                  ? (productsRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawProducts)) {
            updates.products = rawProducts.map((p: any) => ({
              id: p.id,
              tenant_id: p.tenantId,
              sku: p.sku,
              barcode: p.barcode,
              name: p.name,
              category_id: p.categoryId,
              unit: p.unit,
              sell_price: Number(p.sellPrice),
              cost_price: Number(p.costPrice),
              custom_fields: p.customFields || {},
            }));
          }

          const rawCategories =
            categoriesRes.status === 'fulfilled'
              ? Array.isArray(categoriesRes.value)
                ? categoriesRes.value
                : Array.isArray((categoriesRes.value as any)?.data)
                  ? (categoriesRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawCategories)) {
            updates.categories = rawCategories.map((c: any) => ({
              id: c.id,
              tenant_id: c.tenantId,
              name: c.name,
              parent_id: c.parentId,
            }));
          }

          const rawWarehouses =
            warehousesRes.status === 'fulfilled'
              ? Array.isArray(warehousesRes.value)
                ? warehousesRes.value
                : Array.isArray((warehousesRes.value as any)?.data)
                  ? (warehousesRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawWarehouses)) {
            updates.warehouses = rawWarehouses.map((w: any) => ({
              id: w.id,
              tenant_id: w.tenantId,
              outlet_id: w.outletId,
              name: w.name,
              location: w.location,
            }));
          }

          const rawStocks =
            stocksRes.status === 'fulfilled'
              ? Array.isArray(stocksRes.value)
                ? stocksRes.value
                : Array.isArray((stocksRes.value as any)?.data)
                  ? (stocksRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawStocks)) {
            updates.stocks = rawStocks.map((s: any) => ({
              id: s.id,
              product_id: s.productId,
              warehouse_id: s.warehouseId,
              quantity: Number(s.quantity),
              min_threshold: Number(s.minThreshold),
              last_updated: s.lastUpdated,
            }));
          }

          const rawOutlets =
            outletsRes.status === 'fulfilled'
              ? Array.isArray(outletsRes.value)
                ? outletsRes.value
                : Array.isArray((outletsRes.value as any)?.data)
                  ? (outletsRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawOutlets)) {
            updates.outlets = rawOutlets.map((o: any) => ({
              id: o.id,
              tenant_id: o.tenantId,
              name: o.name,
              address: o.address,
            }));
          }

          const rawTx =
            txRes.status === 'fulfilled'
              ? Array.isArray(txRes.value)
                ? txRes.value
                : Array.isArray((txRes.value as any)?.data)
                  ? (txRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawTx)) {
            updates.transactions = rawTx.map((t: any) => ({
              id: t.id,
              tenant_id: t.tenantId,
              outlet_id: t.outletId,
              cashier_id: t.cashierId,
              customer_id: t.customerId,
              client_generated_id: t.clientGeneratedId,
              sync_status: t.syncStatus,
              client_timestamp: t.clientTimestamp,
              server_timestamp: t.serverTimestamp,
              total: Number(t.total),
              payment_method: t.paymentMethod,
              items: (t.items || []).map((i: any) => ({
                id: i.id,
                product_id: i.productId,
                qty: Number(i.qty),
                price: Number(i.price),
              })),
            }));
          }

          const rawFin =
            finRes.status === 'fulfilled'
              ? Array.isArray(finRes.value)
                ? finRes.value
                : Array.isArray((finRes.value as any)?.data)
                  ? (finRes.value as any).data
                  : null
              : null;

          if (Array.isArray(rawFin)) {
            updates.financialEntries = rawFin.map((f: any) => ({
              id: f.id,
              tenant_id: f.tenantId,
              source_module: f.sourceModule,
              source_ref_id: f.sourceRefId,
              debit_account: f.debitAccountId || 'Kas',
              credit_account: f.creditAccountId || 'Pendapatan',
              amount: Number(f.amount),
              entry_date: f.entryDate,
              is_anomaly_flagged: f.isAnomalyFlagged,
            }));
          }

          if (Object.keys(updates).length > 0) {
            set((state) => ({ ...state, ...updates }));
            broadcastStateChange('DATA_SYNC', updates);
          }
        } catch {
          // Offline mode / server starting up
        } finally {
          set({ isSyncing: false });
        }
      },

      registerBusiness: (data) => {
        const tenantId = `tenant-${Date.now()}`;
        const bName = data.businessName.trim() || 'Bisnis Saya';
        const cleanSlug = bName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'usaha';
        const oName = data.outletName.trim() || 'Cabang Utama';
        const pName = data.productName.trim() || 'Produk Pertama';
        const pPrice = Math.max(1000, Number(data.productPrice) || 25000);
        const pCost = data.productCostPrice ? Number(data.productCostPrice) : Math.round(pPrice * 0.6);
        const pUnit = data.productUnit || (data.industry === 'services' ? 'layanan' : data.industry === 'manufacturing' ? 'unit' : 'pcs');
        const pStock = Math.max(0, Number(data.productStock) || (data.industry === 'services' ? 100 : 50));

        const ownerDisplayName = data.ownerName?.trim() || `Owner (${bName})`;
        const ownerEmailAddr = data.ownerEmail?.trim() || `owner@${cleanSlug}.id`;
        const ownerPass = data.ownerPassword?.trim() || '123456';
        const chosenPlan: SubscriptionPlan = data.subscriptionPlan || 'basic';

        const newTenant: Tenant = {
          id: tenantId,
          name: bName,
          industry_template: data.industry || 'retail',
          subscription_plan: chosenPlan,
          status: 'active',
          created_at: new Date().toISOString(),
          monthly_revenue: 0,
          outlets_count: 1,
          users_count: 1,
          ai_quota_used: 0,
          ai_quota_limit: chosenPlan === 'basic' ? 0 : chosenPlan === 'plus_ai' ? 1000 : 99999,
          settings: { currency: 'IDR', timezone: 'Asia/Jakarta' },
        };

        useModuleStore.getState().setModuleActive('assistant', chosenPlan !== 'basic');

        const newOutlet: Outlet = {
          id: `outlet-${Date.now()}`,
          tenant_id: tenantId,
          name: oName,
          address: data.outletAddress.trim() || 'Pusat',
        };

        const newWarehouse: Warehouse = {
          id: `wh-${Date.now()}`,
          tenant_id: tenantId,
          outlet_id: newOutlet.id,
          name: `Gudang ${oName}`,
          location: data.outletAddress.trim() || 'Pusat',
        };

        let categoryNames = ['Makanan & Minuman', 'Snack & Tambahan', 'Katalog Utama'];
        if (data.industry === 'manufacturing') {
          categoryNames = ['Barang Jadi', 'Bahan Baku', 'Kemasan & Pendukung'];
        } else if (data.industry === 'services') {
          categoryNames = ['Layanan Utama', 'Paket Treatment & Jasa', 'Produk Pendukung'];
        }

        const newCategories: ProductCategory[] = categoryNames.map((name, idx) => ({
          id: `cat-${Date.now()}-${idx}`,
          tenant_id: tenantId,
          name,
          parent_id: null,
        }));

        const primaryCat = newCategories[0];

        const newProduct: Product = {
          id: `prod-${Date.now()}`,
          tenant_id: tenantId,
          category_id: primaryCat.id,
          sku: `SKU-${Date.now().toString().slice(-4)}`,
          barcode: `899${Date.now().toString().slice(-9)}`,
          name: pName,
          sell_price: pPrice,
          cost_price: pCost,
          unit: pUnit,
          custom_fields: {},
        };

        const newStock: InventoryStock = {
          id: `stk-${Date.now()}`,
          product_id: newProduct.id,
          warehouse_id: newWarehouse.id,
          quantity: pStock,
          min_threshold: data.industry === 'services' ? 5 : 10,
          last_updated: new Date().toISOString(),
        };

        const newMovement: StockMovement = {
          id: `mov-${Date.now()}`,
          product_id: newProduct.id,
          warehouse_id: newWarehouse.id,
          type: 'purchase',
          quantity: pStock,
          note: 'Stok awal setup usaha',
          created_at: new Date().toISOString(),
        };

        const newOwnerUser: User = {
          id: `u-${Date.now()}`,
          tenant_id: tenantId,
          name: ownerDisplayName,
          email: ownerEmailAddr,
          password: ownerPass,
          role: 'owner',
          outlet_id: newOutlet.id,
          permissions: {
            pos_access: true,
            inventory_access: true,
            finance_access: true,
            discount_permission: true,
            void_transaction: true,
            export_data: true,
            manage_products: true,
          },
          is_active: true,
          last_login: new Date().toISOString(),
        };

        set({
          tenant: newTenant,
          allTenants: [newTenant],
          outlets: [newOutlet],
          warehouses: [newWarehouse],
          categories: newCategories,
          products: [newProduct],
          stocks: [newStock],
          stockMovements: [newMovement],
          users: [newOwnerUser],
          transactions: [],
          financialEntries: [],
          suppliers: [],
          purchaseOrders: [],
          customers: [],
        });

        return { tenant: newTenant, outlet: newOutlet, product: newProduct, ownerUser: newOwnerUser };
      },

      resetToDemo: () => {
        set({
          tenant: defaultTenant,
          allTenants: defaultAllTenants,
          outlets: defaultOutlets,
          warehouses: defaultWarehouses,
          categories: defaultCategories,
          products: defaultProducts,
          stocks: defaultStocks,
          transactions: defaultTransactions,
          financialEntries: defaultFinancialEntries,
          suppliers: defaultSuppliers,
          purchaseOrders: defaultPurchaseOrders,
          stockMovements: defaultMovements,
          customers: defaultCustomers,
          users: defaultUsers,
        });
      },

      updateTenant: (updates) => {
        set((state) => ({
          tenant: { ...state.tenant, ...updates },
          allTenants: state.allTenants.map((t) => (t.id === state.tenant.id ? { ...t, ...updates } : t)),
        }));
      },

      switchActiveTenant: (tenantId) => {
        const state = get();
        const found = state.allTenants.find((t) => t.id === tenantId);
        if (!found) return null;
        set({ tenant: found });
        useModuleStore.getState().setTemplate(found.industry_template);
        useModuleStore.getState().setModuleActive('assistant', found.subscription_plan !== 'basic');
        broadcastStateChange('DATA_SYNC', { tenant: found });
        return found;
      },

      upsertTenantInList: (tenant) => {
        let payload: any = null;
        set((state) => {
          const exists = state.allTenants.some((t) => t.id === tenant.id);
          const nextAll = exists
            ? state.allTenants.map((t) => (t.id === tenant.id ? { ...t, ...tenant } : t))
            : [tenant, ...state.allTenants];
          const nextActive = state.tenant.id === tenant.id ? { ...state.tenant, ...tenant } : state.tenant;
          payload = { allTenants: nextAll, tenant: nextActive };
          return payload;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      deleteTenantFromList: (tenantId) => {
        let payload: any = null;
        set((state) => {
          const remaining = state.allTenants.filter((t) => t.id !== tenantId);
          if (remaining.length === 0) return state;
          const nextActive = state.tenant.id === tenantId ? remaining[0] : state.tenant;
          const nextUsers = state.users.filter((u) => u.tenant_id !== tenantId);
          payload = { allTenants: remaining, tenant: nextActive, users: nextUsers };
          return payload;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      setSubscriptionPlan: (plan) => {
        set((state) => {
          const updatedTenant = {
            ...state.tenant,
            subscription_plan: plan,
            ai_quota_limit: plan === 'basic' ? 0 : plan === 'plus_ai' ? 1000 : 99999,
          };
          const updatedAll = state.allTenants.map((t) => (t.id === updatedTenant.id ? updatedTenant : t));
          return { tenant: updatedTenant, allTenants: updatedAll };
        });
        useModuleStore.getState().setModuleActive('assistant', plan !== 'basic');
      },

      addOutlet: (outlet) => {
        let payload: any = null;
        set((state) => {
          const next = {
            outlets: [...state.outlets, outlet],
            tenant: { ...state.tenant, outlets_count: state.outlets.length + 1 },
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      addCategory: (category) => {
        let payload: any = null;
        set((state) => {
          const next = { categories: [...state.categories, category] };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      addProduct: (product, initialStock = 0) => {
        let payload: any = null;
        set((state) => {
          const currentWh = state.warehouses[0]?.id || 'wh-newsem-1';
          const newStock: InventoryStock = {
            id: `stk-${Date.now()}`,
            product_id: product.id,
            warehouse_id: currentWh,
            quantity: initialStock,
            min_threshold: 10,
            last_updated: new Date().toISOString(),
          };
          const next = {
            products: [product, ...state.products],
            stocks: [...state.stocks, newStock],
          };
          payload = next;
          return next;
        });

        if (payload) {
          broadcastStateChange('PRODUCT_UPDATED', payload);
          broadcastStateChange('STOCK_UPDATED', payload);
        }

        // Sync to backend API in background
        if (apiConfigured()) {
          apiFetch('/v1/inventory/products', {
            method: 'POST',
            body: JSON.stringify({
              name: product.name,
              sku: product.sku,
              barcode: product.barcode,
              categoryId: product.category_id,
              sellPrice: product.sell_price,
              costPrice: product.cost_price,
              unit: product.unit,
              customFields: product.custom_fields,
            }),
          }).catch(() => {});
        }
      },

      updateProduct: (id, updates, newStockQty) => {
        let payload: any = null;
        set((state) => {
          const updatedProducts = state.products.map((p) => (p.id === id ? { ...p, ...updates } : p));
          let updatedStocks = state.stocks;
          if (newStockQty !== undefined) {
            const hasStock = state.stocks.some((s) => s.product_id === id);
            if (hasStock) {
              updatedStocks = state.stocks.map((s) =>
                s.product_id === id
                  ? { ...s, quantity: Math.max(0, newStockQty), last_updated: new Date().toISOString() }
                  : s,
              );
            } else {
              const currentWh = state.warehouses[0]?.id || 'wh-newsem-1';
              updatedStocks = [
                ...state.stocks,
                {
                  id: `stk-${Date.now()}`,
                  product_id: id,
                  warehouse_id: currentWh,
                  quantity: Math.max(0, newStockQty),
                  min_threshold: 10,
                  last_updated: new Date().toISOString(),
                },
              ];
            }
          }
          const next = { products: updatedProducts, stocks: updatedStocks };
          payload = next;
          return next;
        });

        if (payload) {
          broadcastStateChange('PRODUCT_UPDATED', payload);
          broadcastStateChange('STOCK_UPDATED', payload);
        }
      },

      deleteProduct: (id) => {
        let payload: any = null;
        set((state) => {
          const next = {
            products: state.products.filter((p) => p.id !== id),
            stocks: state.stocks.filter((s) => s.product_id !== id),
            stockMovements: state.stockMovements.filter((m) => m.product_id !== id),
          };
          payload = next;
          return next;
        });

        if (payload) {
          broadcastStateChange('PRODUCT_UPDATED', payload);
          broadcastStateChange('STOCK_UPDATED', payload);
        }

        if (apiConfigured()) {
          apiFetch(`/v1/inventory/products/${id}`, { method: 'DELETE' }).catch(() => {});
        }
      },

      addTransaction: (tx) => {
        let payload: any = null;
        set((state) => {
          // Kurangi stok produk secara otomatis dan konsisten di semua gudang
          const updatedStocks = [...state.stocks];
          tx.items.forEach((item) => {
            const idx = updatedStocks.findIndex((s) => s.product_id === item.product_id);
            if (idx >= 0) {
              updatedStocks[idx] = {
                ...updatedStocks[idx],
                quantity: Math.max(0, updatedStocks[idx].quantity - item.qty),
                last_updated: new Date().toISOString(),
              };
            } else {
              const currentWh = state.warehouses[0]?.id || 'wh-newsem-1';
              updatedStocks.push({
                id: `stk-${Date.now()}`,
                product_id: item.product_id,
                warehouse_id: currentWh,
                quantity: 0,
                min_threshold: 10,
                last_updated: new Date().toISOString(),
              });
            }
          });

          // Buat entri keuangan otomatis
          const newEntry: FinancialEntry = {
            id: `fin-${Date.now()}`,
            tenant_id: state.tenant.id,
            source_module: 'pos',
            source_ref_id: tx.id,
            debit_account: tx.payment_method === 'cash' ? 'Kas Toko' : 'Bank QRIS',
            credit_account: 'Pendapatan Penjualan',
            amount: tx.total,
            entry_date: tx.client_timestamp,
            is_anomaly_flagged: false,
          };

          const next = {
            transactions: [tx, ...state.transactions],
            stocks: updatedStocks,
            financialEntries: [newEntry, ...state.financialEntries],
            tenant: {
              ...state.tenant,
              monthly_revenue: (state.tenant.monthly_revenue || 0) + tx.total,
            },
          };
          payload = next;
          return next;
        });

        if (payload) {
          broadcastStateChange('TRANSACTION_ADDED', payload);
          broadcastStateChange('STOCK_UPDATED', payload);
        }

        // Kirim transaksi ke backend. Bila gagal (offline, server mati, ditolak), transaksi
        // masuk antrean lokal yang dikirim ulang saat koneksi pulih — tidak boleh hilang diam-diam.
        if (apiConfigured()) {
          const body = toSalePayload(tx);
          apiFetch('/v1/sales/transactions', { method: 'POST', body: JSON.stringify(body) })
            .then(() => {
              set((state) => ({
                transactions: state.transactions.map((t) =>
                  t.id === tx.id ? { ...t, sync_status: 'synced' as const, server_timestamp: new Date().toISOString() } : t,
                ),
              }));
            })
            .catch(() => {
              void import('./syncStore').then(({ useSyncStore }) => {
                useSyncStore.getState().queueTransaction(tx);
                if (typeof navigator === 'undefined' || navigator.onLine) void useSyncStore.getState().syncNow();
              });
            });
        }
      },

      addFinancialEntry: (entry) => {
        let payload: any = null;
        set((state) => {
          const next = {
            financialEntries: [entry, ...state.financialEntries],
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      adjustStock: (productId, warehouseId, delta, reason) => {
        let payload: any = null;
        set((state) => {
          let found = false;
          const updatedStocks = state.stocks.map((s) => {
            if (s.product_id === productId && (!warehouseId || s.warehouse_id === warehouseId)) {
              found = true;
              return {
                ...s,
                quantity: Math.max(0, s.quantity + delta),
                last_updated: new Date().toISOString(),
              };
            }
            return s;
          });

          if (!found) {
            const wh = warehouseId || state.warehouses[0]?.id || 'wh-newsem-1';
            updatedStocks.push({
              id: `stk-${Date.now()}`,
              product_id: productId,
              warehouse_id: wh,
              quantity: Math.max(0, delta),
              min_threshold: 10,
              last_updated: new Date().toISOString(),
            });
          }

          const newMovement: StockMovement = {
            id: `mov-${Date.now()}`,
            product_id: productId,
            warehouse_id: warehouseId || state.warehouses[0]?.id || 'wh-newsem-1',
            type: delta >= 0 ? 'purchase' : 'adjustment',
            quantity: Math.abs(delta),
            note: reason,
            created_at: new Date().toISOString(),
          };

          const next = {
            stocks: updatedStocks,
            stockMovements: [newMovement, ...state.stockMovements],
          };
          payload = next;
          return next;
        });

        if (payload) broadcastStateChange('STOCK_UPDATED', payload);

        if (apiConfigured()) {
          apiFetch('/v1/inventory/stock/adjust', {
            method: 'POST',
            body: JSON.stringify({
              productId,
              warehouseId,
              qty: delta,
              note: reason,
            }),
          }).catch(() => {});
        }
      },

      addUser: (user) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: [user, ...state.users],
            tenant: { ...state.tenant, users_count: (state.tenant.users_count || 1) + 1 },
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      updateUserById: (userId, updates) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: state.users.map((u) => (u.id === userId ? { ...u, ...updates } : u)),
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      updateUserPermissions: (userId, permissions) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: state.users.map((u) => (u.id === userId ? { ...u, permissions: { ...u.permissions, ...permissions } } : u)),
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      updateUserRole: (userId, role) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: state.users.map((u) => (u.id === userId ? { ...u, role } : u)),
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      deleteUser: (userId) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: state.users.filter((u) => u.id !== userId),
            tenant: { ...state.tenant, users_count: Math.max(1, (state.tenant.users_count || 2) - 1) },
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      toggleUserStatus: (userId) => {
        let payload: any = null;
        set((state) => {
          const next = {
            users: state.users.map((u) => (u.id === userId ? { ...u, is_active: !u.is_active } : u)),
          };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
      },

      updateUserPassword: (email, newPassword) => {
        let updated = false;
        let payload: any = null;
        set((state) => {
          const clean = email.toLowerCase().trim();
          const inputUsername = clean.split('@')[0];

          const idx = state.users.findIndex((u) => {
            const uEmail = (u.email || '').toLowerCase().trim();
            const uName = (u.name || '').toLowerCase().trim();
            const uUsername = uEmail.split('@')[0];

            return (
              uEmail === clean ||
              uEmail.replace(/\.[a-z]{2,}$/i, '') === clean.replace(/\.[a-z]{2,}$/i, '') ||
              uUsername === clean ||
              uUsername === inputUsername ||
              uName === clean
            );
          });

          if (idx === -1) return state;
          const updatedUsers = [...state.users];
          updatedUsers[idx] = { ...updatedUsers[idx], password: newPassword };
          updated = true;
          const next = { users: updatedUsers };
          payload = next;
          return next;
        });
        if (payload) broadcastStateChange('DATA_SYNC', payload);
        return updated;
      },
    }),
    {
      name: 'retalio-business-data',
      version: 7,
      migrate: (persistedState: any, version: number) => {
        if (
          version < 6 ||
          !persistedState ||
          persistedState?.tenant?.name === 'Kopi Kelana' ||
          persistedState?.products?.some((p: any) => p.sku?.startsWith('KEL-') || p.name?.includes('Kopi Susu')) ||
          !persistedState?.products?.some((p: any) => p.id === 'p-nb-1')
        ) {
          return {
            tenant: defaultTenant,
            allTenants: defaultAllTenants,
            outlets: defaultOutlets,
            warehouses: defaultWarehouses,
            categories: defaultCategories,
            products: defaultProducts,
            stocks: defaultStocks,
            transactions: defaultTransactions,
            financialEntries: defaultFinancialEntries,
            suppliers: defaultSuppliers,
            purchaseOrders: defaultPurchaseOrders,
            stockMovements: defaultMovements,
            customers: defaultCustomers,
            users: defaultUsers,
            isSyncing: false,
          };
        }
        const existingTenants: Tenant[] = Array.isArray(persistedState.allTenants) ? persistedState.allTenants : [defaultTenant];
        const mergedTenants = [...existingTenants];
        for (const dt of defaultAllTenants) {
          if (!mergedTenants.some((t) => t.id === dt.id)) mergedTenants.push(dt);
        }
        const existingUsers: User[] = Array.isArray(persistedState.users) ? persistedState.users : defaultUsers;
        const mergedUsers = [...existingUsers];
        for (const du of defaultUsers) {
          if (!mergedUsers.some((u) => u.id === du.id || u.email === du.email)) mergedUsers.push(du);
        }
        return {
          ...persistedState,
          allTenants: mergedTenants,
          users: mergedUsers,
        };
      },
    },
  ),
);
