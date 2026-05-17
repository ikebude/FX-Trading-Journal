/**
 * T5.8 — generic undo/redo history (pure).
 *
 * A zipper: past[] · present · future[]. `push` records a new present and
 * clears the redo stack. Capacity-bounded so long edit sessions stay light.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
}

export function createHistory<T>(initial: T, limit = 50): History<T> {
  return { past: [], present: initial, future: [], limit };
}

export function push<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  const past = [...h.past, h.present];
  if (past.length > h.limit) past.shift();
  return { ...h, past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return {
    ...h,
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return {
    ...h,
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
  };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
