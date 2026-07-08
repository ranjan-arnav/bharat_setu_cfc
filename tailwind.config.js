/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0a1628', light: '#0f1f3a', lighter: '#162a4a' },
        saffron: { DEFAULT: '#FF9933', dark: '#E68A2E', light: '#FFB366' },
        indian: { green: '#138808', white: '#FFFFFF' },
        karma: { gold: '#FFD700', bronze: '#CD7F32', silver: '#C0C0C0', platinum: '#E5E4E2' },
        agent: {
          civic: '#3B82F6',
          health: '#10B981',
          welfare: '#F59E0B',
          finance: '#8B5CF6',
          legal: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Public Sans', 'system-ui', 'sans-serif'],
        hindi: ['Noto Sans Devanagari', 'sans-serif'],
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        pulse_ring: {
          '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(255,153,51,0.7)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 15px rgba(255,153,51,0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(255,153,51,0)' },
        },
        sos_pulse: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(255,51,51,0.7)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 0 20px rgba(255,51,51,0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        ripple: 'ripple 1.5s ease-out infinite',
        pulse_ring: 'pulse_ring 2s ease infinite',
        sos_pulse: 'sos_pulse 1s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        slideUp: 'slideUp 0.5s ease-out',
        countUp: 'countUp 0.8s ease-out',
      },
    },
  },
  plugins: [],
};
