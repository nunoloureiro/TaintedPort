'use client';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-gradient-to-r from-accent-purple to-accent-purple-light text-white hover:opacity-90 hover:shadow-lg hover:shadow-accent-purple/25',
    secondary: 'border border-dark-border text-zinc-300 hover:border-accent-purple/50 hover:text-white bg-dark-card',
    cyan: 'bg-accent-cyan text-white hover:opacity-90 hover:shadow-lg hover:shadow-accent-cyan/25',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'text-zinc-400 hover:text-white hover:bg-dark-lighter',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
