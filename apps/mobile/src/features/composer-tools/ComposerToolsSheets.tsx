import { t } from '@openagentspocket/i18n';
import { Sheet } from '@openagentspocket/ui';
import { SkillsPane } from './SkillsPane';
import { SnippetsManager } from './SnippetsManager';
import { SnippetsPane } from './SnippetsPane';
import { snippetStore } from './snippetStore';
import { useSkillsPaneStore } from './useAgentSkills';

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
  const close = () => onOpen(null);
  const insert = (text: string) => {
    onInsert(text);
    close();
  };
  return (
    <>
      <Sheet visible={open === 'skills'} onClose={close} title={t('Skills')} testID="skills-sheet">
        {open === 'skills' ? <SkillsPane store={skills} onInsert={insert} /> : null}
      </Sheet>
      <Sheet
        visible={open === 'snippets'}
        onClose={close}
        title={t('Snippets')}
        testID="snippets-sheet"
      >
        {open === 'snippets' ? (
          <SnippetsPane
            store={snippetStore()}
            onInsert={insert}
            onManage={() => onOpen('snippets-manager')}
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={open === 'snippets-manager'}
        onClose={() => onOpen('snippets')}
        title={t('Snippets')}
        testID="snippets-manager-sheet"
      >
        {open === 'snippets-manager' ? <SnippetsManager store={snippetStore()} /> : null}
      </Sheet>
    </>
  );
}
