import { useWindowDimensions } from "react-native";

/**
 * Reactive layout breakpoints for the app. Because it reads
 * `useWindowDimensions()`, every consumer re-renders automatically when the
 * window size changes — so the UI switches between the tablet and phone layouts
 * live on rotation, split-screen, or resize (web).
 *
 * The app is tablet-first: `isTablet` unlocks the richer multi-column / split
 * layouts, and falls back to the compact single-column phone layout below 768px.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isWide = width >= 1024;
  const isLandscape = width > height;

  return {
    width,
    height,
    isTablet,
    isWide,
    isLandscape,
    /** Columns for the product grid (full-width contexts). */
    productColumns: isWide ? 4 : isTablet ? 3 : 2,
    /** Columns for list-style grids (catalog rows, customers). */
    listColumns: isTablet ? 2 : 1,
    /** Max content width for reading-oriented screens; undefined on phone. */
    contentMaxWidth: isWide ? 980 : isTablet ? 760 : undefined,
  };
}
