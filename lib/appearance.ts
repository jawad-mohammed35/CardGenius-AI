export const accents = [
  { id: "monochrome", label: "Monochrome", light: "#171717", dark: "#F5F5F5" },
  { id: "blue", label: "Blue", light: "#2563EB", dark: "#3B82F6" },
  { id: "purple", label: "Purple", light: "#7C3AED", dark: "#A78BFA" },
  { id: "emerald", label: "Emerald", light: "#059669", dark: "#34D399" },
  { id: "rose", label: "Rose", light: "#E11D48", dark: "#FB7185" },
  { id: "orange", label: "Orange", light: "#EA580C", dark: "#FB923C" },
] as const;

export type Accent = (typeof accents)[number]["id"];
export const themes = ["light", "dark", "oled"] as const;
export type Theme = (typeof themes)[number];
export const themeKey = "cardgenius-theme";
export const accentKey = "cardgenius-accent";

export const restoreAppearance = `try {
  const root = document.documentElement;
  const theme = localStorage.getItem(${JSON.stringify(themeKey)});
  const accent = localStorage.getItem(${JSON.stringify(accentKey)});
  if (${JSON.stringify(themes)}.includes(theme)) root.dataset.theme = theme;
  if (${JSON.stringify(accents.map(({ id }) => id))}.includes(accent)) root.dataset.accent = accent;
} catch {}`;
