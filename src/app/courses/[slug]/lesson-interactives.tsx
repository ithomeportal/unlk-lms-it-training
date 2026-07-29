'use client';

import { useEffect, useRef } from 'react';

/**
 * Wires up the interactive elements that admin-authored lesson HTML can declare.
 *
 * Lesson bodies are sanitised (no <script>, no inline `style`, no data-*), so
 * behaviour is expressed purely through class names and activated here via one
 * delegated click listener:
 *
 *   <div class="kc-block">
 *     <p class="kc-title">Knowledge Check</p>
 *     <div class="kc-question">
 *       <p class="kc-prompt">1. Question text?</p>
 *       <button class="kc-option">A) Wrong</button>
 *       <button class="kc-option kc-correct">B) Right</button>
 *     </div>
 *   </div>
 *
 *   <button class="module-continue">Complete Module &amp; Continue</button>
 *
 * A question accepts one answer: the picked option turns green (#D4EDDA) when
 * it carries `kc-correct` and red (#F8D7DA) otherwise, and a wrong pick also
 * reveals the correct option so the learner sees the answer. The continue
 * button calls back into the viewer's existing markComplete(), which records
 * progress and advances to the next module.
 */
export function LessonInteractives({
  children,
  onContinue,
}: {
  children: React.ReactNode;
  onContinue: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const continueButton = target.closest('.module-continue');
      if (continueButton && root.contains(continueButton)) {
        event.preventDefault();
        onContinue();
        return;
      }

      const option = target.closest('.kc-option');
      if (!option || !root.contains(option)) return;

      event.preventDefault();
      const question = option.closest('.kc-question');
      if (!question || question.classList.contains('kc-answered')) return;

      question.classList.add('kc-answered');
      const isCorrect = option.classList.contains('kc-correct');
      option.classList.add(isCorrect ? 'kc-right' : 'kc-wrong');

      if (!isCorrect) {
        question.querySelector('.kc-option.kc-correct')?.classList.add('kc-right');
      }
    };

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [onContinue]);

  return <div ref={containerRef}>{children}</div>;
}
