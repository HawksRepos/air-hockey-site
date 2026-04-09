// eslint-disable-next-line react-refresh/only-export-components
import { createContext, useContext } from 'react';
import { themes, defaultThemeId } from './theme.js';

const ThemeContext = createContext(themes[defaultThemeId]);

export const ThemeProvider = ThemeContext.Provider;

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
