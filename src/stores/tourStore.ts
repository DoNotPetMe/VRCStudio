import { create } from 'zustand';

interface TourState {
  activeRoute: string | null;
  set: (route: string | null) => void;
}

export const useTourStore = create<TourState>((set) => ({
  activeRoute: null,
  set: (activeRoute) => set({ activeRoute }),
}));
