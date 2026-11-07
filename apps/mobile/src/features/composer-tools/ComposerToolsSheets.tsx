import type { AgentSkill } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Sheet, useSheetHandover } from '@openagentspocket/ui';
import { useState } from 'react';
import { SkillContentSheet } from './SkillContentSheet';
import { SkillsPane } from './SkillsPane';
import { SnippetsManager } from './SnippetsManager';
import { SnippetsPane } from './SnippetsPane';
import { snippetStore } from './snippetStore';
import { useSkillReader, useSkillsPaneStore } from './useAgentSkills';

/** The tool sheets a composer's "..." menu opens (Swift Skills and Snippets from the Keys tabs). */
export type ToolsSheet = 'skills' | 'snippets' | 'snippets-manager';

interface Props {
  open: ToolsSheet | null;
  onOpen: (sheet: ToolsSheet | null) => void;
  hostId: string;
  /** The canonical Agent kind the Host's skill sources are looked up by. */
  program: string;
  projectRoot?: string;
  /** Types into the draft or terminal; never submits (ADR 0009). */
  onInsert: (text: string) => void;
}

/**
 * Skills, Snippets and the Snippets manager as sheets over any composer surface. Inserting closes
 * the sheet; the text only reaches the draft, sending stays the user's Enter.
 */
export function ComposerToolsSheets({
  open,
  onOpen,
  hostId,
  program,
  projectRoot,
  onInsert,
}: Props) {
  const skills = useSkillsPaneStore({ hostId, program, projectRoot });
  const readSkill = useSkillReader(hostId);
  const [shownSkill, setShownSkill] = useState<AgentSkill>();
  const handover = useSheetHandover();
  const close = () => onOpen(null);
  // One sheet leads to another: the next opens once this one has left.
  const move = (next: ToolsSheet) => {
    handover.after(() => onOpen(next));
    close();
  };
  const viewContent = (skill: AgentSkill) => {
    handover.after(() => setShownSkill(skill));
    close();
  };
  const insert = (text: string) => {
    onInsert(text);
    close();
  };
  return (
    <>
      <Sheet
        visible={open === 'skills'}
        onClose={close}
        onDismissed={handover.onDismissed}
        title={t('Skills')}
        testID="skills-sheet"
      >
        {open === 'skills' ? (
          <SkillsPane store={skills} onInsert={insert} onViewContent={viewContent} />
        ) : null}
      </Sheet>
      <SkillContentSheet
        skill={shownSkill}
        readFile={readSkill}
        onClose={() => setShownSkill(undefined)}
      />
      <Sheet
        visible={open === 'snippets'}
        onClose={close}
        onDismissed={handover.onDismissed}
        title={t('Snippets')}
        testID="snippets-sheet"
      >
        {open === 'snippets' ? (
          <SnippetsPane
            store={snippetStore()}
            onInsert={insert}
            onManage={() => move('snippets-manager')}
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={open === 'snippets-manager'}
        onClose={() => move('snippets')}
        onDismissed={handover.onDismissed}
        title={t('Snippets')}
        testID="snippets-manager-sheet"
      >
        {open === 'snippets-manager' ? <SnippetsManager store={snippetStore()} /> : null}
      </Sheet>
    </>
  );
}
