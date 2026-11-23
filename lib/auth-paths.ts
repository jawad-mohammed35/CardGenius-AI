export function safeAuthReturn(value: string | null) {
  return value === "/study-decks" || value === "/account/settings" ? value : "/account";
}
