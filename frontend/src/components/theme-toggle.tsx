"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  if (!mounted) {
    return (
      <button
        className={cn(
          "relative w-9 h-9 flex items-center justify-center rounded-lg hover:border hover:border-border",
          "transition-colors",
          "text-secondary-foreground hover:bg-secondary",
          className
        )}
        aria-label="Toggle theme"
      >
        <div className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative w-9 h-9 flex items-center justify-center rounded-lg hover:border hover:border-border",
        "transition-colors",
        "text-secondary-foreground hover:bg-secondary",
        className
      )}
      aria-label="Toggle theme"
    >
      <Sun
        className={cn(
          "h-4 w-4 transition-transform duration-200 ease-in-out",
          resolvedTheme === "light"
            ? "rotate-0 scale-100"
            : "-rotate-90 scale-0"
        )}
      />
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-transform duration-200 ease-in-out",
          resolvedTheme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0"
        )}
      />
    </button>
  );
}
