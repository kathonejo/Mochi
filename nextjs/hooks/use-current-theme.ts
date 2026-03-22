"use client";

import { useState, useEffect } from "react";

export type SiteTheme = "neural" | "black-pink" | "kawaii" | "pastel";

export function useCurrentTheme(): SiteTheme {
  const [theme, setTheme] = useState<SiteTheme>("neural");

  useEffect(() => {
    const read = () =>
      (document.documentElement.getAttribute("data-theme") as SiteTheme) ??
      "neural";
    setTheme(read());

    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
