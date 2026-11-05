import { t } from '@openagentspocket/i18n';
import { ClaudeSubagentTranscript, makeStyles, Sheet } from '@openagentspocket/ui';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSubagentTranscript } from '@/conversations/useSubagentTranscript';

interface DetailUi {
  /** The composer has focus: surfaces over it condense (Swift: "while the Composer is open"). */
  composing: boolean;
  setComposing: (composing: boolean) => void;
  /** Opens a Subagent's own transcript, read-only, by the id its reporting call carried. */
  openSubagent: (agentId: string) => void;
}

const DetailUiContext = createContext<DetailUi>({
  composing: false,
  setComposing: () => undefined,
  openSubagent: () => undefined,
});

export const useDetailUi = () => useContext(DetailUiContext);

// The sheet pads its body; the transcript draws its own bar and runs edge to edge.
const useStyles = makeStyles((th) => ({ bleed: { marginHorizontal: -th.metrics.screenInset } }));

function SubagentSheet({
  hostId,
  paneId,
  agentId,
  onClose,
}: {
  hostId: string;
  paneId: string;
  agentId: string | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const transcript = useSubagentTranscript(hostId, paneId, agentId);
  return (
    <Sheet visible={agentId !== null} onClose={onClose} headerless detent="large">
      <View style={styles.bleed}>
        <ClaudeSubagentTranscript
          title={transcript.route?.title ?? t('Subagent')}
          kind={transcript.route?.subtitle ?? undefined}
          phase={transcript.phase}
          partial={transcript.partial}
          rows={transcript.rows}
          failureMessage={transcript.failure}
          onBack={onClose}
          onRetry={transcript.retry}
          labels={{
            back: t('Back'),
            readOnly: t('Read-only'),
            partial: t('Showing the latest part'),
            loading: t('Loading subagent transcript…'),
            emptyTitle: t('Nothing Recorded Yet'),
            emptyMessage: t("This subagent hasn't written anything yet."),
            missingTitle: t('Transcript Not Found'),
            missingMessage: t(
              'The Host has no transcript for this subagent. Claude Code may have cleaned it up.',
            ),
            failedTitle: t("Couldn't Load the Transcript"),
            retry: t('Try Again'),
          }}
        />
      </View>
    </Sheet>
  );
}

/** What the Agent detail's parts share: the composer's focus, and the Subagent transcript sheet. */
export function DetailUiProvider({
  hostId,
  paneId,
  children,
}: {
  hostId: string;
  paneId: string;
  children: ReactNode;
}) {
  const [composing, setComposing] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const value = useMemo(() => ({ composing, setComposing, openSubagent: setAgentId }), [composing]);
  return (
    <DetailUiContext.Provider value={value}>
      {children}
      <SubagentSheet
        hostId={hostId}
        paneId={paneId}
        agentId={agentId}
        onClose={() => setAgentId(null)}
      />
    </DetailUiContext.Provider>
  );
}
