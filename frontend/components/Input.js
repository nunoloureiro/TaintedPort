'use client';

export default function Input({
  label,
  error,
  className = '',
  ...props
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500 
          focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple transition-colors
          ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''} ${className}`}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
