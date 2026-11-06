import { type Message, message as m } from '../../errors/text';
import type { ChatSessionStoreProblem } from '../timeline/reasons';

/** What Chat says when Hermes Agent's store cannot answer. */
export function hermesStoreProblem(problem: ChatSessionStoreProblem): Message {
  switch (problem.kind) {
    case 'noStore':
      return m("Agentico couldn't find Hermes Agent's database at %@.", problem.path);
    case 'sessionMissing':
      return m(
        "No open Hermes Agent database has a conversation with this id. If this Hermes runs as another user or with another HERMES_HOME, Chat can't read it.",
      );
    case 'noReader':
      return m(
        "Reading Hermes Agent's conversations needs sqlite3 or python3 on the Host. Install one, then tap Check Again.",
      );
    case 'readerTooOld':
      return m(
        "The Host's SQLite %@ can't read Hermes Agent's database: Chat needs SQLite 3.25 or newer with JSON support, through sqlite3 or Python 3.6 or newer.",
        problem.version,
      );
    case 'storeClosed':
      return m(
        "Hermes Agent's database is closed, which usually means Hermes isn't running. Chat shows saved messages and checks again.",
      );
    default:
      return m(
        "Hermes Agent's database has a layout Chat doesn't read (%@). A newer Hermes may have changed it.",
        problem.kind === 'unsupportedLayout' ? problem.detail : problem.kind,
      );
  }
}
