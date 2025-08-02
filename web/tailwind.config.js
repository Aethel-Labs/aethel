/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '8px',
      },
    },
  },
  plugins: [],
};
