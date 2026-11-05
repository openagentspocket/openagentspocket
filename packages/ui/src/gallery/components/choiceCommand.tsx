import { useState } from 'react';
import { View } from 'react-native';
import { ChoiceSheet } from '../../components/ChoiceSheet';
import { CommandBlock } from '../../components/CommandBlock';
import { Button } from '../../primitives/Button';
import type { CatalogEntry } from './types';

const noop = () => {};

function ChoiceSheetDemo({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View>
      <Button kind="secondary" title="Add Host" onPress={() => setOpen(true)} />
      {open ? (
        <ChoiceSheet
          visible
          title="Add Host"
          onClose={() => setOpen(false)}
          options={[
            {
              id: 'pair',
              icon: 'qr',
              eyebrow: 'Recommended',
              title: 'Easy Pair with QR',
              description:
                'Run one command on your Mac or Linux box and scan the QR. The app installs its key for you.',
              meta: '~2 min',
              highlighted: true,
              onPress: noop,
            },
            {
              id: 'manual',
              icon: 'terminal',
              title: 'Add Manually',
              description: 'For people who know SSH: host, user and key.',
              meta: 'Needs host + login',
              onPress: noop,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Demos of the generic ChoiceSheet and CommandBlock (first used by the Add Host flow). */
export const choiceCommandEntries: readonly CatalogEntry[] = [
  {
    name: 'ChoiceSheet',
    variants: [
      { id: 'default', render: () => <ChoiceSheetDemo /> },
      { id: 'open', render: () => <ChoiceSheetDemo startOpen /> },
    ],
  },
  {
    name: 'CommandBlock',
    variants: [
      {
        id: 'default',
        render: () => (
          <CommandBlock
            lines={[
              'herdr plugin install example/plugin',
              'herdr plugin action invoke example.pair',
            ]}
          />
        ),
      },
      {
        id: 'single',
        render: () => <CommandBlock lines={['herdr plugin action invoke example.pair']} />,
      },
    ],
  },
];
