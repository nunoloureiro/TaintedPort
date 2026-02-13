'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import Input from '@/components/Input';
import Button from '@/components/Button';

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const getPasswordStrength = (pw) => {
    if (!pw) return { label: '', color: '', width: '0%' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '20%' };
    if (score <= 2) return { label: 'Fair', color: 'bg-orange-500', width: '40%' };
    if (score <= 3) return { label: 'Good', color: 'bg-yellow-500', width: '60%' };
    if (score <= 4) return { label: 'Strong', color: 'bg-green-500', width: '80%' };
    return { label: 'Very Strong', color: 'bg-emerald-400', width: '100%' };
  };

  const strength = getPasswordStrength(form.password);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email format';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (!agreed) e.agreed = 'You must agree to the terms';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      router.push('/wines');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-pattern">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-zinc-400">Join TaintedPort and discover Portuguese wines</p>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl p-8">
          {serverError && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Full Name"
              type="text"
              placeholder="Joe Silva"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={errors.name}
            />

            <Input
              label="Email"
              type="email"
              placeholder="joe@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              error={errors.email}
            />

            <div>
              <Input
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                error={errors.password}
              />
              {form.password && (
                <div className="mt-2">
                  <div className="h-1.5 bg-dark-lighter rounded-full overflow-hidden">
                    <div
                      className={`h-full ${strength.color} transition-all duration-300 rounded-full`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Strength: {strength.label}</p>
                </div>
              )}
            </div>

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Repeat your password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              error={errors.confirmPassword}
            />

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 rounded border-dark-border bg-dark-lighter text-accent-purple focus:ring-accent-purple"
              />
              <label htmlFor="terms" className="text-sm text-zinc-400">
                I agree to the Terms & Conditions and Privacy Policy
              </label>
            </div>
            {errors.agreed && <p className="text-sm text-red-400 -mt-3">{errors.agreed}</p>}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create Account
            </Button>
          </form>

          <p className="text-center text-zinc-400 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-accent-purple hover:text-accent-purple-light transition-colors">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
