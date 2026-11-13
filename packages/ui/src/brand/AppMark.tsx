import { Animated, View } from 'react-native';
import { markGeometry as g } from './mark.generated';
import {
  CardRim,
  GlowBorder,
  MarkLayer,
  MetalPiece,
  PromptChevron,
  SpectrumFill,
} from './markPieces';

type Driven = number | Animated.AnimatedInterpolation<number>;
type DrivenAngle = string | Animated.AnimatedInterpolation<string>;

/** What moves while the mark assembles (opacities 0..1, scales, angles, the pocket's offset in points). */
export interface MarkMotion {
  prompt: Driven;
  center: Driven;
  centerScaleX: Driven;
  centerScaleY: Driven;
  fill: Driven;
  glow: Driven;
  hueMiddle: Driven;
  hueLast: Driven;
  rim: Driven;
  sides: Driven;
  rightAngle: DrivenAngle;
  leftAngle: DrivenAngle;
  pocket: Driven;
  pocketY: Driven;
}

/** The assembled mark: the app icon's last frame. */
const STILL: MarkMotion = {
  prompt: 0,
  center: 1,
  centerScaleX: 1,
  centerScaleY: 1,
  fill: 0,
  glow: 0,
  hueMiddle: 0,
  hueLast: 0,
  rim: 1,
  sides: 1,
  rightAngle: `${g.fanAngle}deg`,
  leftAngle: `${-g.fanAngle}deg`,
  pocket: 1,
  pocketY: 0,
};

interface AppMarkProps {
  /** Side of the square the 1024 canvas is drawn into, in points. */
  size: number;
  /** Values that assemble the mark (the launch); without them the mark stands still. */
  motion?: MarkMotion;
  testID?: string;
}

/**
 * The app mark (three cards fanned out of a pocket) in the icon's dark metal finish, drawn from the
 * one definition in tokens/mark.json at any size. Decorative: it never takes touches or focus.
 */
export function AppMark({ size, motion, testID = 'app-mark' }: AppMarkProps) {
  const m = motion ?? STILL;
  const k = size / g.canvas;
  // A transform about a point of the canvas: React Native turns about the view's center.
  const about = (point: { x: number; y: number }, steps: object[]) => [
    { translateX: (point.x - g.canvas / 2) * k },
    { translateY: (point.y - g.canvas / 2) * k },
    ...steps,
    { translateX: -(point.x - g.canvas / 2) * k },
    { translateY: -(point.y - g.canvas / 2) * k },
  ];
  const fanStyle = (angle: DrivenAngle) => ({
    opacity: m.sides,
    transform: about(g.pivot, [{ rotate: angle }]),
  });
  const box = { position: 'absolute', width: size, height: size } as const;
  const centerStyle = {
    opacity: m.center,
    transform: about(g.cardCenter, [{ scaleX: m.centerScaleX }, { scaleY: m.centerScaleY }]),
  };
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, transform: [{ translateY: g.lift * k }] }}
      testID={testID}
    >
      {motion ? (
        <MarkLayer size={size} style={{ opacity: m.prompt }}>
          <PromptChevron />
        </MarkLayer>
      ) : null}
      <MarkLayer size={size} style={fanStyle(m.leftAngle)}>
        <MetalPiece name="left" />
      </MarkLayer>
      <MarkLayer size={size} style={fanStyle(m.rightAngle)}>
        <MetalPiece name="right" />
      </MarkLayer>
      <Animated.View style={[box, centerStyle]}>
        <MarkLayer size={size}>
          <MetalPiece name="center" rim={false} />
        </MarkLayer>
        {motion ? (
          <>
            <MarkLayer size={size} style={{ opacity: m.fill }}>
              <SpectrumFill />
            </MarkLayer>
            <Animated.View style={[box, { opacity: m.glow }]}>
              <MarkLayer size={size}>
                <GlowBorder hue={0} />
              </MarkLayer>
              <MarkLayer size={size} style={{ opacity: m.hueMiddle }}>
                <GlowBorder hue={1} />
              </MarkLayer>
              <MarkLayer size={size} style={{ opacity: m.hueLast }}>
                <GlowBorder hue={2} />
              </MarkLayer>
            </Animated.View>
          </>
        ) : null}
        <MarkLayer size={size} style={{ opacity: m.rim }}>
          <CardRim />
        </MarkLayer>
      </Animated.View>
      <MarkLayer size={size} style={{ opacity: m.pocket, transform: [{ translateY: m.pocketY }] }}>
        <MetalPiece name="pocket" />
      </MarkLayer>
    </View>
  );
}
