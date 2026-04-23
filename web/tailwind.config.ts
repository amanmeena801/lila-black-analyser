import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark palette tuned for a gaming/design tool. Surfaces stay on the
        // neutral-zinc scale; accent is used sparingly for selected filters.
        surface: {
          900: '#09090b',
          800: '#18181b',
          700: '#27272a',
          600: '#3f3f46',
          500: '#52525b',
        },
        accent: {
          500: '#f43f5e', // rose — high-contrast against map tints
          400: '#fb7185',
        },
        // Layer tints for overlays on the minimap.
        layer: {
          loot: '#facc15',      // amber
          kill: '#ef4444',      // red
          death: '#a855f7',     // purple
          movement: '#22d3ee',  // cyan
          botMovement: '#84cc16', // lime
          storm: '#38bdf8',     // sky
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
