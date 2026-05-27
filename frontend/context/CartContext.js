'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cartAPI } from '@/lib/api';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!user) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res = await cartAPI.getItems();
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addItem = async (wineId, quantity = 1) => {
    await cartAPI.addItem(wineId, quantity);
    await fetchCart();
  };

  const updateItem = async (wineId, quantity) => {
    await cartAPI.updateItem(wineId, quantity);
    await fetchCart();
  };

  const removeItem = async (wineId) => {
    await cartAPI.removeItem(wineId);
    await fetchCart();
  };

  const clearCart = () => {
    setItems([]);
    setTotal(0);
  };

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, total, loading, itemCount,
      addItem, updateItem, removeItem, clearCart, fetchCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
