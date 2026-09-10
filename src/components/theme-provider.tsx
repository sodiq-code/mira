'use client';

/**
 * Theme provider for MIRA.
 *
 * Wraps the app in next-themes so the borrower flow can switch between the
 * light and dark palettes defined in globals.css. The dark palette is already
 * wired (the variables exist under `.dark`); this provider just activates
 * the `class` strategy and persists the user's choice.
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
