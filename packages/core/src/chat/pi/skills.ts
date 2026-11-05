// How Pi and Oh My Pi record a skill invocation (Swift PiTranscriptReducer.skillCommand and
// piSkill): Oh My Pi as a `skill-prompt` custom message with the prompt as submitted in its
// details, Pi as the expanded skill block followed by the arguments.

import type { ChatCommandInvocation } from '../model/types';

const SKILL_COMMAND_PREFIX = '/skill:';

/**
 * Oh My Pi's `skill-prompt` as `/name arguments` when the prompt starts with its `/skill:` token;
 * it may also sit mid-sentence.
 */
export function skillCommand(prompt: string): ChatCommandInvocation | null {
  if (!prompt.startsWith(SKILL_COMMAND_PREFIX)) return null;
  const rest = prompt.slice(SKILL_COMMAND_PREFIX.length);
  const name = /^\S*/.exec(rest)?.[0] ?? '';
  if (name === '') return null;
  return { name, arguments: rest.slice(name.length).trim() };
}

const SKILL_HEADER = /^<skill name="([^"]+)" location="[^"]+">\n/;
const CLOSING = '\n</skill>';

/**
 * Pi's expanded `/skill:name args`, matched as Pi parses it back:
 * `^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n</skill>(?:\n\n([\s\S]+))?$`.
 */
export function piSkill(text: string): { name: string; arguments: string } | null {
  const header = SKILL_HEADER.exec(text);
  if (!header) return null;
  const name = header[1] as string;
  const rest = text.slice(header[0].length);
  // The body is the shortest one after which only the arguments follow.
  let from = 0;
  for (;;) {
    const at = rest.indexOf(CLOSING, from);
    if (at < 0) return null;
    const after = rest.slice(at + CLOSING.length);
    if (after === '') return { name, arguments: '' };
    if (after.startsWith('\n\n') && after.length > 2) return { name, arguments: after.slice(2) };
    from = at + 1;
  }
}
