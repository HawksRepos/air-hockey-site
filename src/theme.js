/**
 * Theme palettes inspired by popular VS Code themes.
 *
 * Colours are intentionally desaturated compared to the raw theme
 * specs — neon tones look great in an editor but are fatiguing in a
 * data-heavy dashboard. Each palette is tweaked for readability on
 * charts, cards, and long-form text.
 */

export const themes = {
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    bg: '#282A36',
    surface: '#21222C',
    surfaceAlt: '#2E303E',
    border: '#44475A',
    text: '#F8F8F2',
    textSoft: '#9BA2BF',       // brightened from #6272A4 for readability
    accent: '#7AB8D9',         // desaturated cyan
    success: '#6BCB8B',        // softer green
    warning: '#E4B96A',        // softer orange
    danger: '#E86A6A',         // softer red
    purple: '#B09ADB',         // softer purple
    teal: '#6BCB8B',
    orange: '#E4B96A',
    rose: '#D97AAF',           // softer pink
    hlYellow: '#3B3A2A',
    hlGreen: '#1E3326',
    hlBlue: '#1E2A38',
    hlRose: '#35202D',
  },
  oneDark: {
    id: 'oneDark',
    label: 'One Dark',
    bg: '#1E2127',
    surface: '#282C34',
    surfaceAlt: '#2C313A',
    border: '#3E4451',
    text: '#C8CDD6',           // brighter than ABB2BF
    textSoft: '#8590A5',       // brightened for readability
    accent: '#6DA8D4',         // softer blue
    success: '#8BB86E',        // softer green
    warning: '#D4B06E',        // softer yellow
    danger: '#CC6B73',         // softer red
    purple: '#B07DC1',         // softer purple
    teal: '#6BA5AD',           // softer cyan
    orange: '#C28E5E',         // softer orange
    rose: '#CC6B73',
    hlYellow: '#33312A',
    hlGreen: '#252E25',
    hlBlue: '#1E2A35',
    hlRose: '#2E2226',
  },
  minDark: {
    id: 'minDark',
    label: 'Min Dark',
    bg: '#1A1A2E',
    surface: '#16213E',
    surfaceAlt: '#1F2B47',
    border: '#2A3A5C',
    text: '#D8DDE6',           // brighter
    textSoft: '#8A95AE',       // brightened
    accent: '#4A9AD9',         // softer blue
    success: '#5EBD7A',
    warning: '#D9A940',
    danger: '#D96A6A',
    purple: '#9A80C9',
    teal: '#4AB8A8',
    orange: '#D9913A',
    rose: '#D97AAF',
    hlYellow: '#2A2820',
    hlGreen: '#1A2E28',
    hlBlue: '#162035',
    hlRose: '#28182A',
  },
  light: {
    id: 'light',
    label: 'Light',
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F0F0',
    border: '#D4D4D8',
    text: '#1E1E2E',
    textSoft: '#555B6E',       // darker for contrast on white
    accent: '#2563EB',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    purple: '#7C3AED',
    teal: '#0D9488',
    orange: '#EA580C',
    rose: '#DB2777',
    hlYellow: '#FEF9C3',
    hlGreen: '#DCFCE7',
    hlBlue: '#DBEAFE',
    hlRose: '#FCE7F3',
  },
};

export const themeOrder = ['dracula', 'oneDark', 'minDark', 'light'];
export const defaultThemeId = 'dracula';
export const fontFamily = "'Lexend', system-ui, sans-serif";
export const fontHref =
  'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap';
