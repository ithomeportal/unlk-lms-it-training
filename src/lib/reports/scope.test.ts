import { describe, expect, it } from 'vitest';
import { scopeFromParams } from './queries';

/**
 * The cohort toggle is parsed once, in `scopeFromParams`, so five report routes
 * cannot each invent their own truthiness rule. These assert the exact contract
 * — anything other than an explicit opt-in means current employees only.
 *
 * Getting this wrong in the permissive direction silently puts ex-employees
 * back in front of HR, which is the whole defect this work exists to fix.
 */
describe('scopeFromParams', () => {
  it('defaults to current employees only when the parameter is absent', () => {
    expect(scopeFromParams(new URLSearchParams())).toEqual({ includeInactive: false });
  });

  it.each(['1', 'true'])('opts in on %s', (value) => {
    expect(scopeFromParams(new URLSearchParams({ includeInactive: value }))).toEqual({
      includeInactive: true,
    });
  });

  it.each(['0', 'false', '', 'yes', 'TRUE', 'on'])(
    'does NOT opt in on %s — only an exact 1 or true widens the cohort',
    (value) => {
      expect(scopeFromParams(new URLSearchParams({ includeInactive: value }))).toEqual({
        includeInactive: false,
      });
    }
  );
});
