/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens (OKLCH, theme-driven via CSS vars)
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-active': 'var(--surface-active)',
        panel: 'var(--panel)',
        'panel-hover': 'var(--panel-hover)',
        'panel-active': 'var(--panel-active)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-tint': 'var(--accent-tint)',
        'accent-tint-hover': 'var(--accent-tint-hover)',
        'accent-tint-panel': 'var(--accent-tint-panel)',
        'accent-contrast': 'var(--accent-contrast)',
        success: 'var(--success)',
        'success-tint': 'var(--success-tint)',
        danger: 'var(--danger)',
        'danger-tint': 'var(--danger-tint)',
        warning: 'var(--warning)',
        'warning-tint': 'var(--warning-tint)',

        // Legacy Discord brand (kept for landing page / OAuth button)
        discord: {
          blurple: '#5865F2',
          dark: '#2C2F33',
          gray: '#99AAB5',
          red: '#F04747',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#5865F2',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Tight product scale, 1.125–1.2 ratio, fixed rem
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};
