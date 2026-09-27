import { shuffle } from "./games";
import type { Exhibit } from "./types";

// Street challenges: now and then, three word tiles appear on the ground ahead of a
// visitor walking through an open-air landmark. Step on (or click) the word that matches
// the floating clue. No menu and no timer; walking away simply lets it go.
export const CHALLENGES_KEY = "vocabhall.challenges.v1";
export const FIRST_AFTER = 40_000;
export const EVERY = 150_000;
export type ChallengeStats = { won: number; off: boolean };
export type Challenge = { answer: Exhibit; options: Exhibit[]; wrong: string[]; solved: boolean };

export function readChallengeStats(): ChallengeStats {
  try {
    const data = JSON.parse(localStorage.getItem(CHALLENGES_KEY) || "{}");
    return { won: Number.isSafeInteger(data.won) && data.won > 0 ? data.won : 0, off: data.off === true };
  } catch { return { won: 0, off: false }; }
}
export function saveChallengeStats(stats: ChallengeStats) {
  try { localStorage.setItem(CHALLENGES_KEY, JSON.stringify(stats)); } catch { /* Kept for this visit. */ }
}

/** One word from the place (words due for review first, then unlearned) and two others from the same place. */
export function pickChallenge(pool: Exhibit[], checked: string[], due: string[]): Challenge | null {
  const unique = pool.filter((e, i) => pool.findIndex((o) => o.id === e.id || o.word.toLowerCase() === e.word.toLowerCase()) === i);
  if (unique.length < 3) return null;
  const answer = [...shuffle(unique.filter((e) => due.includes(e.id))), ...shuffle(unique.filter((e) => !checked.includes(e.id))), ...shuffle(unique)][0];
  const others = shuffle(unique.filter((e) => e.id !== answer.id && e.definition !== answer.definition)).slice(0, 2);
  if (others.length < 2) return null;
  return { answer, options: shuffle([answer, ...others]), wrong: [], solved: false };
}
