"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "neural" | "black-pink" | "kawaii" | "pastel";

export const THEMES: Theme[] = ["neural", "black-pink", "kawaii", "pastel"];

const SESSION_LAST_THEME_KEY = "mochi-theme-last";
const THEME_COOKIE_KEY = "mochi-theme";

function persistTheme(theme: Theme) {
  try {
    sessionStorage.setItem(SESSION_LAST_THEME_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }

  document.cookie = `${THEME_COOKIE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  initialTheme = "kawaii",
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    const currentAttr = document.documentElement.getAttribute("data-theme");
    const current: Theme | null =
      currentAttr === "pink"
        ? "black-pink"
        : THEMES.includes(currentAttr as Theme)
          ? (currentAttr as Theme)
          : null;
    const resolved =
      current
        ? current
        : initialTheme;
    setThemeState(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    document.body.setAttribute("data-theme", resolved);
    persistTheme(resolved);
  }, [initialTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    persistTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    document.body.setAttribute("data-theme", newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
