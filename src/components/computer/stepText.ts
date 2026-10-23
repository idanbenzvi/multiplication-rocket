import type { ThinkStep } from '../../game/thinkThrough';
import { strategyFor } from '../../game/strategy';
import type { Mission } from '../../game/mission';
import type { Strings } from '../../i18n/strings';

// The words for one of the ship's computer's ways to think a question
// through (game/thinkThrough.ts), for its window (ShipComputer) and for the
// "how does it work?" page's.

/** a step's title, words and math, in the pilot's language */
export function stepText(step: ThinkStep, c: Strings['computer'], t: Strings, question: { x: number; y: number; mission: Mission }) {
  switch (step.id) {
    case 'meaningMul':
      return { title: c.meaningMul.title, text: c.meaningMul.text(step.x, step.y) };
    case 'skip':
      return { title: c.skip.title, text: c.skip.text(step.by, step.jumps) };
    case 'trick': {
      const s = strategyFor(question.x, question.y, t, question.mission);
      return { title: c.trick.title, text: s.text ?? c.trick.text, math: s.math };
    }
    case 'known':
      return { title: c.known.title, text: c.known.text(step.p, step.q, step.known, step.add), math: step.math };
    case 'swap':
      return { title: c.swap.title, text: c.swap.text(step.x, step.y) };
    case 'meaningAdd':
      return { title: c.meaningAdd.title, text: c.meaningAdd.text(step.x, step.y) };
    case 'meaningTens':
      return { title: c.meaningTens.title, text: c.meaningTens.text };
    case 'countOn':
      return { title: c.countOn.title, text: c.countOn.text(step.big, step.small) };
    case 'swapAdd':
      return { title: c.swapAdd.title, text: c.swapAdd.text(step.x, step.y), math: step.math };
  }
}
