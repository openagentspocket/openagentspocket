import { type ReactNode, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { composerAction } from '../composer/Composer';
import { ActionMenuButton, type ActionMenuItem, isDeadMenuTrigger } from '../overlay/ActionMenu';
import { useAnchor } from '../overlay/anchors';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';
import { KeyboardDismissButton } from './KeyboardDismissButton';

const CIRCLE = 40;

const useStyles = makeStyles((t) => ({
  card: {
    marginHorizontal: t.spacing.sm,
    borderRadius: 28,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.surfaceRaised,
    overflow: 'hidden',
  },
  oneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xs,
  },
  stack: { paddingHorizontal: t.spacing.xs, paddingVertical: t.spacing.xs, gap: t.spacing.xs },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.control,
  },
  spacer: { flex: 1 },
  input: {
    flex: 1,
    minWidth: 0,
    color: t.colors.textPrimary,
    fontSize: 17,
    lineHeight: 22,
    paddingVertical: 9,
    maxHeight: 6 * 22 + 18,
    minHeight: CIRCLE,
    textAlignVertical: 'center',
  },
  // 9 + 22 + 9 = CIRCLE: with explicit padding the multiline native field (UITextView / EditText)
  // lands the text and placeholder on the same centre line as the single-line web field.
  inputOneLine: {
    height: CIRCLE,
    paddingVertical: 9,
    lineHeight: 22,
    textAlignVertical: 'center',
    width: 0,
    flexBasis: 0,
  },
  inputStack: { paddingHorizontal: t.spacing.xs },
  skills: { paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.sm },
  skillsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skill: {
    paddingVertical: airy.stack,
    borderBottomWidth: t.metrics.hairlineWidth,
    borderBottomColor: t.colors.separator,
    gap: 2,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.surfaceRaised,
  },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
}));

export interface ComposerSkill {
  /** "/code-review". */
  name: string;
  description: string;
}

export interface ComposerCardProps {
  value: string;
  onChange: (text: string) => void;
  working?: boolean;
  onSend: () => void;
  onStop?: () => void;
  /** The agent mark circle (a ProgramMark in a 40pt circle; the caller picks the program). */
  leading?: ReactNode;
  /** Items of the + menu (Add File, Add Image). */
  addMenu?: readonly ActionMenuItem[];
  /** Items of the more menu (Paste, Snippets, Clear); shown in the expanded layout. */
  moreMenu?: readonly ActionMenuItem[];
  /** Slash skills: shown above the input while the draft starts with "/". */
  skills?: readonly ComposerSkill[];
  onSkill?: (name: string) => void;
  /** Forces the stacked layout; otherwise it grows once the draft has a line break or is long. */
  expanded?: boolean;
  /** The corner glyph on the agent circle: the surface the Agent is on (chat or keyboard). */
  surfaceIcon?: IconName;
  placeholder?: string;
  disabled?: boolean;
  labels?: AgentBarLabels;
  /** The key the "..." circle registers as a popover anchor. */
  moreAnchorKey?: string;
  /** A show/hide toggle for a bar above the composer (the terminal's key toolbar); omitted draws nothing. */
  barToggle?: { visible: boolean; onToggle: () => void; label: string };
  /** The input gained or lost focus: the composer is open (a surface above it may condense). */
  onFocusChange?: (focused: boolean) => void;
  testID?: string;
}

function Circle({
  icon,
  label,
  onPress,
  menu,
  anchorKey,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  menu?: readonly ActionMenuItem[];
  /** Registers the circle as a popover anchor (`confirm({ anchorKey })`). */
  anchorKey?: string;
  testID: string;
}) {
  const styles = useStyles();
  const anchor = useAnchor(anchorKey);
  if (isDeadMenuTrigger(menu, onPress)) return null;
  return (
    <View ref={anchor} style={styles.circle}>
      {menu ? (
        <ActionMenuButton
          items={menu}
          icon={icon}
          iconSize={18}
          accessibilityLabel={label}
          neutral
          testID={testID}
        />
      ) : (
        <Button
          kind="text"
          neutral
          icon={icon}
          iconSize={18}
          accessibilityLabel={label}
          onPress={() => onPress?.()}
          testID={testID}
        />
      )}
    </View>
  );
}

/**
 * The chat composer: a rounded glass card. One line (+, agent mark, input, send or stop) until
 * the draft grows, then the input stacks over a button row. A leading slash opens the skills panel.
 */
export function ComposerCard({
  value,
  onChange,
  working = false,
  onSend,
  onStop,
  leading,
  addMenu,
  moreMenu,
  moreAnchorKey,
  barToggle,
  onFocusChange,
  skills,
  onSkill,
  expanded,
  surfaceIcon = 'note',
  placeholder,
  disabled = false,
  labels = defaultAgentBarLabels,
  testID = 'composer-card',
}: ComposerCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [focused, setFocused] = useState(false);
  const action = composerAction(value, working, onStop !== undefined);
  const stacked = expanded ?? (value.includes('\n') || value.length > 36);
  const showSkills = Boolean(skills?.length) && value.startsWith('/') && !dismissed;
  const stopInk = theme.appearance === 'dark' ? 'textPrimary' : 'onAccent';
  const hint = placeholder ?? labels.messagePlaceholder;
  const input = (
    <ThemedTextInput
      value={value}
      onChangeText={(text) => {
        if (!text.startsWith('/')) setDismissed(false);
        onChange(text);
      }}
      placeholder={hint}
      editable={!disabled}
      onFocus={() => {
        setFocused(true);
        onFocusChange?.(true);
      }}
      onBlur={() => {
        setFocused(false);
        onFocusChange?.(false);
      }}
      multiline={stacked || Platform.OS !== 'web'}
      style={[styles.input, stacked ? styles.inputStack : styles.inputOneLine]}
      accessibilityLabel={hint}
      testID={`${testID}-input`}
    />
  );
  const trailing =
    action === 'stop' ? (
      <Pressable
        style={[styles.circle, { backgroundColor: theme.colors.danger }]}
        onPress={() => onStop?.()}
        accessibilityRole="button"
        accessibilityLabel={labels.stop}
        testID={`${testID}-stop`}
      >
        <Icon name="stop" size={20} color={stopInk} />
      </Pressable>
    ) : (
      <Pressable
        style={[styles.circle, { backgroundColor: theme.colors.textPrimary }]}
        onPress={onSend}
        disabled={disabled || action !== 'send'}
        accessibilityRole="button"
        accessibilityLabel={labels.send}
        accessibilityState={{ disabled: disabled || action !== 'send' }}
        testID={`${testID}-send`}
      >
        <Icon name="send" size={18} color="canvas" />
      </Pressable>
    );
  const leadingMark = leading ? (
    <View style={styles.circle}>
      {leading}
      <View style={styles.badge} testID={`${testID}-surface-badge`}>
        <Icon name={surfaceIcon} size={10} color="textPrimary" />
      </View>
    </View>
  ) : null;
  const plus = <Circle icon="add" label={labels.add} menu={addMenu} testID={`${testID}-add`} />;
  return (
    <View style={styles.card} testID={testID}>
      {showSkills ? (
        <View style={styles.skills} testID={`${testID}-skills`}>
          <View style={styles.skillsHead}>
            <Text variant="caption" tone="secondary" semibold>
              {labels.skills.toUpperCase()}
            </Text>
            <Pressable
              style={styles.close}
              onPress={() => setDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel={labels.closeSkills}
              testID={`${testID}-skills-close`}
            >
              <Icon name="close" size={16} />
            </Pressable>
          </View>
          {skills?.map((skill, index) => (
            <Pressable
              key={skill.name}
              onPress={() => onSkill?.(skill.name)}
              accessibilityRole="button"
              accessibilityLabel={`${skill.name}. ${skill.description}`}
              style={styles.skill}
              testID={`${testID}-skill-${skill.name}`}
            >
              <Text variant="body" monospaced>
                {skill.name}
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {skill.description}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {stacked || showSkills ? (
        <View style={styles.stack}>
          {input}
          <View style={styles.buttons}>
            {plus}
            {leadingMark}
            {barToggle ? (
              <Circle
                icon="toolbar"
                label={barToggle.label}
                onPress={barToggle.onToggle}
                testID={`${testID}-bar-toggle`}
              />
            ) : null}
            {moreMenu?.length ? (
              <Circle
                icon="more"
                label={labels.moreOptions}
                menu={moreMenu}
                anchorKey={moreAnchorKey}
                testID={`${testID}-more`}
              />
            ) : null}
            <View style={styles.spacer} />
            {focused ? <KeyboardDismissButton label={labels.dismissKeyboard} /> : null}
            {trailing}
          </View>
        </View>
      ) : (
        <View style={styles.oneLine}>
          {plus}
          {leadingMark}
          {input}
          {focused ? <KeyboardDismissButton label={labels.dismissKeyboard} /> : null}
          {trailing}
        </View>
      )}
    </View>
  );
}
