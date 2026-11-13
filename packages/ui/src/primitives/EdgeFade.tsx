import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

const SOLID = 0.96;

interface EdgeFadeProps {
  /** Which edge the canvas is solid at. */
  edge?: 'top' | 'bottom';
  height: number;
  /** How much of `height`, from the solid edge, stays solid before the fade starts (the chrome's own height). */
  solidHeight?: number;
  testID?: string;
}

/** Offsets of the gradient's stops: solid at the edge, solid to the end of the plateau, clear at the far end. */
export function fadeOffsets(edge: 'top' | 'bottom', height: number, solidHeight: number) {
  const plateau = height > 0 ? Math.min(1, Math.max(0, solidHeight / height)) : 0;
  return edge === 'top'
    ? { edge: 0, plateau, clear: 1 }
    : { edge: 1, plateau: 1 - plateau, clear: 0 };
}

/**
 * A canvas-to-clear fade laid over scrolling content, so floating chrome (the Agent header) reads
 * against what scrolls under it. Never takes touches.
 */
export function EdgeFade({
  edge = 'top',
  height,
  solidHeight = 0,
  testID = 'edge-fade',
}: EdgeFadeProps) {
  const theme = useTheme();
  const offsets = fadeOffsets(edge, height, solidHeight);
  // SVG wants stops in ascending order; the bottom edge is solid at 1.
  const stops = [
    { offset: offsets.edge, opacity: SOLID },
    { offset: offsets.plateau, opacity: SOLID },
    { offset: offsets.clear, opacity: 0 },
  ].sort((a, b) => a.offset - b.offset);
  return (
    <View
      pointerEvents="none"
      style={[styles.fade, edge === 'top' ? styles.top : styles.bottom, { height }]}
      testID={testID}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
            {stops.map(({ offset, opacity }) => (
              <Stop
                key={offset}
                offset={offset}
                stopColor={theme.colors.canvas}
                stopOpacity={opacity}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill="url(#edgeFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
