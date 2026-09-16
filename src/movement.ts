// A short hold starts at walking speed, then smoothly reaches a comfortable run.
// Elapsed time comes from animation frames, independent of keyboard repeat settings.
export function walkingSpeed(forwardSeconds: number, sprint: boolean, precise = false) {
  if (precise) return sprint ? 8 : 4.2;
  const t = Math.min(1, Math.max(0, (forwardSeconds - .65) / 2.6));
  const ease = t * t * (3 - 2 * t);
  return Math.max(sprint ? 8 : 4.2, 4.2 + ease * 10);
}
