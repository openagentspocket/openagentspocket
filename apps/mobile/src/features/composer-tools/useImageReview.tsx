import { t } from '@openagentspocket/i18n';
import { ImageAnnotator } from '@openagentspocket/ui';
import { fromBase64 } from 'agentico-ssh';
import { useCallback, useState } from 'react';
import type { ExpoLocalFiles } from '@/files/expoLocalFiles';
import type { Picked } from '@/files/pickers';

interface Review {
  picked: Picked & { width: number; height: number };
  answer: (picked: Picked | null) => void;
}

/** Writes the drawn picture beside the other uploads, and names it as a PNG. */
async function savedPng(png: string, files: ExpoLocalFiles): Promise<Picked> {
  const uri = await files.makeDestination('annotated', `${Date.now()}.png`);
  const writer = await files.openWriter(uri);
  await writer.append(fromBase64(png));
  await writer.close();
  return { uri, name: 'image.png', extension: 'png' };
}

/** A picked photo goes through the annotator first; one without a known size goes as it is. */
export function useImageReview(files: ExpoLocalFiles) {
  const [review, setReview] = useState<Review | null>(null);
  const reviewImage = useCallback((picked: Picked): Promise<Picked | null> => {
    const { width, height } = picked;
    if (!width || !height) return Promise.resolve(picked);
    return new Promise((resolve) => {
      const answer = (result: Picked | null) => {
        setReview(null);
        resolve(result);
      };
      setReview({ picked: { ...picked, width, height }, answer });
    });
  }, []);
  const sheet = review ? (
    <ImageAnnotator
      uri={review.picked.uri}
      width={review.picked.width}
      height={review.picked.height}
      labels={{ use: t('Done'), cancel: t('Cancel'), undo: t('Undo') }}
      onCancel={() => review.answer(null)}
      onDone={(png) => {
        if (png === null) review.answer(review.picked);
        else void savedPng(png, files).then(review.answer, () => review.answer(review.picked));
      }}
    />
  ) : null;
  return { reviewImage, sheet };
}
