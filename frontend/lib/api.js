import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changeEmail: (password, newEmail) => api.put('/auth/email', { password, new_email: newEmail }),
  changePassword: (currentPassword, newPassword) => api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),
  setup2fa: () => api.post('/auth/2fa/setup'),
  enable2fa: (totpSecret, totpCode) => api.post('/auth/2fa/enable', { totp_secret: totpSecret, totp_code: totpCode }),
  disable2fa: (password) => api.post('/auth/2fa/disable', { password }),
};

// Wine API
export const wineAPI = {
  getAll: (params) => api.get('/wines', { params }),
  getById: (id) => api.get(`/wines/${id}`),
  getRegions: () => api.get('/wines/regions'),
  getTypes: () => api.get('/wines/types'),
};

// Cart API
export const cartAPI = {
  getItems: () => api.get('/cart'),
  addItem: (wineId, quantity) => api.post('/cart/add', { wine_id: wineId, quantity }),
  updateItem: (wineId, quantity) => api.put('/cart/update', { wine_id: wineId, quantity }),
  removeItem: (wineId) => api.delete(`/cart/remove/${wineId}`),
};

// Order API
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  getAll: () => api.get('/orders'),
  getById: (id) => api.get(`/orders/${id}`),
};

export default api;
