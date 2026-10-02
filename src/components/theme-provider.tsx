"use client";

import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: (event: MouseEvent<HTMLButtonElement>) => void;
}>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.style.setProperty("--theme-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--theme-y", `${event.clientY}px`);

    const apply = () => {
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("logpose-theme", next);
      setTheme(next);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion && typeof document.startViewTransition === "function") {
      document.startViewTransition(apply);
      return;
    }
    apply();
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
