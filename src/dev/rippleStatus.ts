import { create } from 'zustand';

// What happened the last time the space-ripple shader started, so the DEV
// panel can show it (WebGL can fail on some GPUs/drivers; the ripple then
// falls back to CSS rings instead of silently showing nothing).
interface RippleStatus {
  status: 'unknown' | 'webgl' | 'fallback';
  reason: string;
  set: (status: 'webgl' | 'fallback', reason?: string) => void;
}

export const useRippleStatus = create<RippleStatus>((set) => ({
  status: 'unknown',
  reason: '',
  set: (status, reason = '') => set({ status, reason }),
}));
