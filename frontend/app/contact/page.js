'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/Input';
import Button from '@/components/Button';

export default function ContactPage() {
  const [apiBase, setApiBase] = useState('');

  useEffect(() => {
    setApiBase(process.env.NEXT_PUBLIC_API_URL || '/api');
  }, []);

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold mb-3">
          <span className="gradient-text">Contact</span> Us
        </h1>
        <p className="text-zinc-400 mb-10">
          Have a question about our wines or need help with an order?
          Fill out the form below and we&apos;ll get back to you shortly.
        </p>

        <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
          <form action={`${apiBase}/contact/preview`} method="POST">
            <div className="space-y-5">
              <Input
                label="Name"
                name="name"
                type="text"
                placeholder="Your full name"
                required
              />

              <Input
                label="Email"
                name="email"
                type="text"
                placeholder="you@example.com"
                required
              />

              <Input
                label="Subject"
                name="subject"
                type="text"
                placeholder="How can we help?"
                required
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">
                  Message
                </label>
                <textarea
                  name="message"
                  rows={5}
                  placeholder="Tell us more..."
                  required
                  className="w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple transition-colors resize-none"
                />
              </div>

              <div className="pt-2">
                <Button type="submit" size="lg" className="w-full">
                  Preview &amp; Send
                </Button>
              </div>
            </div>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Your message will be previewed before sending.
        </p>
      </div>
    </div>
  );
}
