import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b1115',
        surface: '#131d24',
        accent: '#33d17a',
        ink: '#f2f7fb',
        muted: '#8ca0ad',
      },
    },
  },
  plugins: [],
}

export default config
