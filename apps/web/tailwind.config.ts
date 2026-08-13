import type {Config} from 'tailwindcss';

/**
 * Sistema de diseño de ticketera.
 * Colores mapeados a CSS variables (globals.css) para soportar dark mode
 * vía clase `.dark` en <html>. No se hardcodea ningún hex en componentes.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--color-brand)',
          hover: 'var(--color-brand-hover)',
          soft: 'var(--color-brand-soft)',
          fg: 'var(--color-brand-fg)',
          ring: 'var(--color-brand-ring)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          fg: 'var(--color-success-fg)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          fg: 'var(--color-warning-fg)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          fg: 'var(--color-danger-fg)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
          fg: 'var(--color-info-fg)',
        },
        neutral: {
          DEFAULT: 'var(--color-neutral)',
          bg: 'var(--color-neutral-bg)',
          fg: 'var(--color-neutral-fg)',
        },
        state: {
          abierto: {bg: 'var(--color-state-abierto-bg)', fg: 'var(--color-state-abierto-fg)'},
          en_progreso: {bg: 'var(--color-state-en_progreso-bg)', fg: 'var(--color-state-en_progreso-fg)'},
          en_revision: {bg: 'var(--color-state-en_revision-bg)', fg: 'var(--color-state-en_revision-fg)'},
          resuelto: {bg: 'var(--color-state-resuelto-bg)', fg: 'var(--color-state-resuelto-fg)'},
          cerrado: {bg: 'var(--color-state-cerrado-bg)', fg: 'var(--color-state-cerrado-fg)'},
          reabierto: {bg: 'var(--color-state-reabierto-bg)', fg: 'var(--color-state-reabierto-fg)'},
        },
        prio: {
          baja: {bg: 'var(--color-prio-baja-bg)', fg: 'var(--color-prio-baja-fg)'},
          media: {bg: 'var(--color-prio-media-bg)', fg: 'var(--color-prio-media-fg)'},
          alta: {bg: 'var(--color-prio-alta-bg)', fg: 'var(--color-prio-alta-fg)'},
          urgente: {bg: 'var(--color-prio-urgente-bg)', fg: 'var(--color-prio-urgente-fg)'},
        },
        surface: {
          DEFAULT: 'var(--bg-base)',
          subtle: 'var(--bg-subtle)',
          muted: 'var(--bg-muted)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        content: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'fade-in': {from: {opacity: '0'}, to: {opacity: '1'}},
        'slide-in': {
          from: {transform: 'translateY(8px)', opacity: '0'},
          to: {transform: 'translateY(0)', opacity: '1'},
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
