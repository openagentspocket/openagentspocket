import { type AuthMethod, type HostDraft, isValidHerdrSessionName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { PickerRow, Section, Text, TextField } from '@openagentspocket/ui';
import { DeviceKeyLine } from './DeviceKeyLine';
import { extra } from './extraText';

interface AuthFieldsProps {
  draft: HostDraft;
  /** Whether the Host being edited already keeps a password. */
  keepsPassword: boolean;
  onChange: (patch: Partial<HostDraft>) => void;
}

/** RSA keys are deferred in the port, so only the Device Key and a password are offered. */
const METHODS = ['deviceKey', 'password'] as const satisfies readonly AuthMethod[];

function methodTitle(method: (typeof METHODS)[number]): string {
  return method === 'deviceKey' ? t('Device Key') : t('Password');
}

/** The Authentication and herdr Session sections of the Host form. */
export function AuthFields({ draft, keepsPassword, onChange }: AuthFieldsProps) {
  const session = draft.sessionName.trim();
  const sessionError =
    session !== '' && !isValidHerdrSessionName(session)
      ? extra('Use letters, digits, dots, dashes and underscores (up to 64).')
      : undefined;
  const method = draft.authMethod === 'password' ? 'password' : 'deviceKey';
  return (
    <>
      <Section
        title={t('Authentication')}
        footer={
          method === 'deviceKey'
            ? t(
                'Add this line to ~/.ssh/authorized_keys on the Host. The private key never leaves this device.',
              )
            : keepsPassword
              ? extra('Leave blank to keep the saved password.')
              : undefined
        }
      >
        <PickerRow
          title={t('Method')}
          value={method}
          options={METHODS.map((value) => ({ value, label: methodTitle(value) }))}
          onChange={(authMethod) => onChange({ authMethod })}
          testID="host-auth-method"
        />
        {method === 'deviceKey' ? <DeviceKeyLine /> : null}
        {method === 'password' ? (
          <TextField
            inline
            label={t('Password')}
            value={draft.password}
            onChangeText={(password) => onChange({ password })}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="host-password"
          />
        ) : null}
      </Section>
      {draft.herdrEndpoint ? (
        <Section
          grouped={false}
          title={t('herdr Endpoint')}
          footer={t("Set by this Host's Pairing Code.")}
        >
          <Text variant="mono">{`${t('Socket')}: ${draft.herdrEndpoint.socketPath}`}</Text>
          <Text variant="mono">{`${t('Launcher')}: ${draft.herdrEndpoint.executablePath}`}</Text>
        </Section>
      ) : (
        <Section
          title={t('herdr Session')}
          footer={sessionError ?? t('Leave blank for the default herdr session.')}
        >
          <TextField
            inline
            label={t('herdr Session')}
            placeholder={t('Session name')}
            value={draft.sessionName}
            onChangeText={(sessionName) => onChange({ sessionName })}
            autoCapitalize="none"
            autoCorrect={false}
            error={sessionError}
            testID="host-session"
          />
        </Section>
      )}
    </>
  );
}
