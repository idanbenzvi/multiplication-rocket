import { useEffect, useState } from 'react';
import { useGameStore } from '../game/useGameStore';
import { useAchievements } from '../game/useAchievements';
import { DEV_COLLECT_EVENT, DEV_SOLVE_EVENT } from '../dev/devMode';
import { useRippleStatus } from '../dev/rippleStatus';
import { perfReport, usePerf } from '../dev/perfMonitor';
import { MonsterGallery } from './sun/MonsterGallery';

interface Shortcut {
  key: string;
  label: string;
  run: () => void;
}

// Only mounted with ?devmode=true. Shift+key shortcuts (and tappable rows,
// for tablets) jump to any special round or game state.
export function DevPanel() {
  // collapsed by default on phones, where it would cover the answer buttons
  const [open, setOpen] = useState(() => window.innerWidth >= 600);
  const store = useGameStore;
  const ripple = useRippleStatus();
  const perf = usePerf();
  const [copied, setCopied] = useState(false);
  const [gallery, setGallery] = useState(false);

  const shortcuts: Shortcut[] = [
    { key: 'W', label: 'Wormhole', run: () => store.getState().devStartBonus('wormhole') },
    { key: 'M', label: 'Meteor Shower', run: () => store.getState().devStartBonus('meteor') },
    { key: 'C', label: 'Constellation', run: () => store.getState().devStartBonus('constellation') },
    { key: 'B', label: 'Fleet Battle (blast)', run: () => store.getState().devStartBonus('battle') },
    { key: 'S', label: 'Stranded Fleet', run: () => store.getState().devStartBonus('stranded') },
    { key: 'D', label: 'Stardust Run', run: () => store.getState().devStartBonus('stardust') },
    { key: 'R', label: 'Acceleration Road', run: () => store.getState().devStartBonus('road') },
    { key: 'T', label: 'Space Traffic', run: () => store.getState().devStartBonus('traffic') },
    { key: 'K', label: 'Battle: collect all cannons', run: () => window.dispatchEvent(new Event(DEV_COLLECT_EVENT)) },
    { key: 'G', label: 'Answer the round correctly', run: () => window.dispatchEvent(new Event(DEV_SOLVE_EVENT)) },
    { key: 'L', label: 'Complete level (launch)', run: () => store.getState().devLaunch() },
    { key: 'F', label: 'Fuel to 95%', run: () => store.getState().devSetFuel(95) },
    { key: 'A', label: 'Deep Space Academy', run: () => store.getState().openAcademy() },
    { key: 'P', label: 'Practice map', run: () => store.getState().requestHeatmap() },
    { key: 'E', label: 'Earn the next badge', run: () => useAchievements.getState().devEarnNext() },
    { key: 'U', label: 'Monster Sun gallery', run: () => setGallery(true) },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const hit = shortcuts.find((s) => e.code === `Key${s.key}`);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      hit.run();
    };
    // capture phase: runs before the game's own key handlers
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className={`dev-panel ${open ? '' : 'is-closed'}`} dir="ltr">
      <button
        type="button"
        className="dev-panel-toggle"
        onClick={(e) => {
          e.currentTarget.blur();
          setOpen((o) => !o);
        }}
      >
        DEV {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul>
          {shortcuts.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={(e) => {
                  // Drop focus, or the game's Enter (submit an answer) would
                  // "click" this button again and restart the round.
                  e.currentTarget.blur();
                  s.run();
                }}
              >
                <kbd>⇧{s.key}</kbd> {s.label}
              </button>
            </li>
          ))}
          <li className="dev-status">
            ripple:{' '}
            {ripple.status === 'webgl' ? 'WebGL ✓' : ripple.status === 'fallback' ? `fallback (${ripple.reason})` : 'not started yet'}
          </li>
          {/* hiccups on this device (dev/perfMonitor.ts) */}
          <li className="dev-status">
            ⏱ {perf.fps} fps · freezes {perf.freezes}
            {perf.worst ? ` (worst ${perf.worst} ms)` : ''} · 3D lost {perf.lost}
          </li>
          {perf.events.slice(-4).map((e, i) => (
            <li key={`${e.at}-${i}`} className="dev-status dev-perf-event">
              {e.at}s {e.kind === 'freeze' ? `freeze ${e.ms} ms` : `3D ${e.kind}: ${e.what}`} · {e.where}
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={async (e) => {
                e.currentTarget.blur();
                const text = perfReport();
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  window.prompt('Copy the hiccup log:', text);
                }
              }}
            >
              {copied ? '✓ copied' : '📋 Copy the hiccup log'}
            </button>
          </li>
        </ul>
      )}
      {gallery && <MonsterGallery onClose={() => setGallery(false)} />}
    </div>
  );
}
