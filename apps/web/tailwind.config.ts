import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Status palette — used by badges and row treatments
        status: {
          init: '#94a3b8',      // slate-400
          assigned: '#6366f1',  // indigo-500
          picked: '#0ea5e9',    // sky-500
          delivered: '#10b981', // emerald-500
          cancelled: '#ef4444', // red-500
        },
        ink: {
          DEFAULT: '#0f172a', // slate-900
          muted: '#475569',   // slate-600
          subtle: '#94a3b8',  // slate-400
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f8fafc',  // slate-50
          muted: '#f1f5f9',   // slate-100
        },
        line: {
          DEFAULT: '#e2e8f0', // slate-200
          strong: '#cbd5e1',  // slate-300
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
