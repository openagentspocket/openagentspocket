import type { ComponentProps, ReactNode } from 'react';
import { EmptyState, ErrorState } from './EmptyState';
import { SkeletonRows } from './Skeleton';

interface AsyncContentProps {
  /** Wins over everything: what went wrong, and how to retry. */
  failure?: ComponentProps<typeof ErrorState> | null;
  loading?: boolean;
  loadingLabel?: string;
  /** Shown once loaded, when there is nothing to list. */
  empty?: ComponentProps<typeof EmptyState> | null;
  children: ReactNode;
}

/** The ladder every loaded list climbs: failed, loading, empty, then its content. */
export function AsyncContent({
  failure,
  loading,
  loadingLabel,
  empty,
  children,
}: AsyncContentProps) {
  if (failure) return <ErrorState {...failure} />;
  if (loading) return <SkeletonRows accessibilityLabel={loadingLabel} />;
  if (empty) return <EmptyState {...empty} />;
  return <>{children}</>;
}
