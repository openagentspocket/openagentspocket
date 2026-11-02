import { t } from '@openagentspocket/i18n';
import { Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { chatBodyPoints, chatFontFamily } from './chatText';
import type { SettingsContext } from './schema';

/** A line of Chat text in the chosen font and size. */
export function ChatSample({ ctx }: { ctx: SettingsContext }) {
  const { chatFont, chatTextOffset } = ctx.values;
  const size = chatBodyPoints(chatTextOffset);
  return (
    <View accessible accessibilityLabel={t('%lld points', size)} testID="settings.chat.textSample">
      <Text
        style={{ fontFamily: chatFontFamily(chatFont), fontSize: size, lineHeight: size * 1.3 }}
      >
        {t('Agents reply here as they would in Chat.')}
      </Text>
    </View>
  );
}
