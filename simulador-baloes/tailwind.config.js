/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cremeLeve: '#FFFFFF',
        baseCulinaria: '#FFFEF5',
        chocoTri: '#5D4037',
        powerTriChocolate: '#3E2723',
        powerTriMorango: '#E91E63',
      },
      animation: {
        'liquid-wave': 'liquidWave 3s ease-in-out infinite',
        'bubble': 'bubble 2s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        liquidWave: {
          '0%, 100%': { transform: 'translateX(-50%) translateY(0) scaleX(1)' },
          '50%': { transform: 'translateX(-50%) translateY(-5px) scaleX(1.02)' },
        },
        bubble: {
          '0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.3' },
          '50%': { transform: 'translateY(-20px) scale(1.2)', opacity: '0.6' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(255,255,255,0.3), inset 0 0 20px rgba(255,255,255,0.1)' },
          '100%': { boxShadow: '0 0 40px rgba(255,255,255,0.5), inset 0 0 40px rgba(255,255,255,0.2)' },
        },
      },
    },
  },
  plugins: [],
}