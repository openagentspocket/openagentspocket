// The mobile app has no Node typings; this source-level test only needs two fs calls.
declare const __dirname: string;
const { readFileSync, readdirSync } = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string): string[];
};

const appDir = `${__dirname}/../app`;
const read = (file: string) => readFileSync(`${appDir}/${file}`, 'utf8');

/**
 * Regression for T-atlas-redbox: a route that set `presentation: 'modal'` through its own
 * `<Stack.Screen options>` flipped the presentation of an already pushed screen. On iOS that
 * remounts the scene, and under the atlas (one pushed screen per deep link) it ended in
 * "Maximum update depth exceeded" (SafeAreaView -> SceneView, Modal.componentWillUnmount).
 * Presentation is static: it is declared once in the root stack.
 */
describe('modal routes', () => {
  const routeFiles = readdirSync(appDir).filter(
    (file) => /\.tsx$/.test(file) && !file.startsWith('_'),
  );

  it('no route sets presentation from inside the screen', () => {
    for (const file of routeFiles)
      expect({ file, source: read(file) }).toEqual({
        file,
        source: expect.not.stringMatching(/presentation\s*:/),
      });
  });

  it('declares the sheet routes through sheetOptions in the root stack', () => {
    const layout = read('_layout.tsx');
    for (const name of [
      'hosts',
      'ports',
      'files',
      'new-agent',
      'new-terminal',
      'worktree',
      'settings',
    ]) {
      expect(layout).toMatch(new RegExp(`name="${name}"[^>]*\\.\\.\\.(list|form)`, 's'));
    }
    // Only add-host stays outside sheetOptions: a transparent route that draws its own ChoiceSheet.
    expect(layout.match(/presentation\s*:\s*'\w+'/g)).toEqual(["presentation: 'transparentModal'"]);
  });
});
