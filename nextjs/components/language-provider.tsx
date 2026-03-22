"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Language = "en" | "es";

type LanguageContextValue = {
  language: Language;
  browserLanguage: Language;
  setLanguage: (language: Language) => void;
  isSpanish: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [browserLanguage, setBrowserLanguage] = useState<Language>("en");

  function persistLanguage(languageValue: Language) {
    localStorage.setItem("mochi-language", languageValue);
    document.cookie = `mochi-language=${languageValue}; path=/; max-age=31536000; samesite=lax`;
  }

  useEffect(() => {
    const detectedLanguage =
      typeof navigator !== "undefined" &&
      navigator.language.toLowerCase().startsWith("es")
        ? "es"
        : "en";
    setBrowserLanguage(detectedLanguage);

    const savedLanguage = localStorage.getItem("mochi-language");
    if (savedLanguage === "en" || savedLanguage === "es") {
      setLanguageState(savedLanguage);
      persistLanguage(savedLanguage);
    } else {
      setLanguageState(detectedLanguage);
      persistLanguage(detectedLanguage);
    }
  }, []);

  function setLanguage(languageValue: Language) {
    setLanguageState(languageValue);
    persistLanguage(languageValue);
  }

  const value = useMemo(
    () => ({
      language,
      browserLanguage,
      setLanguage,
      isSpanish: language === "es",
    }),
    [language, browserLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
