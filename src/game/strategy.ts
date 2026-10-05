import type { Strings } from '../i18n/strings';

// `text` is translated prose; `math` is a language-neutral expression that's
// always rendered left-to-right (so it reads correctly inside the Hebrew RTL
// layout). Either can be absent.
export interface Strategy {
  text?: string;
  math?: string;
}

// Rule-based "how to think about it" decomposition, checked in order from
// most-trivial to most-general. Every non-trivial rule stops one step short
// of the final sum (ends in "→ ?") — it reduces a hard multiplication fact to
// an easy addition/subtraction/halving step, but leaves that last step for
// the child to actually do, so the hint scaffolds the strategy without
// handing over the answer.
export function strategyFor(x: number, y: number, t: Strings): Strategy {
  if (x === 1 || y === 1) {
    return { text: t.hintTimesOne };
  }

  if (x === 10 || y === 10) {
    return { text: t.hintTimesTen };
  }

  if (x === 9 || y === 9) {
    const n = x === 9 ? y : x;
    return { math: `${n} × 9  →  ${n} × 10 − ${n}  →  ${n * 10} − ${n}  →  ?` };
  }

  if (x === 5 || y === 5) {
    const n = x === 5 ? y : x;
    return { math: `${n} × 5  →  ${n} × 10 ÷ 2  →  ${n * 10} ÷ 2  →  ?` };
  }

  if (x === 2 || y === 2) {
    const n = x === 2 ? y : x;
    return { math: `${n} × 2  →  ${n} + ${n}  →  ?` };
  }

  if (x <= 4 && y <= 4) {
    return { text: t.hintSmall(x, y) };
  }

  if (x % 2 === 0 || y % 2 === 0) {
    const [even, odd] = x % 2 === 0 ? [x, y] : [y, x];
    const half = even / 2;
    return {
      text: t.hintHalveDouble,
      math: `${odd} × ${even}  →  ${odd} × ${half} = ${odd * half}  →  ${odd * half} × 2  →  ?`,
    };
  }

  // What's left at this point (both odd, neither 1/5/9) is only combinations
  // of 3 and 7, so the bigger factor is always > 5 and this split is safe.
  const [big, small] = x >= y ? [x, y] : [y, x];
  const remainder = big - 5;
  return {
    math: `${small} × ${big}  →  ${small}×5 + ${small}×${remainder}  →  ${small * 5} + ${small * remainder}  →  ?`,
  };
}
