// Shared brand tokens for the exported deck (PDF + PPTX). Kept independent of
// CaseAnalyzer.jsx so the export module can be code-split without pulling in
// the whole app; values are copied from CaseAnalyzer.jsx's ACCENT/DARK.
export const ACCENT = "#0098DB";
export const DARK = "#12263A";
export const LIGHT_BG = "#EBEDEF";
export const CARD_BG = "#FFFFFF";
export const TEXT_DARK = "#0F1E2E";
export const TEXT_MUTED = "#5B6B7A";
export const TEXT_ON_DARK = "#E7EDF2";
export const TEXT_MUTED_ON_DARK = "#9FB0BE";
export const RED = "#DC2626";
export const RED_BG = "#FEF2F2";

// import.meta.env.BASE_URL respects vite.config.js's `base` ("/CaseAnalyzer/"
// in both dev and the GitHub Pages build) — a hardcoded root-absolute path
// would 404 once deployed.
export const LOGO_URL = `${import.meta.env.BASE_URL}milestone-logo.png`;
// Cropped-asset aspect ratio (width/height) — pptxgenjs needs an explicit w+h
// per image (no auto aspect-ratio sizing like react-pdf's width-only Image).
export const LOGO_ASPECT = 563 / 131;

// Tier colors for the solution-stack diagram, bottom (device integration) to
// top (cloud) — dark-to-accent gradient matching the reference deck's
// device/platform/extensions bar coloring.
export const SOLUTION_TIER_COLORS = {
  deviceIntegration: "#8A97A3",
  platform: DARK,
  extensions: "#0D5C8C",
  analytics: "#0A7FB8",
  cloud: ACCENT,
};

export const PHASE_COLORS = {
  Solution: "#0D5C8C",
  Transition: "#B45309",
  Financial: "#15803D",
};
