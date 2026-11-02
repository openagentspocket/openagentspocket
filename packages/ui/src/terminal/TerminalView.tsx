import { type Ref, useImperativeHandle, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  TextInput,
  type TextInputInstance,
} from 'react-native';
import { monoFamily, Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';
import { appendOutput, gridSize } from './terminalText';

/** What a screen drives a terminal with; the native or WebView renderer keeps the same handle. */
export interface TerminalHandle {
  write(data: string): void;
  clear(): void;
  focus(): void;
}

export interface TerminalViewProps {
  /** Keystrokes typed into the terminal, as bytes to send to the PTY (Return is "\r", Delete "\x7f"). */
  onInput?: (data: string) => void;
  /** The grid that fits the view, sent to the PTY on layout. */
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
  /** Screen-reader label ("Terminal, Agent 3"). */
  accessibilityLabel?: string;
  testID?: string;
  ref?: Ref<TerminalHandle>;
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.terminalBackground },
  content: { padding: t.spacing.xs },
  text: { color: t.colors.terminalForeground, fontFamily: monoFamily },
  input: { position: 'absolute', width: 1, height: 1, opacity: 0 },
}));

/**
 * The one terminal surface for Agent attach and shells. This is the plain-text
 * fallback (escapes stripped, no cursor addressing) used by demo mode, tests and
 * the gallery; the renderer chosen by the terminal spike (libghostty or xterm.js)
 * replaces the body behind the same props and handle.
 */
export function TerminalView({
  onInput,
  onResize,
  fontSize = 13,
  accessibilityLabel = 'Terminal',
  testID = 'terminal',
  ref,
}: TerminalViewProps) {
  const styles = useStyles();
  const [screen, setScreen] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);
  const input = useRef<TextInputInstance>(null);

  useImperativeHandle(
    ref,
    () => ({
      write: (data) => setScreen((current) => appendOutput(current, data)),
      clear: () => setScreen(''),
      focus: () => input.current?.focus(),
    }),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const { cols, rows } = gridSize(width, height, fontSize);
    onResize?.(cols, rows);
  };

  return (
    <Pressable
      style={styles.root}
      onPress={() => input.current?.focus()}
      onLayout={onLayout}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        <Text
          selectable
          style={[styles.text, { fontSize, lineHeight: Math.round(fontSize * 1.25) }]}
          testID={`${testID}-screen`}
        >
          {screen}
        </Text>
      </ScrollView>
      <TextInput
        ref={input}
        style={styles.input}
        value=""
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        submitBehavior="submit"
        onChangeText={(text) => text && onInput?.(text)}
        onSubmitEditing={() => onInput?.('\r')}
        onKeyPress={(event) => event.nativeEvent.key === 'Backspace' && onInput?.('\x7f')}
        accessibilityLabel={accessibilityLabel}
        testID={`${testID}-input`}
      />
    </Pressable>
  );
}
