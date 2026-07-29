import { describe, expect, it } from 'vitest';
import {
  MAX_HEARTBEAT_DELTA_SECONDS,
  MIN_LESSON_TIME_CAP_SECONDS,
  clampHeartbeatDelta,
  formatDuration,
  formatHours,
  lessonTimeCapSeconds,
  minRequiredSeconds,
} from './learning-time';

/**
 * The heartbeat is the only unverifiable input in the product: the browser
 * asserts how much time passed and the server has no way to check. These tests
 * pin the clamping, because a regression here does not crash anything — it
 * quietly inflates every learning-hours figure in the Reports zone.
 */
describe('clampHeartbeatDelta', () => {
  it('accepts a normal tick', () => {
    expect(clampHeartbeatDelta(30)).toBe(30);
  });

  it('caps an oversized delta rather than trusting it', () => {
    expect(clampHeartbeatDelta(9999)).toBe(MAX_HEARTBEAT_DELTA_SECONDS);
    expect(clampHeartbeatDelta(Number.MAX_SAFE_INTEGER)).toBe(MAX_HEARTBEAT_DELTA_SECONDS);
  });

  it('floors fractional seconds', () => {
    expect(clampHeartbeatDelta(30.9)).toBe(30);
  });

  it('treats junk as zero instead of throwing', () => {
    // A malformed heartbeat must never break lesson playback.
    for (const junk of [null, undefined, NaN, Infinity, -Infinity, -5, 0, 'abc', {}, []]) {
      expect(clampHeartbeatDelta(junk)).toBe(0);
    }
  });

  it('accepts a numeric string, since JSON bodies are not typed', () => {
    expect(clampHeartbeatDelta('45')).toBe(45);
  });
});

describe('lessonTimeCapSeconds', () => {
  it('is 4x the declared length for a long lesson', () => {
    expect(lessonTimeCapSeconds(30)).toBe(30 * 60 * 4);
  });

  it('never drops below the one-hour floor', () => {
    // Text lessons commonly declare duration_minutes = 0.
    expect(lessonTimeCapSeconds(0)).toBe(MIN_LESSON_TIME_CAP_SECONDS);
    expect(lessonTimeCapSeconds(5)).toBe(MIN_LESSON_TIME_CAP_SECONDS);
    expect(lessonTimeCapSeconds(null)).toBe(MIN_LESSON_TIME_CAP_SECONDS);
    expect(lessonTimeCapSeconds(undefined)).toBe(MIN_LESSON_TIME_CAP_SECONDS);
  });

  it('rejects a negative declared duration', () => {
    expect(lessonTimeCapSeconds(-10)).toBe(MIN_LESSON_TIME_CAP_SECONDS);
  });
});

describe('minRequiredSeconds', () => {
  it('uses 80% of a video runtime', () => {
    expect(minRequiredSeconds('video', 10, null)).toBe(480);
  });

  it('floors a text lesson at three minutes', () => {
    expect(minRequiredSeconds('text', 0, 'two words')).toBe(180);
  });

  it('scales text with word count at 150 wpm', () => {
    const words = Array.from({ length: 1500 }, () => 'word').join(' ');
    expect(minRequiredSeconds('text', 0, words)).toBe(600);
  });

  it('adds both components for a mixed lesson', () => {
    expect(minRequiredSeconds('mixed', 10, 'short text')).toBe(480 + 180);
  });

  it('falls back to three minutes when nothing is declared', () => {
    expect(minRequiredSeconds('video', 0, null)).toBe(180);
    expect(minRequiredSeconds(null, null, null)).toBe(180);
  });
});

describe('formatDuration', () => {
  it('formats across the unit boundaries', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3599)).toBe('59m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3900)).toBe('1h 05m');
  });

  it('never renders a negative or non-numeric duration', () => {
    expect(formatDuration(-100)).toBe('0s');
    expect(formatDuration(null)).toBe('0s');
    expect(formatDuration(undefined)).toBe('0s');
  });
});

describe('formatHours', () => {
  it('renders one decimal place', () => {
    expect(formatHours(5400)).toBe('1.5h');
    expect(formatHours(0)).toBe('0.0h');
  });
});
