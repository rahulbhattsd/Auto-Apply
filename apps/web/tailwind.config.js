export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'th-bg': 'var(--color-bg)',
        'th-surface': 'var(--color-surface)',
        'th-border': 'var(--color-border)',
        'th-input': 'var(--color-input)',
        'th-input-border': 'var(--color-input-border)',
        'th-text': 'var(--color-text)',
        'th-text-muted': 'var(--color-text-muted)',
        'th-accent': 'var(--color-accent)',
        'th-accent-hover': 'var(--color-accent-hover)',
        'th-error': 'var(--color-error)',
        'th-error-bg': 'var(--color-error-bg)',
        'th-success': 'var(--color-success)',
      },
    },
  },
  plugins: [],
}
