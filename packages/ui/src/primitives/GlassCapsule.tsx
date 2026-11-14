import type { ComponentType, ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';

/** Swift `AgentDetailHeader.glassOpacity`. */
export const GLASS_OPACITY = 0.8;

const useStyles = makeStyles((t) => ({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: t.metrics.minTapSize,
    borderRadius: t.radius.capsule,
    overflow: 'hidden',
  },
  fallback: { borderWidth: t.metrics.hairlineWidth, borderColor: t.hairline },
}));

interface GlassModule {
  GlassView: ComponentType<{ style?: unknown; testID?: string; children?: ReactNode }>;
  isLiquidGlassAvailable?: () => boolean;
}

let glass: GlassModule | null | undefined;

/** expo-glass-effect where liquid glass exists (iOS 26+), null elsewhere (Android, web, tests). */
function loadGlass(): GlassModule | null {
  if (glass !== undefined) return glass;
  glass = null;
  if (Platform.OS !== 'ios') return glass;
  try {
    // Lazy so Android, web and Jest never evaluate the native module.
    const mod = require('expo-glass-effect') as GlassModule;
    glass = mod.isLiquidGlassAvailable?.() ? mod : null;
  } catch {
    glass = null;
  }
  return glass;
}

interface GlassCapsuleProps {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The floating capsule behind header controls (Agent detail, Home toolbar). iOS 26: a liquid
 * glass view at 0.8 opacity. Everywhere else: `surfaceRaised` at 80% with the hairline.
 * Screens never pick; this does.
 */
export function GlassCapsule({ children, style, testID = 'glass-capsule' }: GlassCapsuleProps) {
  const styles = useStyles();
  const theme = useTheme();
  const native = loadGlass();
  if (native) {
    const Glass = native.GlassView;
    return (
      <Glass style={[styles.capsule, { opacity: GLASS_OPACITY }, style]} testID={testID}>
        {children}
      </Glass>
    );
  }
  return (
    <View
      style={[
        styles.capsule,
        styles.fallback,
        { backgroundColor: withAlpha(theme.colors.surfaceRaised, GLASS_OPACITY) },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}
