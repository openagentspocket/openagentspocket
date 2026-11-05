import { t } from '@openagentspocket/i18n';
import { ChoiceSheet } from '@openagentspocket/ui';

interface AddHostSheetProps {
  onClose: () => void;
  onEasyPair: () => void;
  onAddManually: () => void;
}

/** hosts.add-choice: the two ways to add a Host, the QR one recommended. */
export function AddHostSheet({ onClose, onEasyPair, onAddManually }: AddHostSheetProps) {
  return (
    <ChoiceSheet
      visible
      title={t('Add Host')}
      onClose={onClose}
      testID="add-host-sheet"
      options={[
        {
          id: 'easy-pair',
          icon: 'qr',
          eyebrow: t('Recommended'),
          title: t('Easy Pair with QR'),
          description: t(
            'Run one command on your Mac or Linux box and scan the QR. The app installs its key for you.',
          ),
          meta: t('~2 min'),
          highlighted: true,
          onPress: onEasyPair,
        },
        {
          id: 'manual',
          icon: 'terminal',
          title: t('Add Manually'),
          description: t('For people who know SSH: host, user and key.'),
          meta: t('Needs host + login'),
          onPress: onAddManually,
        },
      ]}
    />
  );
}
