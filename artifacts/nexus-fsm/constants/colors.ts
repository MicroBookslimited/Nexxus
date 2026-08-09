/**
 * NEXXUS FSM brand palette — dark navy + blue→teal gradient identity
 * (matches the NEXXUS FSM logo). Dark-first: both schemes use the navy theme.
 */

const navy = {
  text: '#F4F7FB',
  tint: '#2DD4BF',

  background: '#0A1220',
  foreground: '#F4F7FB',

  card: '#111C2F',
  cardForeground: '#F4F7FB',

  primary: '#2DD4BF',
  primaryForeground: '#04121C',

  secondary: '#1A2740',
  secondaryForeground: '#E2EAF4',

  muted: '#16233A',
  mutedForeground: '#8CA0BC',

  accent: '#3B82F6',
  accentForeground: '#FFFFFF',

  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  border: '#1E2C46',
  input: '#1E2C46',

  // Extra semantic tokens
  success: '#22C55E',
  warning: '#F59E0B',
};

const colors = {
  light: navy,
  dark: navy,
  radius: 12,
};

export default colors;
