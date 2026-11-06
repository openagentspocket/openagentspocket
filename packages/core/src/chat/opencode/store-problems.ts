import { type Message, message as m } from '../../errors/text';
import type { ChatSessionStoreProblem } from '../timeline/reasons';

/** What Chat says when OpenCode's store cannot answer (ADR 0025). */
export function openCodeStoreProblem(problem: ChatSessionStoreProblem): Message {
  switch (problem.kind) {
    case 'noStore':
      return m(
        "Agentico couldn't find OpenCode's database at %@. Chat reads OpenCode's default database.",
        problem.path,
      );
    case 'sessionMissing':
      return problem.otherStores.length === 0
        ? m(
            "OpenCode's database has no conversation with this id. If this OpenCode uses another database, such as one set with OPENCODE_DB, Chat can't read it.",
          )
        : m(
            "OpenCode's default database has no conversation with this id. This Host also has %@, which other OpenCode builds use; Chat reads only the default database.",
            problem.otherStores.join(', '),
          );
    case 'noReader':
      return m(
        "Reading OpenCode's conversations needs sqlite3 or python3 on the Host. Install one, then tap Check Again.",
      );
    case 'readerTooOld':
      return m(
        "The Host's SQLite %@ can't read OpenCode's database: Chat needs SQLite 3.25 or newer with JSON support, through sqlite3 or Python 3.6 or newer.",
        problem.version,
      );
    case 'storeClosed':
      return m(
        "OpenCode's database is closed, which usually means OpenCode isn't running. Chat shows saved messages and checks again.",
      );
    case 'olderOpenCode':
      return m(
        "This OpenCode keeps conversations in its 1.x format, which Chat doesn't read. Chat reads OpenCode 2.x.",
      );
    case 'unsupportedLayout':
      return m(
        "OpenCode's database has a layout Chat doesn't read (%@). A newer OpenCode may have changed it.",
        problem.detail,
      );
    case 'subagentSession':
      return m(
        "herdr reports a subagent's session, which Chat doesn't show. Open the main conversation in the terminal.",
      );
  }
}
