import { type HostRouteDraft, parsePort, routeDraftUsesJumpHost } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Card, Text, TextField } from '@openagentspocket/ui';
import { extra } from './extraText';

interface RouteFieldsProps {
  route: HostRouteDraft;
  index: number;
  /** A Host keeps at least one route, so the last one cannot be deleted. */
  canDelete: boolean;
  onChange: (patch: Partial<Omit<HostRouteDraft, 'id'>>) => void;
  onDelete: () => void;
}

/** One route of the Host form: the address, the port and an optional Jump Host. */
export function RouteFields({ route, index, canDelete, onChange, onDelete }: RouteFieldsProps) {
  const portError =
    parsePort(route.port) === null ? extra('Enter a port from 1 to 65535.') : undefined;
  const jumps = routeDraftUsesJumpHost(route);
  const jumpPortError =
    jumps && parsePort(route.jumpPort) === null
      ? extra('Enter a port from 1 to 65535.')
      : undefined;
  return (
    <Card padded testID={`route-${index}`}>
      <Text variant="headline">{t('Route %lld', index + 1)}</Text>
      <TextField
        label={t('Address')}
        value={route.address}
        onChangeText={(address) => onChange({ address })}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        mono
        testID={`route-${index}-address`}
      />
      <TextField
        label={t('Port')}
        value={route.port}
        onChangeText={(port) => onChange({ port })}
        keyboardType="number-pad"
        error={portError}
        mono
        testID={`route-${index}-port`}
      />
      <TextField
        label={t('Jump Host address (optional)')}
        value={route.jumpAddress}
        onChangeText={(jumpAddress) => onChange({ jumpAddress })}
        autoCapitalize="none"
        autoCorrect={false}
        hint={t('Leave blank to connect to the Host directly.')}
        mono
      />
      {jumps ? (
        <>
          <TextField
            label={t('Jump Host port')}
            value={route.jumpPort}
            onChangeText={(jumpPort) => onChange({ jumpPort })}
            keyboardType="number-pad"
            error={jumpPortError}
            mono
          />
          <TextField
            label={t('Jump Host user (blank = same as Host)')}
            value={route.jumpUsername}
            onChangeText={(jumpUsername) => onChange({ jumpUsername })}
            autoCapitalize="none"
            autoCorrect={false}
            mono
          />
        </>
      ) : null}
      {canDelete ? (
        <Button
          kind="text"
          title={t('Delete Route')}
          onPress={onDelete}
          testID={`route-${index}-delete`}
        />
      ) : null}
    </Card>
  );
}
