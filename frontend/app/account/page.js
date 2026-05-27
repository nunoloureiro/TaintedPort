'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { orderAPI, authAPI } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import QRCode from 'qrcode';

export default function AccountPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout, refreshUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // 2FA setup state
  const [showEnable2fa, setShowEnable2fa] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [enabling2fa, setEnabling2fa] = useState(false);
  const [enable2faError, setEnable2faError] = useState('');
  const [enable2faSuccess, setEnable2faSuccess] = useState('');

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  // Change email state
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Disable 2FA state
  const [showDisable2fa, setShowDisable2fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling2fa, setDisabling2fa] = useState(false);
  const [disable2faError, setDisable2faError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const fetchOrders = async () => {
        try {
          const res = await orderAPI.getAll();
          setOrders(res.data.orders || []);
        } catch (err) {
          console.error('Failed to fetch orders:', err);
        } finally {
          setLoadingOrders(false);
        }
      };
      fetchOrders();
    }
  }, [user]);

  // Generate QR code whenever the otpauth URI changes
  const generateQr = useCallback(async (uri) => {
    if (!uri) return;
    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 2,
        color: { dark: '#FFFFFF', light: '#00000000' },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
  }, []);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">👤</div>
          <p className="text-zinc-400">Loading account...</p>
        </div>
      </div>
    );
  }

  const handleStartEditName = () => {
    setNewName(user.name || '');
    setNameError('');
    setEditingName(true);
  };

  const handleSaveName = async () => {
    setNameError('');
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (trimmed === user.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await authAPI.updateProfile({ name: trimmed });
      await refreshUser();
      setEditingName(false);
    } catch (err) {
      setNameError(err.response?.data?.message || 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNewName('');
    setNameError('');
  };

  // --- Change Email ---
  const handleChangeEmail = async () => {
    setEmailError('');
    setEmailSuccess('');
    if (!emailPassword.trim()) { setEmailError('Password is required.'); return; }
    if (!newEmail.trim()) { setEmailError('New email is required.'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) { setEmailError('Invalid email format.'); return; }
    if (newEmail.trim() === user.email) { setEmailError('New email is the same as current.'); return; }
    setSavingEmail(true);
    try {
      const res = await authAPI.changeEmail(emailPassword, newEmail.trim());
      // Store the new token since email changed
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
      }
      setEmailSuccess('Email updated successfully.');
      setShowChangeEmail(false);
      setEmailPassword('');
      setNewEmail('');
      await refreshUser();
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Failed to update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleCancelChangeEmail = () => {
    setShowChangeEmail(false);
    setEmailPassword('');
    setNewEmail('');
    setEmailError('');
  };

  // --- Change Password ---
  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword.trim()) { setPasswordError('Current password is required.'); return; }
    if (!newPassword) { setPasswordError('New password is required.'); return; }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setSavingPassword(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully.');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCancelChangePassword = () => {
    setShowChangePassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleStartSetup = async () => {
    setSetupLoading(true);
    setEnable2faError('');
    setTotpCode('');
    setQrDataUrl('');
    try {
      const res = await authAPI.setup2fa();
      setTotpSecret(res.data.secret);
      setOtpauthUri(res.data.otpauth_uri);
      generateQr(res.data.otpauth_uri);
      setShowEnable2fa(true);
    } catch (err) {
      setEnable2faError(err.response?.data?.message || 'Failed to start 2FA setup.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleEnable2fa = async () => {
    setEnable2faError('');
    if (totpCode.length !== 6) {
      setEnable2faError('Please enter the 6-digit code from your authenticator app.');
      return;
    }
    setEnabling2fa(true);
    try {
      await authAPI.enable2fa(totpSecret, totpCode);
      setEnable2faSuccess('Two-factor authentication enabled successfully!');
      setShowEnable2fa(false);
      setTotpSecret('');
      setOtpauthUri('');
      setQrDataUrl('');
      setTotpCode('');
      await refreshUser();
    } catch (err) {
      setEnable2faError(err.response?.data?.message || 'Failed to enable 2FA. Check your code and try again.');
    } finally {
      setEnabling2fa(false);
    }
  };

  const handleCancelSetup = () => {
    setShowEnable2fa(false);
    setTotpSecret('');
    setOtpauthUri('');
    setQrDataUrl('');
    setTotpCode('');
    setEnable2faError('');
  };

  const handleDisable2fa = async () => {
    setDisable2faError('');
    if (!disablePassword.trim()) {
      setDisable2faError('Password is required.');
      return;
    }
    setDisabling2fa(true);
    try {
      await authAPI.disable2fa(disablePassword);
      setShowDisable2fa(false);
      setDisablePassword('');
      setEnable2faSuccess('');
      await refreshUser();
    } catch (err) {
      setDisable2faError(err.response?.data?.message || 'Failed to disable 2FA.');
    } finally {
      setDisabling2fa(false);
    }
  };

  // Format secret in groups of 4 for readability
  const formatSecret = (s) => s ? s.match(/.{1,4}/g)?.join(' ') : '';

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    shipped: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    delivered: 'bg-green-500/10 text-green-400 border-green-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Info */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8 mb-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center text-white text-2xl font-bold">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                {editingName ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelEditName(); }}
                        autoFocus
                        maxLength={100}
                        className="px-3 py-1.5 bg-dark-lighter border border-dark-border rounded-lg text-white text-lg font-bold focus:outline-none focus:border-accent-purple transition-colors w-64"
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={savingName}
                        className="p-1.5 text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
                        title="Save"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelEditName}
                        className="p-1.5 text-zinc-400 hover:text-zinc-300 transition-colors"
                        title="Cancel"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {nameError && <p className="text-red-400 text-sm">{nameError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-2xl font-bold text-white">{user.name}</h1>
                    <button
                      onClick={handleStartEditName}
                      className="p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                      title="Edit name"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-zinc-400">{user.email}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>

        {/* Account Settings */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-6">
            Account <span className="gradient-text">Settings</span>
          </h2>

          <div className="bg-dark-card border border-dark-border rounded-xl divide-y divide-dark-border">
            {/* Change Email */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Email Address</p>
                  <p className="text-zinc-500 text-sm">{user.email}</p>
                </div>
                {!showChangeEmail && (
                  <Button variant="secondary" size="sm" onClick={() => { setShowChangeEmail(true); setEmailSuccess(''); setEmailError(''); }}>
                    Change
                  </Button>
                )}
              </div>

              {emailSuccess && !showChangeEmail && (
                <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                  {emailSuccess}
                </div>
              )}

              {showChangeEmail && (
                <div className="mt-4 pt-4 border-t border-dark-border space-y-3">
                  <p className="text-zinc-400 text-sm">Enter your password and the new email address.</p>
                  <Input
                    label="Current Password"
                    type="password"
                    placeholder="Enter your password"
                    value={emailPassword}
                    onChange={(e) => { setEmailPassword(e.target.value); setEmailError(''); }}
                  />
                  <Input
                    label="New Email"
                    type="email"
                    placeholder="new@example.com"
                    value={newEmail}
                    onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                  />
                  {emailError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {emailError}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button onClick={handleChangeEmail} loading={savingEmail}>
                      Update Email
                    </Button>
                    <Button variant="ghost" onClick={handleCancelChangeEmail}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Change Password */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Password</p>
                  <p className="text-zinc-500 text-sm">Last changed: unknown</p>
                </div>
                {!showChangePassword && (
                  <Button variant="secondary" size="sm" onClick={() => { setShowChangePassword(true); setPasswordSuccess(''); setPasswordError(''); }}>
                    Change
                  </Button>
                )}
              </div>

              {passwordSuccess && !showChangePassword && (
                <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                  {passwordSuccess}
                </div>
              )}

              {showChangePassword && (
                <div className="mt-4 pt-4 border-t border-dark-border space-y-3">
                  <Input
                    label="Current Password"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                  />
                  <Input
                    label="New Password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                  />
                  {passwordError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                      {passwordError}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button onClick={handleChangePassword} loading={savingPassword}>
                      Change Password
                    </Button>
                    <Button variant="ghost" onClick={handleCancelChangePassword}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-6">
            Two-Factor <span className="gradient-text">Authentication</span>
          </h2>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.totp_enabled ? 'bg-green-500/10 border border-green-500/20' : 'bg-zinc-500/10 border border-dark-border'}`}>
                  <svg className={`w-5 h-5 ${user.totp_enabled ? 'text-green-400' : 'text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">TOTP Authentication</p>
                  <p className="text-zinc-500 text-sm">
                    {user.totp_enabled ? 'Enabled - your account is protected with 2FA' : 'Not enabled - add an extra layer of security'}
                  </p>
                </div>
              </div>

              {user.totp_enabled ? (
                <Button variant="danger" size="sm" onClick={() => setShowDisable2fa(!showDisable2fa)}>
                  Disable
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleStartSetup} loading={setupLoading}>
                  Enable
                </Button>
              )}
            </div>

            {enable2faSuccess && !showEnable2fa && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                {enable2faSuccess}
              </div>
            )}

            {/* Enable 2FA Flow */}
            {showEnable2fa && !user.totp_enabled && (
              <div className="mt-4 pt-4 border-t border-dark-border space-y-5">
                {/* Step 1: Scan QR Code */}
                <div>
                  <h4 className="text-white font-medium mb-3">Step 1: Scan the QR Code</h4>
                  <p className="text-zinc-400 text-sm mb-4">
                    Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)
                    and scan this QR code to add your account.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* QR Code */}
                    <div className="bg-dark-lighter border border-dark-border rounded-xl p-4 flex items-center justify-center">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="2FA QR Code" width={200} height={200} className="rounded" />
                      ) : (
                        <div className="w-[200px] h-[200px] flex items-center justify-center text-zinc-500">
                          <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Manual entry */}
                    <div className="flex-1 w-full">
                      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Can&apos;t scan? Enter manually:</p>
                      <div className="bg-dark-lighter border border-dark-border rounded-lg p-3">
                        <p className="text-zinc-400 text-xs mb-1">Account</p>
                        <p className="text-white text-sm">{user.email}</p>
                        <p className="text-zinc-400 text-xs mt-2 mb-1">Secret Key</p>
                        <p className="text-accent-purple-light font-mono text-sm tracking-wider select-all break-all">
                          {formatSecret(totpSecret)}
                        </p>
                      </div>
                      <p className="text-zinc-600 text-xs mt-2">
                        Type: Time-based &middot; Digits: 6 &middot; Interval: 30s
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 2: Verify */}
                <div>
                  <h4 className="text-white font-medium mb-2">Step 2: Verify Setup</h4>
                  <p className="text-zinc-400 text-sm mb-3">
                    Enter the 6-digit code shown in your authenticator app to confirm it&apos;s working.
                  </p>

                  <div className="flex gap-3 items-end">
                    <div className="flex-1 max-w-[220px]">
                      <input
                        type="text"
                        placeholder="000 000"
                        value={totpCode}
                        onChange={(e) => {
                          setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setEnable2faError('');
                        }}
                        maxLength={6}
                        autoComplete="one-time-code"
                        className="w-full px-4 py-3 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-accent-purple transition-colors font-mono text-center text-2xl tracking-[0.5em]"
                      />
                    </div>
                    <Button
                      onClick={handleEnable2fa}
                      loading={enabling2fa}
                      disabled={totpCode.length !== 6}
                      size="lg"
                    >
                      Verify &amp; Enable
                    </Button>
                  </div>
                </div>

                {enable2faError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {enable2faError}
                  </div>
                )}

                <button
                  onClick={handleCancelSetup}
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel setup
                </button>
              </div>
            )}

            {/* Disable 2FA Flow */}
            {showDisable2fa && user.totp_enabled && (
              <div className="mt-4 pt-4 border-t border-dark-border space-y-4">
                <p className="text-zinc-400 text-sm">
                  Enter your password to confirm disabling two-factor authentication.
                </p>

                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter your password"
                  value={disablePassword}
                  onChange={(e) => { setDisablePassword(e.target.value); setDisable2faError(''); }}
                />

                {disable2faError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {disable2faError}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="danger" onClick={handleDisable2fa} loading={disabling2fa}>
                    Confirm Disable
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowDisable2fa(false); setDisablePassword(''); setDisable2faError(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order History */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">
            Order <span className="gradient-text">History</span>
          </h2>

          {loadingOrders ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-dark-card border border-dark-border rounded-xl p-6 animate-pulse">
                  <div className="h-5 bg-dark-lighter rounded w-32 mb-2" />
                  <div className="h-4 bg-dark-lighter rounded w-48" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16 bg-dark-card border border-dark-border rounded-xl">
              <div className="text-5xl mb-4">📦</div>
              <h3 className="text-lg font-semibold text-white mb-2">No orders yet</h3>
              <p className="text-zinc-400 mb-6">Your order history will appear here</p>
              <a href="/wines">
                <Button>Start Shopping</Button>
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-dark-card border border-dark-border rounded-xl p-6 hover:border-dark-border/80 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-white font-medium">Order #{order.id}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[order.status] || statusColors.pending}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-zinc-500 text-sm">
                        {new Date(order.order_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                        {' · '}
                        {order.items_count} item{order.items_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold text-lg">€{order.total.toFixed(2)}</p>
                      <a href={`/orders/${order.id}`} className="text-accent-purple text-sm hover:text-accent-purple-light transition-colors">
                        View Details →
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
