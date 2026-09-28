/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#08080C',
        surface: '#101018',
        'surface-2': '#16161F',
        line: '#22222E',
        'line-hi': '#2E2E3D',
        txt: '#E8E8F0',
        'txt-dim': '#7A7A8C',
        'txt-faint': '#4A4A5A',
        neon: {
          cyan: '#00F0FF',
          magenta: '#FF2E97',
          lime: '#B6FF00',
          violet: '#A855F7',
          amber: '#FFB020',
          red: '#FF3B3B',
          blue: '#3B82F6',
          orange: '#FF6B35'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    }
  },
  plugins: []
}
