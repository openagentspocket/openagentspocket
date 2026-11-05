import { RefreshControl, type RefreshControlProps } from 'react-native';
import { useTheme } from '../theme/theme';

type ThemedRefreshControlProps = Omit<
  RefreshControlProps,
  'tintColor' | 'colors' | 'progressBackgroundColor'
>;

/**
 * The one pull-to-refresh control: accent spinner, raised background on Android. The remaining
 * props pass through because a ScrollView clones its control with a style and, on some hosts,
 * its content as children.
 */
export function ThemedRefreshControl(props: ThemedRefreshControlProps) {
  const theme = useTheme();
  return (
    <RefreshControl
      {...props}
      tintColor={theme.colors.accent}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surfaceRaised}
    />
  );
}
