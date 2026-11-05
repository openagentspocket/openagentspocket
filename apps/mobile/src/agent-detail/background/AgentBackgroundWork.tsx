import { t } from '@openagentspocket/i18n';
import { BackgroundWorkList, BackgroundWorkStrip, makeStyles, Sheet } from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useBackgroundWork } from '@/conversations/useBackgroundWork';
import { detailItem, stripItem, summaryLine } from './workViewModel';

const useStyles = makeStyles((th) => ({
  strip: { paddingHorizontal: th.spacing.sm, paddingTop: th.spacing.xxs },
  body: { padding: th.spacing.md },
}));

interface Props {
  hostId: string;
  paneId: string;
  /** One line instead of the rows: a Blocked card stands in the Composer's place. */
  condensed?: boolean;
}

/**
 * The Background Work strip over the Composer and the sheet it opens (Swift ChatBackgroundWork*).
 * Empty with nothing to list, so its height drops to zero.
 */
export function AgentBackgroundWork({ hostId, paneId, condensed = false }: Props) {
  const styles = useStyles();
  const { presentation } = useBackgroundWork(hostId, paneId);
  /** undefined: closed. null: open at no row. A string: open with that Workflow expanded. */
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const empty = presentation.rows.length === 0;
  // A new message, or another conversation, leaves nothing to show.
  useEffect(() => {
    if (empty) setOpen(undefined);
  }, [empty]);
  const unfinished = useMemo(() => presentation.unfinished.map(detailItem), [presentation]);
  const finished = useMemo(() => presentation.finished.map(detailItem), [presentation]);
  if (empty) return null;
  const labels = {
    more: (count: number) => t('+%lld more', count),
    name: t('Background work'),
    hint: t('Shows all background work.'),
  };
  const show = (id: string | null) => {
    setExpanded(id === null ? new Set() : new Set([id]));
    setOpen(id);
  };
  return (
    <>
      <View style={styles.strip}>
        <BackgroundWorkStrip
          items={presentation.stripRows.map(stripItem)}
          overflow={presentation.overflow}
          summary={condensed ? summaryLine(presentation) : undefined}
          onOpen={show}
          labels={labels}
        />
      </View>
      <Sheet
        visible={open !== undefined}
        onClose={() => setOpen(undefined)}
        title={t('Background Work')}
        detent="large"
        testID="background-work-sheet"
      >
        <View style={styles.body}>
          <BackgroundWorkList
            unfinished={unfinished}
            finished={finished}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((current) => {
                const next = new Set(current);
                if (!next.delete(id)) next.add(id);
                return next;
              })
            }
            labels={{
              running: t('Running'),
              finished: t('Finished'),
              finishedFooter: t('Finished work leaves this list when you send your next message.'),
            }}
          />
        </View>
      </Sheet>
    </>
  );
}
