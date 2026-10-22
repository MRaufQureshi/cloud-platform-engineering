// LangSwitch.jsx - the EN | DE toggle. Used on the login page and in the top bar.
import React from "react";
import { LANGS } from "../i18n.js";
import { useLang } from "../LangContext.jsx";

export default function LangSwitch({ className = "" }) {
  const { lang, setLang, t } = useLang();
  return (
    <div className={`lang-switch ${className}`.trim()} role="group" aria-label={t("lang.aria")}>
      {LANGS.map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
