import { marked, type Token, type Tokens } from 'marked';
import { Fragment, memo, type ReactNode, useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { Card } from '../primitives/Card';
import { Text, type TextVariant } from '../primitives/Text';
import { useFontScale } from '../theme/accessibility';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import { typography } from '../theme/typography';
import { CodeBlock } from './CodeBlock';
import { tableColumnWidths } from './tableColumns';

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.sm },
  listItem: { flexDirection: 'row', gap: t.spacing.xs },
  bullet: { minWidth: 18, textAlign: 'right' },
  itemBody: { flex: 1, gap: t.spacing.xxs },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: t.colors.accent,
    paddingLeft: t.spacing.sm,
    gap: t.spacing.xs,
  },
  rule: { height: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  tableRow: { flexDirection: 'row' },
  tableHead: { backgroundColor: t.colors.surfaceRaised },
  cell: {
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    borderRightWidth: t.metrics.hairlineWidth,
    borderRightColor: t.hairline,
  },
}));

type Styles = ReturnType<typeof useStyles>;

interface Context {
  styles: Styles;
  theme: Theme;
  onLinkPress: (href: string) => void;
  onLongPress?: () => void;
}

const HEADING: Record<number, TextVariant> = { 1: 'title2', 2: 'headline', 3: 'headline' };

/** Inline tokens (bold, italics, code, links) as nested Text. */
function inline(tokens: readonly Token[] | undefined, ctx: Context): ReactNode {
  return tokens?.map((token, index) => {
    const key = `${index}`;
    switch (token.type) {
      case 'strong':
        return (
          <Text key={key} style={{ fontWeight: '700' }}>
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'em':
        return (
          <Text key={key} style={{ fontStyle: 'italic' }}>
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'del':
        return (
          <Text key={key} style={{ textDecorationLine: 'line-through' }}>
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'codespan':
        return (
          <Text
            key={key}
            variant="mono"
            style={{
              backgroundColor: ctx.theme.colors.control,
              color: ctx.theme.colors.textPrimary,
            }}
          >
            {token.text}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={key}
            tone="accent"
            accessibilityRole="link"
            onPress={() => ctx.onLinkPress(token.href)}
            style={{ textDecorationLine: 'underline' }}
          >
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'br':
        return '\n';
      case 'text':
        return 'tokens' in token && token.tokens ? (
          <Fragment key={key}>{inline(token.tokens, ctx)}</Fragment>
        ) : (
          token.text
        );
      default:
        return 'text' in token ? (token as { text: string }).text : null;
    }
  });
}

/** Block tokens (paragraphs, headings, lists, code, quotes, tables) as Views. */
function blocks(tokens: readonly Token[] | undefined, ctx: Context): ReactNode {
  return tokens?.map((token, index) => {
    const key = `${index}`;
    switch (token.type) {
      case 'space':
        return null;
      case 'heading':
        return (
          <Text
            key={key}
            variant={HEADING[token.depth] ?? 'body'}
            accessibilityRole="header"
            onLongPress={ctx.onLongPress}
          >
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'paragraph':
        return (
          <Text key={key} onLongPress={ctx.onLongPress}>
            {inline(token.tokens, ctx)}
          </Text>
        );
      case 'text':
        return (
          <Text key={key} onLongPress={ctx.onLongPress}>
            {inline(token.tokens ?? [token], ctx)}
          </Text>
        );
      case 'code':
        return <CodeBlock key={key} code={token.text} language={token.lang || undefined} />;
      case 'blockquote':
        return (
          <View key={key} style={ctx.styles.quote}>
            {blocks(token.tokens, ctx)}
          </View>
        );
      case 'list':
        return <List key={key} token={token as Tokens.List} ctx={ctx} />;
      case 'hr':
        return <View key={key} style={ctx.styles.rule} />;
      case 'table':
        return <Table key={key} token={token as Tokens.Table} ctx={ctx} />;
      default:
        return 'text' in token ? <Text key={key}>{(token as { text: string }).text}</Text> : null;
    }
  });
}

function List({ token, ctx }: { token: Tokens.List; ctx: Context }) {
  const start = typeof token.start === 'number' ? token.start : 1;
  return (
    <View>
      {token.items.map((item, index) => {
        const marker = item.task
          ? item.checked
            ? '☑'
            : '☐'
          : token.ordered
            ? `${start + index}.`
            : '•';
        const body = item.tokens.filter((child) => child.type !== 'checkbox');
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity beyond order.
          <View key={index} style={ctx.styles.listItem}>
            <Text tone="secondary" style={ctx.styles.bullet}>
              {marker}
            </Text>
            <View style={ctx.styles.itemBody}>{blocks(body, ctx)}</View>
          </View>
        );
      })}
    </View>
  );
}

function Table({ token, ctx }: { token: Tokens.Table; ctx: Context }) {
  const [frame, setFrame] = useState<number | undefined>(undefined);
  const { scale } = useFontScale();
  const hairline = ctx.theme.metrics.hairlineWidth;
  const widths = tableColumnWidths([token.header, ...token.rows], {
    // Cells are `callout`, scaled with the text size.
    fontSize: typography.callout.fontSize * scale,
    cellInset: 2 * ctx.theme.spacing.xs + hairline,
    // The card's border on both sides.
    available: frame === undefined ? undefined : frame - 2 * hairline,
  });
  const row = (cells: Tokens.TableCell[], head: boolean, key: string) => (
    <View key={key} style={[ctx.styles.tableRow, head && ctx.styles.tableHead]}>
      {cells.map((cell, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
        <View key={index} style={[ctx.styles.cell, { width: widths[index] }]}>
          <Text
            variant="callout"
            style={[head && { fontWeight: '600' }, { textAlign: cell.align ?? 'left' }]}
          >
            {inline(cell.tokens, ctx)}
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      onLayout={(event) => setFrame(event.nativeEvent.layout.width)}
      testID="markdown-table"
    >
      <Card padded={false}>
        {row(token.header, true, 'head')}
        {token.rows.map((cells, index) => row(cells, false, `${index}`))}
      </Card>
    </ScrollView>
  );
}

interface MarkdownProps {
  /** GitHub-flavored Markdown, as an Agent writes it. */
  text: string;
  /** Opens a link; defaults to the system browser. */
  onLinkPress?: (href: string) => void;
  /** Long press on the text. A wrapper would take the drag from tables and code blocks. */
  onLongPress?: () => void;
  testID?: string;
}

/** Renders Markdown with the theme's text styles; parsed once per text (marked's lexer). */
export const Markdown = memo(function Markdown({
  text,
  onLinkPress,
  onLongPress,
  testID,
}: MarkdownProps) {
  const styles = useStyles();
  const theme = useTheme();
  const tokens = useMemo(() => marked.lexer(text), [text]);
  const ctx: Context = {
    styles,
    theme,
    onLinkPress: onLinkPress ?? ((href) => void Linking.openURL(href).catch(() => {})),
    onLongPress,
  };
  return (
    <View style={styles.root} testID={testID ?? 'markdown'}>
      {blocks(tokens, ctx)}
    </View>
  );
});
