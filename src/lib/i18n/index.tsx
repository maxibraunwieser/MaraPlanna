// Texts of the app live in one place per language (src/lib/i18n/*.ts: one file per area with an English and a German table of
// the same keys). English is the default; the language can be switched at the top right of every page and is remembered in
// the browser. The whole app is in one language at a time: screens use `t()`, the formatters read the active language, and
// plan content that is stored in English (titles, steps, notes) is translated for display by content.ts.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MsgKey } from './en';
import { de } from './de';

export type Lang = 'en' | 'de';
export type { MsgKey };
export type Params = Record<string, string | number>;
export type Translate = (key: MsgKey, params?: Params) => string;

const STORAGE_KEY = 'maraplanna.lang';
const TABLES: Record<Lang, Record<MsgKey, string>> = { en, de };

export function storedLang(): Lang {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'de' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

/** The language the page is in right now, for code that is not a component (formatters). Set before the screens re-render. */
let active: Lang = storedLang();
export const currentLang = (): Lang => active;
export const setActiveLang = (l: Lang) => {
  active = l;
};

/** Fills {name} placeholders; a missing parameter stays visible as {name} so mistakes show up. */
export function format(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

export const translator = (lang: Lang): Translate => (key, params) => format(TABLES[lang][key] ?? en[key] ?? key, params);

/** Translate outside a component, in the language the page is in. */
export const tr: Translate = (key, params) => translator(active)(key, params);

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
}

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: translator('en') });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  setActiveLang(lang);
  const setLang = useCallback((l: Lang) => {
    setActiveLang(l);
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: translator(lang) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
