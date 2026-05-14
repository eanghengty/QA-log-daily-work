/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1a1a',
        'ink-2': '#4a4a4a',
        'ink-3': '#8a8a8a',
        paper: '#fafaf7',
        'paper-2': '#f1f0ea',
        line: '#d9d6cd',
        'line-2': '#b6b2a6',
        issue: '#c2701c',
        'issue-bg': '#fbe9d2',
        confirm: '#4f7a4a',
        'confirm-bg': '#e0ecdb',
        pending: '#b94a3b',
        highlight: '#fff2a8',
      },
      fontFamily: {
        default: ['Work Sans', 'system-ui', 'sans-serif'],
        hand: ['Patrick Hand', 'Kalam', 'cursive'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      spacing: {
        4.5: '1.125rem',
      },
    },
  },
  plugins: [],
}
