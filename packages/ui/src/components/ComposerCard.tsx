import { type ReactNode, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { composerAction } from '../composer/Composer';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';
import { type AgentBarLabels, defaultAgentBarLabels } from './agentBarLabels';

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
    color: t.colors.textPrimary,
    fontSize: 17,
    paddingVertical: t.spacing.xxs,
    maxHeight: 6 * 22 + 10,
    minHeight: 30,
    textAlignVertical: 'center',
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
  skillLast: { borderBottomWidth: 0 },
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
  placeholder?: string;
  disabled?: boolean;
  labels?: AgentBarLabels;
  testID?: string;
}

function Circle({
  icon,
  label,
  onPress,
  menu,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  menu?: readonly ActionMenuItem[];
  testID: string;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={styles.circle}
        onPress={menu ? () => setOpen(true) : onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        <Icon name={icon} size={18} color="textPrimary" />
      </Pressable>
      {menu ? <ActionMenu items={menu} visible={open} onClose={() => setOpen(false)} /> : null}
    </>
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
  skills,
  onSkill,
  expanded,
  placeholder,
  disabled = false,
  labels = defaultAgentBarLabels,
  testID = 'composer-card',
}: ComposerCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const action = composerAction(value, working, onStop !== undefined);
  const stacked = expanded ?? (value.includes('\n') || value.length > 36);
  const showSkills = Boolean(skills?.length) && value.startsWith('/') && !dismissed;
  const stopInk = theme.appearance === 'dark' ? 'textPrimary' : 'onAccent';
  const hint = placeholder ?? labels.messagePlaceholder;
  const input = (
    <TextInput
      value={value}
      onChangeText={(text) => {
        if (!text.startsWith('/')) setDismissed(false);
        onChange(text);
      }}
      placeholder={hint}
      placeholderTextColor={theme.colors.textTertiary}
      selectionColor={theme.colors.accent}
      keyboardAppearance={theme.appearance}
      editable={!disabled}
      multiline
      style={[styles.input, stacked && styles.inputStack]}
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
  const plus = (
    <Circle
      icon="add"
      label={labels.add}
      menu={addMenu}
      onPress={() => {}}
      testID={`${testID}-add`}
    />
  );
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
              style={[styles.skill, index === skills.length - 1 && styles.skillLast]}
              testID={`${testID}-skill-${skill.name}`}
            >
              <Text variant="body" monospaced>
                {skill.name}
              </Text>
              <Text variant="footnote" tone="secondary">
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
            {leading ? <View style={styles.circle}>{leading}</View> : null}
            {moreMenu?.length ? (
              <Circle
                icon="more"
                label={labels.moreOptions}
                menu={moreMenu}
                testID={`${testID}-more`}
              />
            ) : null}
            <View style={styles.spacer} />
            {trailing}
          </View>
        </View>
      ) : (
        <View style={styles.oneLine}>
          {plus}
          {leading ? <View style={styles.circle}>{leading}</View> : null}
          {input}
          {trailing}
        </View>
      )}
    </View>
  );
}
