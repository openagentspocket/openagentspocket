import type { ClaudeOptionBlock } from './claude-models';
import { ClaudeOptionReader } from './claude-options';
import { ClaudeRegions } from './claude-regions';
import { ClaudeResults } from './claude-results';
import { ClaudeRows } from './claude-rows';
import type { AnsiScreen } from './screen';

/** Everything the Claude readers share for one screen. */
export class ClaudeContext {
  readonly tools: ClaudeRows;
  readonly options: ClaudeOptionReader;
  readonly regions: ClaudeRegions;
  readonly results: ClaudeResults;

  constructor(screen: AnsiScreen, block: ClaudeOptionBlock) {
    this.tools = new ClaudeRows(screen, block);
    this.options = new ClaudeOptionReader(this.tools);
    this.regions = new ClaudeRegions(this.tools);
    this.results = new ClaudeResults(this.tools, this.options);
  }
}
