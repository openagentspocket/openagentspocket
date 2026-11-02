import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useReducedMotion } from '../motion';
import type { Status } from '../theme/status';
import { useTheme } from '../theme/theme';

const BREATH_MS = 1200;

interface StatusOrbProps {
  status?: Status;
  /** Diameter in points; Swift draws 12 before the Working word. */
  size?: number;
  testID?: string;
}

/**
 * Swift's `SolvingOrbView`: a small orb that breathes (halo scale and fade) while an agent
 * works. Static when Reduce Motion is on. Decorative: the pill beside it says the word.
 */
export function StatusOrb({
  status = 'working',
  size = 12,
  testID = 'status-orb',
}: StatusOrbProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      breath.setValue(0);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(breath, {
        toValue,
        duration: BREATH_MS / 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [breath, reduce]);
  const color = theme.status(status);
  const halo = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: reduce ? 0 : haloOpacity,
          transform: [{ scale: halo }],
        }}
      />
      <View
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size * 0.3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
