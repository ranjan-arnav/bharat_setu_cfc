'use client';
import { useAppStore } from '@/lib/store';
import { translations, resolveLang, type UIStrings } from './translations';

/**
 * Returns a `t` function scoped to the current user language.
 * Falls back to Hindi → English → key name.
 */
export function useTranslation() {
  const { userProfile } = useAppStore();
  const lang = resolveLang(userProfile?.language);
  const strings: UIStrings = translations[lang] ?? translations['hi'];

  function t(key: keyof UIStrings | (string & {}), fallback?: string): string {
    const val = strings[key as keyof UIStrings] as string;
    if (val) return val;

    if (lang === 'en') {
      return fallback ?? String(key);
    }

    return (translations['hi'][key as keyof UIStrings] as string) ?? fallback ?? String(key);
  }

  /** RTL direction flag (for Urdu / Sindhi / Kashmiri) */
  const isRTL = strings.dir === 'rtl';

  return { t, lang, isRTL };
}
