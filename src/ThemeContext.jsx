// eslint-disable-next-line react-refresh/only-export-components
import { createContext, useContext } from 'react';
import { dark } from './theme.js';

const ThemeContext = createContext(dark);

export const ThemeProvider = ThemeContext.Provider;

/** Access the current theme tokens from any component in the tree. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
