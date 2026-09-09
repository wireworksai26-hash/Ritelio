import { create } from 'zustand';
import type { CartItem, PaymentMethod, Product } from '../types';

interface CartState {
  items: CartItem[];
  customerId: string | null;
  paymentMethod: PaymentMethod;
  add: (product: Product) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setCustomer: (id: string | null) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  customerId: null,
  paymentMethod: 'cash',
  add: (product) =>
    set((s) => {
      const existing = s.items.find((i) => i.product_id === product.id);
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }
      return { items: [...s.items, { product_id: product.id, qty: 1, price: product.sell_price }] };
    }),
  remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.product_id !== productId) })),
  setQty: (productId, qty) =>
    set((s) => ({
      items:
        qty <= 0
          ? s.items.filter((i) => i.product_id !== productId)
          : s.items.map((i) => (i.product_id === productId ? { ...i, qty } : i)),
    })),
  setCustomer: (id) => set({ customerId: id }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  clear: () => set({ items: [], customerId: null, paymentMethod: 'cash' }),
}));

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.price, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}
