import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

type Point = { x: number; y: number };
type Stroke = Point[];

export interface SignaturePadHandle {
  strokes: Stroke[];
  clear: () => void;
}

/**
 * Draws strokes with a PanResponder onto an SVG surface. `onChange` receives
 * the current strokes; use `strokesToSvgDataUrl` to serialize for upload.
 * No native capture library needed — the signature is stored as an SVG data
 * URL, which renders in any <img> (web POS) and expo-image.
 */
export function strokesToSvgDataUrl(strokes: Stroke[], width: number, height: number): string {
  const lines = strokes
    .filter((s) => s.length > 1)
    .map(
      (s) =>
        `<polyline points="${s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/>${lines}</svg>`;
  // btoa is available in Hermes + web; handle unicode-safety trivially (ASCII only here)
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function SignaturePad({
  height = 200,
  onStrokesChange,
}: {
  height?: number;
  onStrokesChange: (strokes: Stroke[], size: { width: number; height: number }) => void;
}) {
  const colors = useColors();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentRef = useRef<Stroke>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const sizeRef = useRef({ width: 0, height });
  const [, setTick] = useState(0);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          currentRef.current = [{ x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY }];
          setTick((n) => n + 1);
        },
        onPanResponderMove: (evt) => {
          currentRef.current.push({ x: evt.nativeEvent.locationX, y: evt.nativeEvent.locationY });
          setTick((n) => n + 1);
        },
        onPanResponderRelease: () => {
          if (currentRef.current.length > 1) {
            const next = [...strokesRef.current, currentRef.current];
            strokesRef.current = next;
            setStrokes(next);
            onStrokesChange(next, sizeRef.current);
          }
          currentRef.current = [];
        },
      }),
    [onStrokesChange],
  );

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = [];
    setStrokes([]);
    onStrokesChange([], sizeRef.current);
  };

  const toPoints = (s: Stroke) => s.map((p) => `${p.x},${p.y}`).join(' ');
  const empty = strokes.length === 0 && currentRef.current.length === 0;

  return (
    <View>
      <View
        {...pan.panHandlers}
        onLayout={(e) => { sizeRef.current = { width: e.nativeEvent.layout.width, height }; }}
        style={[styles.pad, { height, borderColor: colors.border }]}
      >
        <Svg width="100%" height={height}>
          {strokes.map((s, i) => (
            <Polyline key={i} points={toPoints(s)} fill="none" stroke="#111827" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {currentRef.current.length > 1 ? (
            <Polyline points={toPoints(currentRef.current)} fill="none" stroke="#111827" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
        {empty ? (
          <Text style={[styles.hint, { color: '#9CA3AF' }]}>Sign here</Text>
        ) : null}
      </View>
      <Text onPress={clear} style={[styles.clear, { color: colors.accent }]}>
        Clear signature
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  clear: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
  },
});
