import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, View } from 'react-native';
import Svg, { Path, Image as SvgImage } from 'react-native-svg';
import { Button } from '../primitives/Button';
import { makeStyles, useTheme } from '../theme/theme';

const STROKE_SHARE = 0.006;

export interface AnnotationPoint {
  x: number;
  y: number;
}

/** A finger's points as an SVG path. */
export function strokePath(points: readonly AnnotationPoint[]): string {
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.canvas, paddingVertical: t.spacing.xl },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  canvas: { flex: 1 },
}));

interface ImageAnnotatorProps {
  uri: string;
  /** The image's size in pixels: drawing and the exported picture use it. */
  width: number;
  height: number;
  labels: { use: string; cancel: string; undo: string };
  /** The picture as PNG in base64, or null when nothing was drawn. */
  onDone: (png: string | null) => void;
  onCancel: () => void;
}

/** Draws over a picture before it goes to the Agent, to point at what matters. */
export function ImageAnnotator({
  uri,
  width,
  height,
  labels,
  onDone,
  onCancel,
}: ImageAnnotatorProps) {
  const styles = useStyles();
  const theme = useTheme();
  const canvas = useRef<Svg>(null);
  const size = useRef({ width: 1, height: 1 });
  const [strokes, setStrokes] = useState<readonly (readonly AnnotationPoint[])[]>([]);
  const responder = useMemo(() => {
    // The picture is fitted inside the canvas, so a touch maps through the fitted scale.
    const point = (x: number, y: number): AnnotationPoint => {
      const scale = Math.min(size.current.width / width, size.current.height / height);
      return {
        x: (x - (size.current.width - width * scale) / 2) / scale,
        y: (y - (size.current.height - height * scale) / 2) / scale,
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: ({ nativeEvent: { locationX, locationY } }) =>
        setStrokes((all) => [...all, [point(locationX, locationY)]]),
      onPanResponderMove: ({ nativeEvent: { locationX, locationY } }) =>
        setStrokes((all) => [
          ...all.slice(0, -1),
          [...(all[all.length - 1] ?? []), point(locationX, locationY)],
        ]),
    });
  }, [width, height]);
  const done = () => {
    if (strokes.length === 0 || !canvas.current) onDone(null);
    else canvas.current.toDataURL((png) => onDone(png), { width, height });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} testID="image-annotator">
      <View style={styles.root}>
        <View style={styles.bar}>
          <Button kind="text" title={labels.cancel} onPress={onCancel} />
          <Button
            kind="text"
            title={labels.undo}
            disabled={strokes.length === 0}
            onPress={() => setStrokes((all) => all.slice(0, -1))}
            testID="image-annotator-undo"
          />
          <Button kind="text" title={labels.use} onPress={done} testID="image-annotator-use" />
        </View>
        <View
          style={styles.canvas}
          onLayout={({ nativeEvent }) => {
            size.current = nativeEvent.layout;
          }}
          testID="image-annotator-canvas"
          {...responder.panHandlers}
        >
          <Svg ref={canvas} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
            <SvgImage href={{ uri }} width={width} height={height} />
            {strokes.map((stroke, index) => (
              <Path
                // Strokes only grow at the end, so a position names one for good.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={index}
                d={strokePath(stroke)}
                stroke={theme.colors.danger}
                strokeWidth={Math.max(width, height) * STROKE_SHARE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        </View>
      </View>
    </Modal>
  );
}
