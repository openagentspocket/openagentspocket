import { t } from '@openagentspocket/i18n';
import { Icon, makeStyles } from '@openagentspocket/ui';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

const useStyles = makeStyles((th) => ({
  handle: {
    minWidth: th.metrics.minTapSize,
    minHeight: th.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

interface DragHandleProps {
  onMove: (translationY: number) => void;
  /** Fires when the finger lifts, with the last translation. */
  onEnd: (translationY: number) => void;
  testID?: string;
}

/** The grip a card is dragged by: a vertical pan reported on the JS thread. */
export function DragHandle({ onMove, onEnd, testID }: DragHandleProps) {
  const styles = useStyles();
  const gesture = usePanGesture({
    runOnJS: true,
    activeOffsetY: [-6, 6],
    onUpdate: (event) => onMove(event.translationY),
    onDeactivate: (event) => onEnd(event.translationY),
  });
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.handle}
        accessible
        accessibilityLabel={t('Drag to reorder')}
        testID={testID}
      >
        <Icon name="grip" />
      </View>
    </GestureDetector>
  );
}
