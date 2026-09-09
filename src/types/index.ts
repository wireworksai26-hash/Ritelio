// Tipe data mengikuti Database_Schema_Retalio_SBS.md (nama field snake_case)

export type Role = 'superadmin' | 'owner' | 'admin' | 'manager' | 'cashier' | 'staff';
export type IndustryTemplate = 'retail' | 'manufacturing' | 'services';
export type SubscriptionPlan = 'basic' | 'plus_ai' | 'custom';
export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'needs_review';
export type PaymentMethod = 'cash' | 'qris' | 'debit' | 'transfer';

export interface Tenant {
  id: string;
  name: string;
  industry_template: IndustryTemplate;
  subscription_plan: SubscriptionPlan;
  settings: Record<string, unknown>;
  status?: 'active' | 'suspended' | 'trial';
  created_at?: string;
  monthly_revenue?: number;
  outlets_count?: number;
  users_count?: number;
  ai_quota_used?: number;
  ai_quota_limit?: number;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  action: string;
  category: 'auth' | 'transaction' | 'inventory' | 'system' | 'billing';
  details: string;
  ip_address: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Record<string, boolean>;
  is_active?: boolean;
  outlet_id?: string | null;
  last_login?: string;
  password?: string;
}

export interface Outlet {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
}

export interface Warehouse {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  name: string;
  location: string;
}

export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  category_id: string;
  unit: string;
  sell_price: number;
  cost_price: number;
  barcode?: string;
  image_url?: string;
  custom_fields: Record<string, unknown>;
}

export interface InventoryStock {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  min_threshold: number;
  last_updated: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  warehouse_id: string;
  type: 'sale' | 'purchase' | 'adjustment' | 'production';
  quantity: number;
  note: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact: string;
}

export type POStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  product_id: string;
  qty: number;
  price: number;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  supplier_id: string;
  warehouse_id: string;
  status: POStatus;
  items: PurchaseOrderItem[];
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  contact: string;
  loyalty_points: number;
}

export interface SalesTransactionItem {
  product_id: string;
  qty: number;
  price: number;
}

export interface SalesTransaction {
  id: string;
  tenant_id: string;
  outlet_id: string;
  cashier_id: string;
  customer_id: string | null;
  client_generated_id: string;
  sync_status: SyncStatus;
  client_timestamp: string;
  server_timestamp: string | null;
  total: number;
  payment_method: PaymentMethod;
  items: SalesTransactionItem[];
}

export interface FinancialEntry {
  id: string;
  tenant_id: string;
  source_module: string;
  source_ref_id: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  entry_date: string;
  is_anomaly_flagged: boolean;
}

export type InsightType =
  | 'low_stock_prediction'
  | 'sales_forecast'
  | 'anomaly'
  | 'cashflow_forecast'
  | 'insight_digest'
  | 'pricing_suggestion'
  | 'outlet_comparison';

export interface AIInsight {
  id: string;
  tenant_id: string;
  module: string;
  insight_type: InsightType;
  title: string;
  content: string;
  based_on_refs: string[];
  user_feedback: 1 | -1 | null;
  generated_at: string;
}

export type NotificationType = 'low_stock' | 'insight_digest' | 'approval' | 'sync_conflict';

export interface AppNotification {
  id: string;
  tenant_id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  link: string;
}

export interface ModuleConfig {
  module_key: string;
  label: string;
  description: string;
  is_active: boolean;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'dropdown';

export interface CustomField {
  id: string;
  module_key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
}

export interface CartItem {
  product_id: string;
  qty: number;
  price: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  based_on_refs?: string[];
  created_at: string;
}
