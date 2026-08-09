import { describe, expect, it } from 'vitest';
import { relativeTime, uptimeSince } from '../format';

describe('relativeTime', () => {
  it('handles null and garbage', () => {
    expect(relativeTime(null)).toBe('Never');
    expect(relativeTime('not-a-date')).toBe('Unknown');
  });

  it('never reports a future timestamp as "Just now"', () => {
    const future = new Date(Date.now() + 3 * 3_600_000).toISOString();
    expect(relativeTime(future)).toBe('Unknown');
  });

  it('formats past times', () => {
    expect(relativeTime(new Date(Date.now() - 30_000).toISOString())).toBe('Just now');
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 hours ago');
  });
});

describe('uptimeSince', () => {
  it('reports days and hours', () => {
    const boot = new Date(Date.now() - (26 * 3_600_000 + 60_000)).toISOString();
    expect(uptimeSince(boot)).toBe('1 day, 2 hr');
  });

  it('is Unknown for future boot times', () => {
    expect(uptimeSince(new Date(Date.now() + 3_600_000).toISOString())).toBe('Unknown');
  });
});
