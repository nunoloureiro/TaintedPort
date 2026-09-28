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

// Review API
export const reviewAPI = {
  getByWine: (wineId) => api.get(`/wines/${wineId}/reviews`),
  create: (wineId, data) => api.post(`/wines/${wineId}/reviews`, data),
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
  getTrackingLink: (id) => api.get(`/orders/${id}/tracking-link`),
  track: (d, sig) => api.get('/orders/track', { params: { d, sig } }),
};

// Gift card API
export const giftcardAPI = {
  welcome: () => api.get('/giftcards/welcome'),
  redeem: (giftCard) => api.post('/giftcards/redeem', { gift_card: giftCard }),
};

// Payment API (Stripe)
export const paymentAPI = {
  createIntent: (data = {}) => api.post('/payments/create-intent', data),
};

// Admin API
export const adminAPI = {
  getOrders: () => api.get('/admin/orders'),
  getOrder: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, status, extra = {}) => api.put(`/admin/orders/${id}/status`, { status, ...extra }),
  getAnalytics: () => api.get('/admin/analytics'),
  getUsers: () => api.get('/admin/users'),
  updateUserRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),

  // Wines
  createWine: (data) => api.post('/wines', data),
  updateWine: (id, data) => api.put(`/wines/${id}`, data),
  deleteWine: (id) => api.delete(`/wines/${id}`),
  adjustStock: (id, delta) => api.put(`/wines/${id}/stock`, { delta }),
  uploadWineImage: (id, file) => {
    const form = new FormData();
    form.append('image', file);
    return api.post(`/wines/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },

  // Discount codes
  getDiscounts: () => api.get('/admin/discounts'),
  createDiscount: (data) => api.post('/admin/discounts', data),
  updateDiscount: (id, data) => api.put(`/admin/discounts/${id}`, data),
  deleteDiscount: (id) => api.delete(`/admin/discounts/${id}`),

  // Referral codes
  getReferrals: () => api.get('/admin/referrals'),
  createReferral: (data) => api.post('/admin/referrals', data),
  deleteReferral: (id) => api.delete(`/admin/referrals/${id}`),

  // Support tickets (admin + support role)
  getTickets: () => api.get('/admin/support/tickets'),
  getTicket: (id) => api.get(`/admin/support/tickets/${id}`),
  replyToTicket: (id, message) => api.post(`/admin/support/tickets/${id}/reply`, { message }),
  updateTicketStatus: (id, status) => api.put(`/admin/support/tickets/${id}/status`, { status }),
};

// Wishlist API
export const wishlistAPI = {
  getAll: () => api.get('/wishlist'),
  add: (wineId) => api.post('/wishlist', { wine_id: wineId }),
  remove: (wineId) => api.delete(`/wishlist/${wineId}`),
};

// Discount code API (customer-facing)
export const discountAPI = {
  validate: (code, subtotal) => api.post('/discounts/validate', { code, subtotal }),
};

// Support ticket API (customer-facing)
export const supportAPI = {
  getAll: () => api.get('/support/tickets'),
  getById: (id) => api.get(`/support/tickets/${id}`),
  create: (subject, message) => api.post('/support/tickets', { subject, message }),
  reply: (id, message) => api.post(`/support/tickets/${id}/reply`, { message }),
};

// Crawler coverage API
export const coverageAPI = {
  getResults: (sessionId) => api.get(`/coverage/${sessionId}`),
  recordView: (path) => api.post('/coverage/hit', { path }),
};

export default api;
