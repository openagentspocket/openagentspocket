import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build, PRIVACY_URL, themeVariables } from '../scripts/build.mjs';

const temp = () => mkdtempSync(join(tmpdir(), 'site-'));

function installer(script) {
  const dir = temp();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'install.sh'), script);
  writeFileSync(join(dir, 'install.ps1'), script);
  return dir;
}

test('theme colors become kebab-case custom properties', () => {
  assert.equal(
    themeVariables({ colors: { textPrimary: '#FFF', canvas: '#000' } }),
    '--text-primary: #FFF; --canvas: #000;',
  );
});

test('pages are filled from the tokens and link the relay policy', () => {
  const out = join(temp(), 'dist');
  build({ out, installerDir: temp() });
  for (const page of ['index.html', '404.html']) {
    const html = readFileSync(join(out, page), 'utf8');
    assert.doesNotMatch(
      html,
      /\{\{\w+\}\}|\/\* (DARK|LIGHT) \*\//,
      `${page} has an unfilled placeholder`,
    );
    assert.match(html, /--accent: #[0-9A-F]{6};/);
  }
  assert.match(readFileSync(join(out, 'index.html'), 'utf8'), new RegExp(PRIVACY_URL));
  assert.equal(readFileSync(join(out, '_redirects'), 'utf8'), `/privacy ${PRIVACY_URL} 302\n`);
});

test('the installer stays unpublished while it names the placeholder repository', () => {
  const out = join(temp(), 'dist');
  assert.deepEqual(build({ out, installerDir: installer('REPO=OWNER/agentico-app\n') }), {
    installer: false,
  });
  assert.doesNotMatch(readFileSync(join(out, 'index.html'), 'utf8'), /install\.sh/);
});

test('a real installer is published as plain text and shown on the page', () => {
  const out = join(temp(), 'dist');
  assert.deepEqual(
    build({ out, installerDir: installer('REPO=openagentspocket/agentico-app\n') }),
    {
      installer: true,
    },
  );
  assert.equal(
    readFileSync(join(out, 'install.sh'), 'utf8'),
    'REPO=openagentspocket/agentico-app\n',
  );
  assert.match(
    readFileSync(join(out, '_headers'), 'utf8'),
    /\/install\.sh\n {2}Content-Type: text\/plain/,
  );
  assert.match(
    readFileSync(join(out, 'index.html'), 'utf8'),
    /curl -fsSL https:\/\/openagentspocket\.com\/install\.sh \| sh/,
  );
});
