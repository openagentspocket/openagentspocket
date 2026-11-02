import { createContext, useContext } from 'react';

/** App-level demos the gallery can trigger but packages/ui cannot implement (the in-app banner). */
export interface GalleryDemos {
  /** Plays an Agent transition through the app's InAppBanner. */
  showBanner?: () => void;
}

export const GalleryDemoContext = createContext<GalleryDemos>({});

export const useGalleryDemos = () => useContext(GalleryDemoContext);
