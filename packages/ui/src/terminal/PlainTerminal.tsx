import { fromBase64 } from 'agentico-ssh';
import { useImperativeHandle, useRef, useState } from 'react';
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
import type { TerminalHandle, TerminalViewProps } from './terminalTypes';
import { decodeUtf8Stream } from './utf8';

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.terminalBackground },
  content: { padding: t.spacing.xs },
  text: { color: t.colors.terminalForeground, fontFamily: monoFamily },
  input: { position: 'absolute', width: 1, height: 1, opacity: 0 },
}));

/**
 * The plain-text terminal: escapes stripped, no cursor addressing. The fallback of
 * `TerminalView` when the native renderer is absent (tests, gallery, demo mode).
 */
export function PlainTerminal({
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
  const decoder = useRef(decodeUtf8Stream());

  useImperativeHandle(
    ref,
    (): TerminalHandle => ({
      write: (data) => setScreen((current) => appendOutput(current, data)),
      writeBytes: (bytes) => {
        const text = decoder.current(bytes);
        setScreen((current) => appendOutput(current, text));
      },
      writeEncoded: (base64) => {
        const text = decoder.current(fromBase64(base64));
        setScreen((current) => appendOutput(current, text));
      },
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
