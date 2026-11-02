import { type HostRouteDraft, parsePort, routeDraftUsesJumpHost } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Section, TextField } from '@openagentspocket/ui';
import { extra } from './extraText';

interface RouteFieldsProps {
  route: HostRouteDraft;
  onChange: (patch: Partial<Omit<HostRouteDraft, 'id'>>) => void;
  /** Prefix of the fields' testIDs. */
  testIDPrefix: string;
}

/**
 * The route page's Address and Jump Host sections (Swift `HostRouteFields`): the address and
 * port share one card, the Jump Host address sits in its own with its port and user below.
 */
export function RouteFields({ route, onChange, testIDPrefix }: RouteFieldsProps) {
  const portError =
    parsePort(route.port) === null ? extra('Enter a port from 1 to 65535.') : undefined;
  const jumps = routeDraftUsesJumpHost(route);
  const jumpPortError =
    jumps && parsePort(route.jumpPort) === null
      ? extra('Enter a port from 1 to 65535.')
      : undefined;
  return (
    <>
      <Section title={t('Address')} footer={portError}>
        <TextField
          inline
          label={t('Address')}
          value={route.address}
          onChangeText={(address) => onChange({ address })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          mono
          testID={`${testIDPrefix}-address`}
        />
        <TextField
          inline
          label={t('Port')}
          value={route.port}
          onChangeText={(port) => onChange({ port })}
          keyboardType="number-pad"
          mono
          testID={`${testIDPrefix}-port`}
        />
      </Section>
      <Section
        title={t('Jump Host')}
        footer={jumpPortError ?? t('Leave blank to connect to the Host directly.')}
      >
        <TextField
          inline
          label={t('Jump Host address (optional)')}
          value={route.jumpAddress}
          onChangeText={(jumpAddress) => onChange({ jumpAddress })}
          autoCapitalize="none"
          autoCorrect={false}
          mono
          testID={`${testIDPrefix}-jump-address`}
        />
        {jumps ? (
          <TextField
            inline
            label={t('Jump Host port')}
            value={route.jumpPort}
            onChangeText={(jumpPort) => onChange({ jumpPort })}
            keyboardType="number-pad"
            mono
            testID={`${testIDPrefix}-jump-port`}
          />
        ) : null}
        {jumps ? (
          <TextField
            inline
            label={t('Jump Host user (blank = same as Host)')}
            value={route.jumpUsername}
            onChangeText={(jumpUsername) => onChange({ jumpUsername })}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            testID={`${testIDPrefix}-jump-user`}
          />
        ) : null}
      </Section>
    </>
  );
}
