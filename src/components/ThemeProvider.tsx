'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

import { useEffect } from 'react';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    useEffect(() => {
        // Force reset to light mode default for existing users who had dark mode saved
        if (!localStorage.getItem('light_mode_default_applied')) {
            localStorage.setItem('theme', 'light');
            localStorage.setItem('light_mode_default_applied', 'true');
        }
    }, []);

    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
