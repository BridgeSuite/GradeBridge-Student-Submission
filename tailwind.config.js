/** @type {import('tailwindcss').Config} */
//
// THE UC DAVIS THEME (2026-11-04). Values are the brand tokens ucdavis.edu
// itself declares (`--ucd-blue`, `--ucd-gold`, `--brand-primary-*`,
// `--brand-secondary-*`). Steps marked (*) are not tokens there; they fill the
// scale between official values. `aggie` replaces Tailwind's blue and the dark
// slate chrome; `gold` is the accent: the one action that matters on a screen.
//
// `academic` is kept with its old values: only the privacy notice uses it.
export default {
  content: ['./index.html', './*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        academic: {
          50: '#f0fdf4',
          100: '#dcfce7',
          800: '#022851',
          900: '#011a36',
        },
        aggie: {
          50: '#f7fafd',   // brand-primary-20
          100: '#ebf3fa',  // brand-primary-30
          200: '#dbeaf7',  // brand-primary-40
          300: '#b0d0ed',  // brand-primary-60
          400: '#73abdd',  // brand-primary-70
          500: '#13639e',  // brand-primary-80 (wonder blue)
          600: '#14447a',  // brand-primary-90 (the site's header band)
          700: '#0c3768',  // (*)
          800: '#062f5c',  // (*)
          900: '#022851',  // ucd-blue, Aggie Blue
          950: '#011a36',  // (*)
        },
        gold: {
          50: '#fffbed',   // brand-secondary-20
          100: '#fff4d2',  // brand-secondary-40
          200: '#ffecb2',  // brand-secondary-60
          300: '#ffdf80',  // brand-secondary-70
          400: '#ffd24c',  // brand-secondary-80
          500: '#ffbf00',  // ucd-gold, Aggie Gold
          600: '#e0a800',  // (*)
          700: '#b38600',  // (*)
          800: '#8a6700',  // (*)
          900: '#5c4500',  // (*)
        },
      },
      // ucdavis.edu: buttons and small panels are 5px, cards 12px (rounded-xl).
      borderRadius: { md: '5px', lg: '5px' },
      fontFamily: {
        // Proxima Nova is the UC Davis face. It is licensed, so it is not bundled:
        // it is used where the computer has it, and the bundled Figtree otherwise.
        // Headings are the same face at a heavy weight, as on ucdavis.edu, so
        // `serif` is no longer a separate face.
        sans: ['proxima-nova', 'Figtree', 'system-ui', 'sans-serif'],
        serif: ['proxima-nova', 'Figtree', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
