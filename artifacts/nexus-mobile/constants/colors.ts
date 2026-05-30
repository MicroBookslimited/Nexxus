/**
 * NEXXUS POS — dark navy + blue/cyan brand palette.
 *
 * The app is intentionally dark-only: BOTH the `light` and `dark` keys hold the
 * same navy palette so the branded look is consistent regardless of the device's
 * appearance setting. useColors() returns whichever matches the scheme — both
 * resolve to the same values.
 */

const palette = {
  // Legacy aliases
  text: "#F1F5FB",
  tint: "#3B82F6",

  // Core surfaces
  background: "#0B1220",
  foreground: "#F1F5FB",

  // Cards / elevated surfaces
  card: "#131C2E",
  cardForeground: "#E8EEF7",

  // Primary action color
  primary: "#3B82F6",
  primaryForeground: "#FFFFFF",

  // Secondary interactive surfaces
  secondary: "#1B2740",
  secondaryForeground: "#C7D3E6",

  // Muted / subdued elements
  muted: "#1B2740",
  mutedForeground: "#8597B2",

  // Accent (cyan)
  accent: "#22D3EE",
  accentForeground: "#06222B",

  // Destructive
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",

  // Borders + inputs
  border: "#243352",
  input: "#243352",
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export default colors;
