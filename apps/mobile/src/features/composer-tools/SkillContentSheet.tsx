import { type AgentSkill, skillCommand, userFacingDescription } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { CodeBlock, ErrorState, Sheet, SkeletonRows } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';

interface SkillContentSheetProps {
  /** The skill to show; the sheet is closed while absent. */
  skill: AgentSkill | undefined;
  /** Reads the document in full (`readSkillFile` on the Agent's Host). */
  readFile: (path: string) => Promise<string>;
  onClose: () => void;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'loaded'; content: string }
  | { kind: 'failed'; error: string };

/** skill-content: the skill's document, fetched on demand and read-only. */
export function SkillContentSheet({ skill, readFile, onClose }: SkillContentSheetProps) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const path = skill?.path;

  useEffect(() => {
    if (path === undefined) return;
    let current = true;
    setLoad({ kind: 'loading' });
    readFile(path).then(
      (content) => current && setLoad({ kind: 'loaded', content }),
      (thrown: unknown) =>
        current && setLoad({ kind: 'failed', error: userFacingDescription(thrown) }),
    );
    return () => {
      current = false;
    };
  }, [path, readFile]);

  return (
    <Sheet
      visible={skill !== undefined}
      onClose={onClose}
      title={skill ? t('Skill %@', skillCommand(skill)) : undefined}
      closeLabel={t('Close')}
      detent="large"
      testID="skill-content"
    >
      {load.kind === 'loading' ? <SkeletonRows accessibilityLabel={t('Loading…')} /> : null}
      {load.kind === 'loaded' ? <CodeBlock code={load.content} /> : null}
      {load.kind === 'failed' ? (
        <ErrorState
          layout="compact"
          summary={t('Loading the skill failed: %@', load.error)}
          testID="skill-content-failed"
        />
      ) : null}
    </Sheet>
  );
}
