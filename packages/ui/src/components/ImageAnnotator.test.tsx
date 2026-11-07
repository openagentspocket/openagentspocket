import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/theme';
import { ImageAnnotator, strokePath } from './ImageAnnotator';

const labels = { use: 'Done', cancel: 'Cancel', undo: 'Undo' };

describe('ImageAnnotator', () => {
  it('draws a finger as one path', () => {
    const path = strokePath([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(path).toBe('M1 2 L3 4');
  });

  it('sends the picture as it was when nothing was drawn', async () => {
    const onDone = jest.fn();
    await render(
      <ThemeProvider themeId="indigo">
        <ImageAnnotator
          uri="file:///a.jpg"
          width={100}
          height={50}
          labels={labels}
          onDone={onDone}
          onCancel={jest.fn()}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('image-annotator-use'));
    expect(onDone).toHaveBeenCalledWith(null);
  });
});
