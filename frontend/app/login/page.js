'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import Input from '@/components/Input';
import Button from '@/components/Button';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validate = () => {
    const e = {};
    if (!form.email.trim()) e.email = 'Email is required';
    if (!form.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!needs2fa && !validate()) return;

    if (needs2fa && !totpCode.trim()) {
      setServerError('Please enter your 2FA code.');
      return;
    }

    setLoading(true);
    try {
      const result = await login(form.email, form.password, needs2fa ? totpCode : undefined);

      if (result.requires_2fa) {
        setNeeds2fa(true);
        setLoading(false);
        return;
      }

      router.push('/wines');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setNeeds2fa(false);
    setTotpCode('');
    setServerError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-pattern">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-zinc-400">
            {needs2fa ? 'Enter your two-factor authentication code' : 'Sign in to continue your wine journey'}
          </p>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl p-8">
          {/* VULN: Reflected XSS - server error rendered as raw HTML */}
          {serverError && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
              dangerouslySetInnerHTML={{ __html: serverError }} />
          )}

          {needs2fa ? (
            /* 2FA Step */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-4">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-zinc-400 text-sm">
                  Open your authenticator app and enter the 6-digit code
                </p>
              </div>

              <Input
                label="Authentication Code"
                type="text"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
                autoFocus
              />

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Verify & Sign In
              </Button>

              <button
                type="button"
                onClick={handleBack}
                className="w-full text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
            /* Normal login step */
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Email"
                  type="text"
                  placeholder="joe@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  error={errors.email}
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={errors.password}
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      className="rounded border-dark-border bg-dark-lighter text-accent-purple focus:ring-accent-purple"
                    />
                    Remember me
                  </label>
                  <a href="#" className="text-sm text-accent-purple hover:text-accent-purple-light transition-colors">
                    Forgot password?
                  </a>
                </div>

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Sign In
                </Button>
              </form>

              <p className="text-center text-zinc-400 text-sm mt-6">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-accent-purple hover:text-accent-purple-light transition-colors">
                  Sign up
                </Link>
              </p>

              <div className="mt-6 pt-6 border-t border-dark-border">
                <p className="text-center text-zinc-500 text-xs">
                  Demo accounts: joe@example.com / jane@example.com / admin@example.com (password: password123)
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
