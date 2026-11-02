import { describe, expect, it } from 'vitest';
import { parseClaudeDialog } from './claude-parser';
import { parseCodexDialog } from './codex-parser';
import { screenFixtures } from './golden-fixtures.testkit';
import { parseImage, screenImage } from './golden-image.testkit';

describe.each(['claude', 'codex'] as const)('%s screen goldens', (program) => {
  const fixtures = screenFixtures(program);

  it('has the captured screens', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (_name, fixture) => {
      it('decodes to the Swift screen', () => {
        expect(screenImage(fixture.screen)).toEqual(fixture.decoded);
      });
    },
  );
});

const parsers = { claude: parseClaudeDialog, codex: parseCodexDialog };

describe.each(['claude', 'codex'] as const)(
  '%s dialog parser against the Swift goldens',
  (program) => {
    describe.each(screenFixtures(program).map((fixture) => [fixture.name, fixture] as const))(
      '%s',
      (_name, fixture) => {
        it('parses to the same DialogParseResult', () => {
          expect(parseImage(parsers[program](fixture.screen))).toEqual(fixture.golden.parse);
        });
      },
    );
  },
);
