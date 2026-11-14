/** Practice venues: colour schemes for the hall (the lane physics are identical). */
export const VENUES = {
  neon: { name: "Neon Lanes", a: "#2f8bff", b: "#ff7a1a", wall: "#0d1120", light: "#fff3dd", ambient: [0.09, 0.09, 0.12] },
  cosmic: { name: "Cosmic Night", a: "#9b5cff", b: "#39ff8a", wall: "#0a0618", light: "#c9b8ff", ambient: [0.07, 0.05, 0.12] },
  classic: { name: "Retro Alley", a: "#ffb347", b: "#e2363c", wall: "#2a1810", light: "#ffe2b0", ambient: [0.14, 0.1, 0.07] },
  arena: { name: "Championship Arena", a: "#e8f1ff", b: "#1e6bff", wall: "#151b2b", light: "#ffffff", ambient: [0.16, 0.16, 0.18] },
} as const;
export type VenueId = keyof typeof VENUES;
