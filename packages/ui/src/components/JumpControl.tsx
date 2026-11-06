import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { impact } from '../haptics';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { Icon, type IconName } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { makeStyles } from '../theme/theme';

/** Idle time before the expanded previous/next pair folds back (ms). */
export const JUMP_IDLE_MS = 2000;

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: 'flex-end' },
  circle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center' },
  pair: { flexDirection: 'column', borderRadius: 24, paddingVertical: t.spacing.xxs },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
}));

export interface JumpControlLabels {
  latest: string;
  previous: string;
  next: string;
}

export const defaultJumpLabels: JumpControlLabels = {
  latest: 'Jump to latest',
  previous: 'Previous message',
  next: 'Next message',
};

interface JumpControlProps {
  /** True only when the timeline is more than one screen from the bottom. */
  visible: boolean;
  onJumpLatest: () => void;
  onPrevious: () => void;
  onNext: () => void;
  /** Starts expanded (previous/next pair), as after a long press. */
  defaultExpanded?: boolean;
  labels?: Partial<JumpControlLabels>;
  testID?: string;
}

function Glyph({
  icon,
  label,
  onPress,
  onLongPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Tappable
      style={styles.button}
      onPress={() => {
        impact('light');
        onPress();
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={17} color="textPrimary" />
    </Tappable>
  );
}

/**
 * The floating jump control at the trailing edge above the composer: a 40pt glass circle that
 * jumps to the latest message; a long press expands to previous/next user message, folding back
 * after two idle seconds.
 */
export function JumpControl({
  visible,
  onJumpLatest,
  onPrevious,
  onNext,
  defaultExpanded = false,
  labels,
  testID = 'jump-control',
}: JumpControlProps) {
  const styles = useStyles();
  const text = { ...defaultJumpLabels, ...labels };
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [touches, setTouches] = useState(0);
  const rearm = () => setTouches((count) => count + 1);
  // Folds back after two idle seconds; every tap on the pair restarts the wait.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `touches` restarts the timer.
  useEffect(() => {
    if (!expanded || defaultExpanded) return;
    const timer = setTimeout(() => setExpanded(false), JUMP_IDLE_MS);
    return () => clearTimeout(timer);
  }, [expanded, defaultExpanded, touches]);
  if (!visible) return null;
  if (!expanded)
    return (
      <View style={styles.wrap} testID={testID}>
        <GlassCapsule style={styles.circle} testID="jump-glass">
          <Glyph
            icon="chevronDown"
            label={text.latest}
            onPress={onJumpLatest}
            onLongPress={() => {
              impact('light');
              setExpanded(true);
            }}
            testID="jump-latest"
          />
        </GlassCapsule>
      </View>
    );
  return (
    <View style={styles.wrap} testID={testID}>
      <GlassCapsule style={styles.pair} testID="jump-glass">
        <View>
          <Glyph
            icon="chevronUp"
            label={text.previous}
            onPress={() => {
              rearm();
              onPrevious();
            }}
            testID="jump-previous"
          />
          <Glyph
            icon="chevronDown"
            label={text.next}
            onPress={() => {
              rearm();
              onNext();
            }}
            testID="jump-next"
          />
        </View>
      </GlassCapsule>
    </View>
  );
}
