import { useContext } from "react";
import { ThemeContext } from "./theme-context.js";

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme precisa ser usado dentro de ThemeProvider.");
  }

  return context;
}
