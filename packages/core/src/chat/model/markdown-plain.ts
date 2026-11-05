// Markdown as plain lines, for a row that previews it without drawing it (Pi's compaction and
// branch summaries; Swift ChatMarkdown.plainText): one line per block, headings without their `#`,
// list items with their marker (`•`, `◦`, `▪` by depth; `N.` for an ordered list) and without a
// task checkbox, inline markup reduced to its text. HTML blocks, such as Pi's `<read-files>` list,
// and thematic breaks leave nothing. Pi's summaries use headings, lists and paragraphs; this reads
// those, not every CommonMark corner.

const BULLETS = ['•', '◦', '▪'];
const LIST_ITEM = /^( *)([-*+]|[0-9]{1,9}[.)])(?:[ \t]+(.*))?$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const THEMATIC = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HTML_BLOCK = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s/>]|$)|^ {0,3}<!--/;

/** The text of inline Markdown: emphasis, code, links and images keep only their words. */
function inline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, '$1');
}

export function markdownPlainText(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  /** Per list depth (indent / 2 + 1): the next ordinal of an ordered list, when it is one. */
  const ordinals = new Map<number, number>();
  const flush = () => {
    if (paragraph.length > 0) blocks.push(paragraph.map(inline).join('\n'));
    paragraph = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] as string;
    index += 1;
    if (line.trim() === '') {
      flush();
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const marker = (fence[1] as string)[0] as string;
      const code: string[] = [];
      while (
        index < lines.length &&
        !(lines[index] as string).trim().startsWith(marker.repeat(3))
      ) {
        code.push(lines[index] as string);
        index += 1;
      }
      index += 1;
      blocks.push(code.join('\n'));
      continue;
    }
    if (HTML_BLOCK.test(line) && paragraph.length === 0) {
      // An HTML block runs to the next blank line and shows nothing.
      while (index < lines.length && (lines[index] as string).trim() !== '') index += 1;
      continue;
    }
    if (THEMATIC.test(line) && paragraph.length === 0) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push(inline(heading[2] ?? ''));
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const depth = Math.floor((item[1] as string).length / 2) + 1;
      const marker = item[2] as string;
      const ordered = /^[0-9]/.test(marker);
      let label: string;
      if (ordered) {
        const start = Number.parseInt(marker, 10);
        const next = ordinals.get(depth) ?? start;
        label = `${next}.`;
        ordinals.set(depth, next + 1);
      } else {
        label = BULLETS[Math.min(depth, 3) - 1] as string;
        ordinals.delete(depth);
      }
      for (const deeper of [...ordinals.keys()]) if (deeper > depth) ordinals.delete(deeper);
      const text = (item[3] ?? '').replace(/^\[[ xX]\][ \t]+/, '');
      blocks.push(`${label} ${inline(text)}`);
      continue;
    }
    ordinals.clear();
    paragraph.push(line.replace(/^ {0,3}(?:> ?)*/, '').trimEnd());
  }
  flush();
  return blocks.filter((block) => block !== '').join('\n');
}
