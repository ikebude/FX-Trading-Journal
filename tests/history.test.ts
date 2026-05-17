import { describe, it, expect } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo } from '../src/lib/history';

describe('history — T5.8', () => {
  it('starts with no undo/redo', () => {
    const h = createHistory('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe('a');
  });

  it('push records present and clears redo', () => {
    let h = createHistory('a');
    h = push(h, 'b');
    h = push(h, 'c');
    expect(h.present).toBe('c');
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe('b');
    expect(canRedo(h)).toBe(true);
    h = push(h, 'd'); // diverge → future cleared
    expect(h.present).toBe('d');
    expect(canRedo(h)).toBe(false);
  });

  it('undo/redo round-trips', () => {
    let h = push(push(createHistory(1), 2), 3);
    h = undo(h);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
  });

  it('ignores no-op pushes (same reference)', () => {
    let h = createHistory('a');
    h = push(h, 'a');
    expect(canUndo(h)).toBe(false);
  });

  it('undo/redo are no-ops at the ends', () => {
    const h = createHistory('a');
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('respects the capacity limit', () => {
    let h = createHistory(0, 3);
    for (let i = 1; i <= 10; i++) h = push(h, i);
    expect(h.present).toBe(10);
    expect(h.past.length).toBe(3); // bounded
  });
});
