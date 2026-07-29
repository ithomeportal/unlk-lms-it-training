import { describe, expect, it } from 'vitest';
import {
  classifyLearner,
  daysBetween,
  daysSince,
  dropOffLesson,
  effortRatio,
  formatDays,
  median,
  momentum,
  percent,
  scoreImprovement,
  type LearnerSignals,
} from './metrics';
import { escapeCsv, csvDate, toCsv } from './csv';

function signals(overrides: Partial<LearnerSignals> = {}): LearnerSignals {
  return {
    coursesEnrolled: 3,
    coursesCompleted: 1,
    lessonsCompleted: 10,
    daysSinceActivity: 2,
    overdueMandatory: 0,
    ...overrides,
  };
}

describe('classifyLearner', () => {
  it('marks a recently active learner on track', () => {
    expect(classifyLearner(signals())).toBe('on_track');
  });

  it('marks everything-complete learners as complete', () => {
    expect(classifyLearner(signals({ coursesEnrolled: 3, coursesCompleted: 3 }))).toBe('completed_all');
  });

  it('escalates to at_risk on an overdue requirement even when active daily', () => {
    // The whole point of the ordering: someone working every day but past a
    // compliance deadline is a problem, and "On track" would conceal it.
    expect(classifyLearner(signals({ daysSinceActivity: 0, overdueMandatory: 1 }))).toBe('at_risk');
  });

  it('does not call someone complete while a requirement is overdue', () => {
    expect(
      classifyLearner(signals({ coursesEnrolled: 2, coursesCompleted: 2, overdueMandatory: 1 }))
    ).toBe('at_risk');
  });

  it('separates never-started from at-risk', () => {
    // Someone who never began needs onboarding, not a nudge about slipping.
    expect(
      classifyLearner(signals({ coursesEnrolled: 0, lessonsCompleted: 0, daysSinceActivity: null }))
    ).toBe('never_started');
  });

  it('walks the inactivity thresholds', () => {
    expect(classifyLearner(signals({ daysSinceActivity: 14 }))).toBe('on_track');
    expect(classifyLearner(signals({ daysSinceActivity: 15 }))).toBe('stalled');
    expect(classifyLearner(signals({ daysSinceActivity: 30 }))).toBe('stalled');
    expect(classifyLearner(signals({ daysSinceActivity: 31 }))).toBe('at_risk');
  });
});

describe('momentum', () => {
  it('reads direction of travel', () => {
    expect(momentum(5, 2)).toBe('up');
    expect(momentum(2, 5)).toBe('down');
    expect(momentum(3, 3)).toBe('flat');
  });

  it('treats no activity in either window as flat, not declining', () => {
    expect(momentum(0, 0)).toBe('flat');
  });
});

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('returns null for nothing to measure', () => {
    expect(median([])).toBeNull();
    expect(median([NaN, Infinity])).toBeNull();
  });
});

describe('percent', () => {
  it('never divides by zero', () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(0, 0)).toBe(0);
  });

  it('rounds', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
  });
});

describe('effortRatio', () => {
  it('compares observed effort with authored duration', () => {
    expect(effortRatio(1200, 600)).toBe(2);
    expect(effortRatio(300, 600)).toBe(0.5);
  });

  it('returns null rather than 0 when nothing was measured', () => {
    // 0 would render as "took no time at all"; the truth is "not measured".
    expect(effortRatio(0, 600)).toBeNull();
    expect(effortRatio(600, 0)).toBeNull();
  });
});

describe('formatDays', () => {
  it('never prints a bare 0d', () => {
    // Learners here routinely enrol and finish in one sitting, so the median
    // genuinely is under a day — but "0d" reads as a missing value.
    expect(formatDays(0)).toBe('<1d');
    expect(formatDays(0.4)).toBe('<1d');
  });

  it('formats real durations and missing values', () => {
    expect(formatDays(1)).toBe('1d');
    expect(formatDays(2.5)).toBe('2.5d');
    expect(formatDays(3.0)).toBe('3d');
    expect(formatDays(null)).toBe('—');
    expect(formatDays(undefined)).toBe('—');
    expect(formatDays(NaN)).toBe('—');
  });
});

describe('daysBetween / daysSince', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-07-01T00:00:00Z', '2026-07-08T00:00:00Z')).toBe(7);
  });

  it('is null when either end is missing or unparseable', () => {
    expect(daysBetween(null, '2026-07-08T00:00:00Z')).toBeNull();
    expect(daysBetween('2026-07-01T00:00:00Z', undefined)).toBeNull();
    expect(daysBetween('not a date', '2026-07-08T00:00:00Z')).toBeNull();
  });

  it('never returns a negative age for a future timestamp', () => {
    const now = new Date('2026-07-29T00:00:00Z');
    expect(daysSince('2026-08-10T00:00:00Z', now)).toBe(0);
    expect(daysSince('2026-07-22T00:00:00Z', now)).toBe(7);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe('dropOffLesson', () => {
  const lessons = (counts: number[]) =>
    counts.map((completions, i) => ({
      lesson_id: `l${i}`,
      title: `Lesson ${i + 1}`,
      sort_order: i + 1,
      completions,
    }));

  it('finds the steepest fall', () => {
    expect(dropOffLesson(lessons([10, 9, 3, 2]))).toEqual({
      title: 'Lesson 3',
      sort_order: 3,
      lostLearners: 6,
    });
  });

  it('returns null when nobody drops off', () => {
    expect(dropOffLesson(lessons([5, 5, 5]))).toBeNull();
    expect(dropOffLesson(lessons([5]))).toBeNull();
    expect(dropOffLesson([])).toBeNull();
  });

  it('never blames the first lesson', () => {
    // There is nothing before lesson 1 to fall from; low uptake there is an
    // enrolment problem, not a content cliff.
    expect(dropOffLesson(lessons([2, 2, 2]))).toBeNull();
  });
});

describe('scoreImprovement', () => {
  it('measures last minus first', () => {
    expect(scoreImprovement([40, 60, 90])).toBe(50);
    expect(scoreImprovement([90, 50])).toBe(-40);
  });

  it('needs at least two scored attempts', () => {
    expect(scoreImprovement([80])).toBeNull();
    expect(scoreImprovement([null, 80])).toBeNull();
    expect(scoreImprovement([])).toBeNull();
  });
});

describe('escapeCsv', () => {
  it('quotes values containing a delimiter or newline', () => {
    expect(escapeCsv('Smith, John')).toBe('"Smith, John"');
    expect(escapeCsv('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A display name is user-controlled, and Excel executes a cell starting
    // with any of these on the machine of whoever opens the export.
    expect(escapeCsv('=1+1')).toBe("'=1+1");
    expect(escapeCsv('+44 123')).toBe("'+44 123");
    expect(escapeCsv('-2')).toBe("'-2");
    expect(escapeCsv('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('quotes AND prefixes when a formula also contains a comma', () => {
    expect(escapeCsv('=HYPERLINK("a","b")')).toBe('"\'=HYPERLINK(""a"",""b"")"');
  });

  it('renders missing values as empty, not "null"', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
    expect(escapeCsv(0)).toBe('0');
  });
});

describe('csvDate', () => {
  it('formats and tolerates missing input', () => {
    expect(csvDate('2026-07-29T13:41:43.000Z')).toBe('2026-07-29 13:41:43');
    expect(csvDate(null)).toBe('');
    expect(csvDate('nonsense')).toBe('');
  });
});

describe('toCsv', () => {
  it('emits a header row and CRLF line endings', () => {
    const csv = toCsv(
      [
        { header: 'Name', value: (r: { n: string; v: number }) => r.n },
        { header: 'Value', value: (r: { n: string; v: number }) => r.v },
      ],
      [
        { n: 'a', v: 1 },
        { n: 'b, c', v: 2 },
      ]
    );
    expect(csv).toBe('Name,Value\r\na,1\r\n"b, c",2');
  });
});
