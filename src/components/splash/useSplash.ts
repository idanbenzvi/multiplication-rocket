import { create } from 'zustand';

/** the studio's opening is up (StudioSplash.tsx); what waits under it, the launch bay, starts as it leaves */
export const useSplash = create<{ showing: boolean }>(() => ({ showing: true }));
