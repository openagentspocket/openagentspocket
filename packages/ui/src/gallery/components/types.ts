import type { ReactNode } from 'react';

/** One state of a catalog component, rendered with demo props only (no app state). */
export interface CatalogVariant {
  /** The variant id of docs/ux/components/catalog.json ('default' for the bare component). */
  id: string;
  render: () => ReactNode;
}

/** A catalog component in the gallery; `name` is the catalog name (`AgentCard`). */
export interface CatalogEntry {
  name: string;
  variants: readonly CatalogVariant[];
}
