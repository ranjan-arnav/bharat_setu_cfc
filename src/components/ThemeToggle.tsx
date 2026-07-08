'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function ThemeToggle() {
    const { theme, setTheme, systemTheme } = useTheme();
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync theme with iframes whenever it changes
    useEffect(() => {
        if (!mounted) return;
        const currentTheme = theme === 'system' ? systemTheme : theme;
        const message = { action: 'sync-theme', theme: currentTheme };
        const frames = document.getElementsByTagName('iframe');
        for (let i = 0; i < frames.length; i++) {
            frames[i].contentWindow?.postMessage(message, '*');
        }
    }, [theme, systemTheme, mounted]);

    if (!mounted) {
        return <div className="w-8 h-8" />; // Placeholder to avoid layout shift
    }

    const currentTheme = theme === 'system' ? systemTheme : theme;

    return (
        <button
            onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-black/10 dark:bg-white/10 transition-colors flex items-center justify-center text-slate-700 dark:text-slate-300 relative z-50 focus:outline-none"
            aria-label={t('toggleTheme', 'Toggle theme')}
        >
            <span className="material-symbols-outlined">
                {currentTheme === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
        </button>
    );
}
