"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  // Matches SSR default (data-theme="light" on <html>)
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("crove-theme") as "dark" | "light" | null;
    const resolved = stored ?? "light"; // first-time visitors stay on light
    document.documentElement.setAttribute("data-theme", resolved);
    setTheme(resolved);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("crove-theme", next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="p-2 rounded-full border transition-colors hover:border-accent-deep"
      style={{
        color: "var(--color-text-muted)",
        borderColor: "var(--color-surface-line)",
      }}
    >
      <span className="flex w-4 h-4 items-center justify-center">
        {mounted && (theme === "dark" ? (
          <Sun size={16} aria-hidden="true" />
        ) : (
          <Moon size={16} aria-hidden="true" />
        ))}
      </span>
    </button>
  );
}
