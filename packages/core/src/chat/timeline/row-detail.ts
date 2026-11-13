import type { ChatDiffHunk, ChatToolActivity } from '../model/types';
import type { ChatRowContent } from './row';
import { toolLine } from './tool-line';

export interface ChatDiffLine {
  readonly kind: 'add' | 'del' | 'context';
  readonly oldNumber?: number;
  readonly newNumber?: number;
  readonly text: string;
}

export function diffHunkHeader(hunk: ChatDiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

/** A hunk's patch lines with each side's number. */
export function diffHunkLines(hunk: ChatDiffHunk): ChatDiffLine[] {
  let oldNumber = hunk.oldStart;
  let newNumber = hunk.newStart;
  const lines: ChatDiffLine[] = [];
  for (const line of hunk.lines) {
    const text = line.slice(1);
    if (line.startsWith('\\')) continue;
    if (line.startsWith('+')) lines.push({ kind: 'add', newNumber: newNumber++, text });
    else if (line.startsWith('-')) lines.push({ kind: 'del', oldNumber: oldNumber++, text });
    else lines.push({ kind: 'context', oldNumber: oldNumber++, newNumber: newNumber++, text });
  }
  return lines;
}

/** The output a tool row shows when open; held in memory only, so a cached call has none. */
export function toolDetailText(tool: ChatToolActivity): string | null {
  const { preview } = tool;
  if (!preview?.text) return null;
  return preview.isTruncated ? `${preview.text}\n…` : preview.text;
}

/** What Copy puts on the clipboard for a row, or null when the row has nothing to copy. */
export function rowCopyText(content: ChatRowContent): string | null {
  switch (content.type) {
    case 'user':
      return content.message.text;
    case 'pending':
      return content.echo.text;
    case 'assistant':
      return content.source;
    case 'plan':
      return content.plan.text;
    case 'reasoning':
      return content.reasoning.text;
    case 'tool': {
      const line = toolLine(content.tool);
      return [line.command ?? line.title, toolDetailText(content.tool)]
        .filter((part) => part !== null)
        .join('\n\n');
    }
    default:
      return null;
  }
}
