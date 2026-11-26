export const studyActions = {
  previous: { label: "Previous card", key: "ArrowLeft" },
  next: { label: "Next card", key: "ArrowRight" },
  flip: { label: "Flip card", key: "Space" },
  known: { label: "Mark as Known", key: "ArrowUp" },
  review: { label: "Mark as Needs Review", key: "ArrowDown" },
  copy: { label: "Copy card", key: "C" },
  fullscreen: { label: "Toggle fullscreen", key: "F" },
  shuffle: { label: "Shuffle deck", key: "S" },
  restart: { label: "Restart study session", key: "R" },
} as const;

export type StudyAction = keyof typeof studyActions;
export type StudyBindings = Record<StudyAction, string>;
export const studyActionIds = Object.keys(studyActions) as StudyAction[];
export const defaultBindings = Object.fromEntries(studyActionIds.map((id) => [id, studyActions[id].key])) as StudyBindings;
const supported = /^(?:Shift\+)?[A-Z0-9]$|^(?:Arrow(?:Up|Down|Left|Right)|Space)$/;

export function readBindings(value: unknown): StudyBindings {
  if (typeof value !== "object" || value === null) return defaultBindings;
  const stored = value as Record<string, unknown>;
  const bindings = { ...defaultBindings };
  for (const id of studyActionIds) {
    const key = stored[id];
    if (typeof key === "string" && supported.test(key)) bindings[id] = key;
  }
  return new Set(Object.values(bindings)).size === studyActionIds.length ? bindings : defaultBindings;
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing">) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null;
  const key = event.key === " " ? "Space" : /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() :
    event.shiftKey && /^Digit[0-9]$/.test(event.code) ? event.code.slice(-1) : event.key;
  const binding = event.shiftKey ? `Shift+${key}` : key;
  return supported.test(binding) ? binding : null;
}

const keyLabels: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc" };
export function shortcutLabel(key: string) { return keyLabels[key] ?? key; }

export function restoreBinding(bindings: StudyBindings, action: StudyAction): StudyBindings {
  const key = defaultBindings[action];
  // If the default was reassigned, swap the two bindings to preserve access to both actions.
  const occupied = studyActionIds.find((id) => id !== action && bindings[id] === key);
  return { ...bindings, ...(occupied && { [occupied]: bindings[action] }), [action]: key };
}
