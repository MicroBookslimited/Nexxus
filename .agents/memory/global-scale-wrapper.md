---
name: Global app downscale wrapper (mobile)
description: How the Expo app is uniformly downscaled in tablet landscape, and the two traps (remount + safe-area) any change to it must respect.
---

The mobile app applies a global downscale in tablet landscape (width ≥ 768 and width > height) by rendering the whole navigator on a virtual canvas of `(window / s)` with `transform: scale(s)` and `transformOrigin: "top left"` (s = 0.85).

**Why:** Dense POS layouts overflowed in tablet landscape; scaling once at the root beats resizing every screen. RN hit-testing is transform-aware, so taps land correctly.

**How to apply / traps:**
- The wrapper must keep an IDENTICAL tree shape whether scaling is on or off (toggle only style values). Branching to a different nesting remounts the navigator on rotation and resets all screen state.
- Safe-area insets are measured in real pixels but consumed inside the scaled canvas, so they render at s×. Divide insets by s and provide them via `SafeAreaInsetsContext.Provider`. This only works because the app reads insets exclusively through `useSafeAreaInsets` (no native `SafeAreaView`); adding a `SafeAreaView` would bypass the override.
- Native `Modal`/`Alert` render in separate windows and stay at 100% — accepted behavior.
- `useWindowDimensions` consumers still see the real window size while the canvas is larger; flex-based layouts absorb this, but hardcoded full-screen absolute sizes would not.
