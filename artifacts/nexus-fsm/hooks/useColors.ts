import colors from '@/constants/colors';

/**
 * Returns the design tokens for the NEXXUS FSM navy theme.
 * The brand is dark-first: both light and dark schemes use the same palette.
 */
export function useColors() {
  return { ...colors.dark, radius: colors.radius };
}
