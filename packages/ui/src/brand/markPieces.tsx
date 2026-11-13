import type { ReactNode } from 'react';
import { Animated, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { markGeometry as g, markPalette as p } from './mark.generated';

/**
 * The mark's pieces, each drawn in the 1024 canvas of the app icon. Every piece is its own layer
 * (a view holding one Svg) so the launch moves it with a native-driven transform or opacity; no
 * Svg property is ever animated. Gaps are a background-colored outline drawn under each piece
 * (the sketch's `paint-order: stroke`), so the mark sits on the brand black.
 */

type MetalName = keyof typeof p.metal;
type SpectrumStops = readonly { offset: number; color: string }[];

/** A full-box layer: one Svg over the mark's square, moved as a whole. */
export function MarkLayer({
  size,
  style,
  children,
}: {
  size: number;
  style?: StyleProp<Animated.WithAnimatedValue<ViewStyle>>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { width: size, height: size }, style]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${g.canvas} ${g.canvas}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

function Vertical({ id, top, bottom }: { id: string; top: string; bottom: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset={0} stopColor={top} />
      <Stop offset={1} stopColor={bottom} />
    </LinearGradient>
  );
}

function RimGradient({ id }: { id: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {p.rim.stops.map((s) => (
        <Stop key={s.offset} offset={s.offset} stopColor={p.rim.color} stopOpacity={s.opacity} />
      ))}
    </LinearGradient>
  );
}

function SpectrumGradient({ id, stops }: { id: string; stops: SpectrumStops }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      {stops.map((s) => (
        <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
      ))}
    </LinearGradient>
  );
}

const { x, y, width, height, rx } = g.card;
const cardProps = { x, y, width, height, rx };
const outline = {
  fill: p.background,
  stroke: p.background,
  strokeWidth: g.gap * 2,
  strokeLinejoin: 'round',
} as const;

/** A card or the pocket in its metal, over its gap outline, with or without its rim of light. */
export function MetalPiece({ name, rim = true }: { name: MetalName; rim?: boolean }) {
  const metal = p.metal[name];
  const shape = (props: object) =>
    name === 'pocket' ? <Path d={g.pocket} {...props} /> : <Rect {...cardProps} {...props} />;
  return (
    <>
      <Defs>
        <Vertical id={`metal-${name}`} top={metal.top} bottom={metal.bottom} />
        {rim ? <RimGradient id={`rim-${name}`} /> : null}
      </Defs>
      {shape(outline)}
      {shape({ fill: `url(#metal-${name})` })}
      {rim ? shape({ fill: 'none', stroke: `url(#rim-${name})`, strokeWidth: g.rimWidth }) : null}
    </>
  );
}

/** The front card's rim alone (the launch fades it in after the color). */
export function CardRim() {
  return (
    <>
      <Defs>
        <RimGradient id="rim-front" />
      </Defs>
      <Rect {...cardProps} fill="none" stroke="url(#rim-front)" strokeWidth={g.rimWidth} />
    </>
  );
}

/** The prompt chevron in the spectrum. */
export function PromptChevron() {
  return (
    <>
      <Defs>
        <SpectrumGradient id="spectrum-prompt" stops={p.spectrum} />
      </Defs>
      <Path
        d={g.prompt}
        fill="none"
        stroke="url(#spectrum-prompt)"
        strokeWidth={g.promptWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** The cursor's color: the front card filled with the spectrum. */
export function SpectrumFill() {
  return (
    <>
      <Defs>
        <SpectrumGradient id="spectrum-fill" stops={p.spectrum} />
      </Defs>
      <Rect {...cardProps} fill="url(#spectrum-fill)" />
    </>
  );
}

/**
 * The glowing border, one hue of the drift. No blur exists here, so the glow is wide strokes at low
 * opacity stacked under the crisp one: a halo that renders the same on every platform.
 */
const GLOW = [
  { width: 64, opacity: 0.12 },
  { width: 46, opacity: 0.2 },
  { width: 30, opacity: 0.35 },
  { width: 14, opacity: 1 },
] as const;

export function GlowBorder({ hue }: { hue: 0 | 1 | 2 }) {
  const id = `spectrum-glow-${hue}`;
  return (
    <>
      <Defs>
        <SpectrumGradient id={id} stops={p.spectrumDrift[hue]} />
      </Defs>
      {GLOW.map((ring) => (
        <Rect
          key={ring.width}
          {...cardProps}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={ring.width}
          strokeOpacity={ring.opacity}
        />
      ))}
    </>
  );
}

/** The sweep's band: the spectrum left to right, its top and bottom edges softened in slices. */
export function BandShape({
  width,
  height,
  slices,
}: {
  width: number;
  height: number;
  slices: readonly { top: number; height: number; opacity: number }[];
}) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="spectrum-band" x1="0" y1="0" x2="1" y2="0">
          {p.spectrum.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </LinearGradient>
      </Defs>
      {slices.map((s) => (
        <Rect
          key={s.top}
          x={0}
          y={s.top * height}
          width={width}
          height={s.height * height}
          fill="url(#spectrum-band)"
          opacity={s.opacity}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({ layer: { position: 'absolute', left: 0, top: 0 } });
