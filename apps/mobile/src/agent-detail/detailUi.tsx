import { t } from '@openagentspocket/i18n';
import { ClaudeSubagentTranscript, makeStyles, Sheet } from '@openagentspocket/ui';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { View } from 'react-native';
import { useSubagentTranscript } from '@/conversations/useSubagentTranscript';

/** One node a surface hands the dock (the terminal's key toolbar), drawn between the status line and the composer. */
class DockSlot {
  node: ReactNode = null;
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly get = () => this.node;
  set(node: ReactNode): void {
    if (node === this.node) return;
    this.node = node;
    for (const listener of [...this.listeners]) listener();
  }
}

interface DetailUi {
  slot: DockSlot;
  /** The composer has focus: surfaces over it condense (Swift: "while the Composer is open"). */
  composing: boolean;
  setComposing: (composing: boolean) => void;
  /** Opens a Subagent's own transcript, read-only, by the id its reporting call carried. */
  openSubagent: (agentId: string) => void;
}

const DetailUiContext = createContext<DetailUi>({
  slot: new DockSlot(),
  composing: false,
  setComposing: () => undefined,
  openSubagent: () => undefined,
});

export const useDetailUi = () => useContext(DetailUiContext);

/**
 * Hands the dock a node to draw over the composer while the caller is mounted. The slot notifies
 * only the dock's own subscriber, so the caller re-rendering does not loop.
 */
export function useDockSlot(node: ReactNode): void {
  const { slot } = useDetailUi();
  useEffect(() => {
    slot.set(node);
  });
  useEffect(() => () => slot.set(null), [slot]);
}

/** Where the dock draws what `useDockSlot` was handed. */
export function DockSlotView(): ReactNode {
  const { slot } = useDetailUi();
  return useSyncExternalStore(slot.subscribe, slot.get, slot.get);
}

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
  const slot = useRef(new DockSlot()).current;
  const value = useMemo(
    () => ({ slot, composing, setComposing, openSubagent: setAgentId }),
    [slot, composing],
  );
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
