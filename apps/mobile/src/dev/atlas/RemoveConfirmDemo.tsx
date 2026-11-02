import { useEffect, useRef } from 'react';
import HostsRoute from '@/app/hosts';
import { removeHostWithConfirmation } from '@/features/hosts/removeHost';
import { useHosts } from '@/features/hosts/useHosts';

/** The Hosts list with the Remove Host alert open for its last Host (hosts.remove-confirm). */
export function RemoveConfirmDemo() {
  const { hosts } = useHosts();
  const asked = useRef(false);
  useEffect(() => {
    const last = hosts[hosts.length - 1];
    if (!last || asked.current) return;
    asked.current = true;
    void removeHostWithConfirmation(last);
  }, [hosts]);
  return <HostsRoute />;
}
