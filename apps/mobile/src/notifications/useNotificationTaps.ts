import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { redirectLink } from '@/links/nativeIntent';
import { notificationTapLink } from './notificationTapLink';

interface Response {
  readonly notification: {
    readonly request: {
      readonly content: { readonly data?: unknown };
      readonly trigger?: { readonly payload?: unknown } | null;
    };
  };
}

const linkOf = ({ notification: { request } }: Response) =>
  notificationTapLink({ data: request.content.data, payload: request.trigger?.payload });

/** A tapped push opens its Agent, also when it is what launched the app. */
export function useNotificationTaps(): void {
  const router = useRouter();
  useEffect(() => {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const open = (response: Response | null) => {
      const link = response && linkOf(response);
      if (link) router.navigate(redirectLink(link) as never);
    };
    open(Notifications.getLastNotificationResponse() as Response | null);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response as Response),
    );
    return () => subscription.remove();
  }, [router]);
}
