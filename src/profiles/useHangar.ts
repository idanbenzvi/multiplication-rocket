import { create } from 'zustand';

/** the hangar (components/Hangar.tsx) opened to change a pilot's ship: their id, or null */
export const useHangar = create<{ pilotId: string | null; open: (id: string) => void; close: () => void }>((set) => ({
  pilotId: null,
  open: (pilotId) => set({ pilotId }),
  close: () => set({ pilotId: null }),
}));
