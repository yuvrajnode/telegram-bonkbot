/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0a0b0d',
          800: '#101215',
          700: '#16191d',
          600: '#1d2126',
          500: '#272c33',
        },
        chalk: {
          100: '#eceef1',
          300: '#b6bcc4',
          500: '#7c848e',
          700: '#4c535c',
        },
        ember: {
          400: '#ff8a4c',
          500: '#f2662f',
          600: '#d24f1e',
        },
        gain: '#3fb970',
        loss: '#e5484d',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.028) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
