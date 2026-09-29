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
        // Contrast against the #08080C page background. The previous values
        // were 4.75:1 and 2.30:1 -- the latter failing WCAG AA outright, which
        // is why labels and hints were hard to read.
        'txt-dim': '#A5A5B8', // 8.3:1
        'txt-faint': '#7E7E92', // 5.0:1
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
