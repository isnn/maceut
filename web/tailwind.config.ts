import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: '#5A35F3',
        'primary-hover': '#4B2BE0',
        'primary-soft': '#EEEAFE',

        // Surface
        canvas: '#FFFFFF',
        'canvas-secondary': '#F8F8FA',
        card: '#FFFFFF',
        page: '#F2F2F6',
        border: '#E6E6EB',
        divider: '#EFEFF3',

        // Text
        'text-primary': '#1F1F24',
        'text-secondary': '#6B6B76',
        'text-muted': '#9A9AA5',
        'on-primary': '#FFFFFF',

        // Semantic — Success
        'success-bg': '#E7F7DF',
        'success-text': '#2D7A2D',
        'success-icon': '#4CAF50',

        // Semantic — Warning
        'warning-bg': '#FFF3D6',
        'warning-text': '#946200',
        'warning-icon': '#F4A300',

        // Semantic — Info
        info: '#3178F6',
        'info-bg': '#EAF1FE',

        // Semantic — Danger (destructive actions & failed states)
        'danger-bg': '#FCEAE9',
        'danger-text': '#B3261E',
        'danger-icon': '#EF4444',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        xxl: '32px',
        section: '48px',
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-title': ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        'section-title': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        label: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        micro: ['11px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        // Wordmark face — used by the logo only, never for interface text.
        brand: ['var(--font-bricolage)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'elevation-1': 'none',
        'elevation-2': '0 2px 8px rgba(0,0,0,0.04)',
        'elevation-3': '0 8px 24px rgba(0,0,0,0.08)',
      },
      screens: {
        mobile: '0px',
        tablet: '768px',
        laptop: '992px',
        desktop: '1200px',
      },
    },
  },
  plugins: [],
}

export default config
