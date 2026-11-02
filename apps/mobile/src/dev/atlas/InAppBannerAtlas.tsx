import { NoticeBanner, ProgramMark, useInsets } from '@openagentspocket/ui';
import { StyleSheet, View } from 'react-native';
import Index from '@/app/index';

const noop = () => {};

/** The Home console with the in-app banner pinned over it: a blocked Agent with its question. */
export function InAppBannerAtlas() {
  const insets = useInsets();
  return (
    <>
      <Index />
      <View
        style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 4, alignItems: 'center' }]}
        pointerEvents="none"
      >
        <View style={{ width: '100%', paddingHorizontal: 16 }}>
          <NoticeBanner
            kind="inapp"
            animated={false}
            title="agentico · claude"
            message="Blocked"
            question="Do you want to make this edit to AgenticoAppModel.swift?"
            tone="warning"
            leading={<ProgramMark program="claude" size={28} />}
            onPress={noop}
            onDismiss={noop}
          />
        </View>
      </View>
    </>
  );
}
