import { useSyncExternalStore } from "react";
import { dayKey } from "./daily";

// Words to revisit: a word missed in a chat, a game or a lost-label question comes back
// first in later chats and games, until it has been answered right on two separate days.
export const REVIEW_KEY = "vocabhall.review.v1";
export const RIGHT_TO_CLEAR = 2;
type Entry = { misses: number; right: number; last: string };
let book: Record<string, Entry> = (() => {
  try {
    const data = JSON.parse(localStorage.getItem(REVIEW_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, e]) => {
      const entry = e as Entry;
      return entry && Number.isSafeInteger(entry.misses) && Number.isSafeInteger(entry.right) && typeof entry.last === "string";
    })) as Record<string, Entry>;
  } catch { return {}; }
})();
let ids = Object.keys(book);
const listeners = new Set<() => void>();
function commit(next: Record<string, Entry>) {
  book = next; ids = Object.keys(book);
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(book)); } catch { /* Kept for this visit. */ }
  listeners.forEach((listener) => listener());
}

/** A miss puts the word on the list (again) and resets its progress. */
export function recordMiss(id: string) {
  commit({ ...book, [id]: { misses: (book[id]?.misses ?? 0) + 1, right: 0, last: dayKey() } });
}
/** A right answer counts once per day; enough of them clear the word. */
export function recordRight(id: string) {
  const entry = book[id], today = dayKey();
  if (!entry || entry.last === today) return;
  const right = entry.right + 1;
  if (right >= RIGHT_TO_CLEAR) { const { [id]: _cleared, ...rest } = book; commit(rest); }
  else commit({ ...book, [id]: { ...entry, right, last: today } });
}
export const reviewIds = () => ids;
export function useReviewIds() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, reviewIds);
}
