"use client";

import { useLanguage } from "./language-provider";

function UsaFlag() {
  return (
    <svg viewBox="0 0 28 20" className="h-4 w-5 rounded-[3px]" aria-hidden="true">
      <rect width="28" height="20" fill="#ffffff" />
      <rect y="0" width="28" height="2" fill="#b22234" />
      <rect y="4" width="28" height="2" fill="#b22234" />
      <rect y="8" width="28" height="2" fill="#b22234" />
      <rect y="12" width="28" height="2" fill="#b22234" />
      <rect y="16" width="28" height="2" fill="#b22234" />
      <rect width="12" height="10" fill="#3c3b6e" />
      <circle cx="2.2" cy="2" r="0.6" fill="#ffffff" />
      <circle cx="4.8" cy="2" r="0.6" fill="#ffffff" />
      <circle cx="7.4" cy="2" r="0.6" fill="#ffffff" />
      <circle cx="10" cy="2" r="0.6" fill="#ffffff" />
      <circle cx="3.5" cy="4.3" r="0.6" fill="#ffffff" />
      <circle cx="6.1" cy="4.3" r="0.6" fill="#ffffff" />
      <circle cx="8.7" cy="4.3" r="0.6" fill="#ffffff" />
      <circle cx="2.2" cy="6.6" r="0.6" fill="#ffffff" />
      <circle cx="4.8" cy="6.6" r="0.6" fill="#ffffff" />
      <circle cx="7.4" cy="6.6" r="0.6" fill="#ffffff" />
      <circle cx="10" cy="6.6" r="0.6" fill="#ffffff" />
      <circle cx="3.5" cy="8.9" r="0.6" fill="#ffffff" />
      <circle cx="6.1" cy="8.9" r="0.6" fill="#ffffff" />
      <circle cx="8.7" cy="8.9" r="0.6" fill="#ffffff" />
    </svg>
  );
}

function ArgentinaFlag() {
  return (
    <svg viewBox="0 0 28 20" className="h-4 w-5 rounded-[3px]" aria-hidden="true">
      <rect width="28" height="20" fill="#74acdf" />
      <rect y="6.67" width="28" height="6.66" fill="#ffffff" />
      <circle cx="14" cy="10" r="1.6" fill="#f3b833" />
    </svg>
  );
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === "en" ? "es" : "en";
  const flag = language === "en" ? <UsaFlag /> : <ArgentinaFlag />;
  const title = language === "en" ? "Switch to Spanish" : "Cambiar a inglés";

  return (
    <div className="language-switcher-shell inline-flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5">
      <button
        type="button"
        onClick={() => setLanguage(nextLanguage)}
        title={title}
        aria-label={title}
        className="language-switcher-toggle inline-flex h-8 w-8 items-center justify-center rounded-lg text-base leading-none transition-colors"
      >
        {flag}
      </button>
    </div>
  );
}
