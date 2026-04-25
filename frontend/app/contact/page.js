'use client';

import { useState } from 'react';
import Input from '@/components/Input';
import Button from '@/components/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [showConfirmation, setShowConfirmation] = useState(false);

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    if (errors[field]) setErrors({ ...errors, [field]: '' });
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address';
    if (!form.subject.trim()) e.subject = 'Subject is required';
    if (!form.message.trim()) e.message = 'Message is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setShowConfirmation(true);
  };

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3">
          <span className="gradient-text">Contact</span> Us
        </h1>
        <p className="text-zinc-400 mb-10">
          Have a question about our wines or need help with an order? Send us a message.
        </p>

        <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
          <form
            method="POST"
            action={`${API_URL}/contact/preview`}
            target="confirmation-frame"
            onSubmit={handleSubmit}
          >
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <Input
                  label="Name"
                  name="name"
                  placeholder="Your name"
                  value={form.name}
                  onChange={update('name')}
                  error={errors.name}
                />
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update('email')}
                  error={errors.email}
                />
              </div>

              <Input
                label="Subject"
                name="subject"
                placeholder="What is this about?"
                value={form.subject}
                onChange={update('subject')}
                error={errors.subject}
              />

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">Message</label>
                <textarea
                  name="message"
                  rows={5}
                  placeholder="Your message..."
                  value={form.message}
                  onChange={update('message')}
                  className={`w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500
                    focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple transition-colors resize-none
                    ${errors.message ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                />
                {errors.message && <p className="text-sm text-red-400">{errors.message}</p>}
              </div>

              <div className="pt-2">
                <Button type="submit" variant="primary">
                  Send Message
                </Button>
              </div>
            </div>
          </form>
        </div>

        <div className={`mt-8 ${showConfirmation ? '' : 'hidden'}`}>
          <iframe
            name="confirmation-frame"
            className="w-full min-h-[250px] rounded-lg border border-dark-border"
            title="Message Confirmation"
          />
        </div>
      </div>
    </div>
  );
}
