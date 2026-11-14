import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { Spinner } from '../primitives/Spinner';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { makeStyles } from '../theme/theme';

const THUMBNAIL = 64;
const CHIP_NAME_WIDTH = 160;

const useStyles = makeStyles((t) => ({
  strip: { flexGrow: 0 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    paddingBottom: t.spacing.xs,
  },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    ...rounded(t.radius.control),
    overflow: 'hidden',
    backgroundColor: t.colors.control,
  },
  picture: { width: THUMBNAIL, height: THUMBNAIL },
  dimmed: { opacity: 0.5 },
  mark: { position: 'absolute', left: t.spacing.xxs, bottom: t.spacing.xxs },
  remove: { position: 'absolute', top: 0, right: 0 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingLeft: t.spacing.xs,
    ...rounded(t.radius.control),
    backgroundColor: t.colors.control,
  },
  name: { maxWidth: CHIP_NAME_WIDTH },
}));

export interface ComposerAttachmentItem {
  id: string;
  /** What a file's chip reads, and what a thumbnail says to a screen reader. */
  name: string;
  /** A local picture. Without one, or when it cannot be read, the item is a named chip. */
  previewUri?: string;
  /** Absent: the attachment is ready to go with the message. */
  state?: 'uploading' | 'failed';
}

interface ComposerAttachmentStripProps {
  items: readonly ComposerAttachmentItem[];
  onRemove: (id: string) => void;
  /** The remove control's localized label for an item's name. */
  removeLabel: (name: string) => string;
  testID?: string;
}

function StateMark({ item, testID }: { item: ComposerAttachmentItem; testID: string }) {
  if (item.state === 'uploading') return <Spinner testID={`${testID}-uploading`} />;
  if (item.state !== 'failed') return null;
  return (
    <View testID={`${testID}-failed`}>
      <Icon name="warning" size={17} color="warning" />
    </View>
  );
}

function AttachmentTile({
  item,
  onRemove,
  removeLabel,
  testID,
}: {
  item: ComposerAttachmentItem;
  onRemove: () => void;
  removeLabel: string;
  testID: string;
}) {
  const styles = useStyles();
  const [unreadable, setUnreadable] = useState(false);
  const remove = (
    <Button
      kind="text"
      size="small"
      neutral
      icon="close"
      iconSize={14}
      accessibilityLabel={removeLabel}
      onPress={onRemove}
      testID={`${testID}-remove`}
    />
  );
  if (item.previewUri === undefined || unreadable) {
    return (
      <View style={styles.chip} testID={testID}>
        {item.state ? (
          <StateMark item={item} testID={testID} />
        ) : (
          <Icon name="file" size={17} color="textSecondary" />
        )}
        <Text variant="caption" numberOfLines={1} style={styles.name}>
          {item.name}
        </Text>
        {remove}
      </View>
    );
  }
  return (
    <View style={styles.thumbnail} testID={testID}>
      <Image
        source={{ uri: item.previewUri }}
        style={[styles.picture, item.state ? styles.dimmed : null]}
        onError={() => setUnreadable(true)}
        accessibilityLabel={item.name}
        accessibilityIgnoresInvertColors
        testID={`${testID}-preview`}
      />
      <View style={styles.mark}>
        <StateMark item={item} testID={testID} />
      </View>
      <View style={styles.remove}>{remove}</View>
    </View>
  );
}

/** What goes with the next message, above the composer: thumbnails and file chips, each removable. */
export function ComposerAttachmentStrip({
  items,
  onRemove,
  removeLabel,
  testID = 'composer-attachments',
}: ComposerAttachmentStripProps) {
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.strip}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      {items.map((item) => (
        <AttachmentTile
          key={item.id}
          item={item}
          onRemove={() => onRemove(item.id)}
          removeLabel={removeLabel(item.name)}
          testID={`composer-attachment-${item.id}`}
        />
      ))}
    </ScrollView>
  );
}
