import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#F59E0B',
        'dark-bg': '#0F172A',
        'card-bg': '#1E293B',
      },
      animation: {
        'flip-reveal': 'flipReveal 0.6s ease-in-out',
        'countdown': 'countdownPulse 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
