// LangContext.jsx - holds the chosen language for the whole app. Every page calls
// useLang() to get t() (text), num() and eur() (numbers and money in that language's style).
// The choice is saved in the browser, so it is still there after a reload.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY, detectLang, makeFormat, makeT } from "./i18n.js";

const LangContext = createContext(null);

function savedLang() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage can be blocked (private windows); then the default applies
  }
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => detectLang(savedLang()));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => {
    const { num, eur } = makeFormat(lang);
    return {
      lang,
      t: makeT(lang),
      num,
      eur,
      setLang(next) {
        setLangState(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // not saved: the choice only lasts until the page is closed
        }
      },
    };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang() needs a <LangProvider> around the app");
  return value;
}
