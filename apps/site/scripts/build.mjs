// Builds dist/ for openagentspocket.com: the pages in src/ wearing the app's Índigo (dark) and Papel
// (light) colors from packages/ui/tokens, the app icon, /privacy redirected to the relay's policy (one
// source: packages/relay/src/privacy.js), and the Host installer from packages/plugin/install once it no
// longer points at a placeholder repository. Usage: node scripts/build.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://openagentspocket.com';
export const PRIVACY_URL = 'https://relay.openagentspocket.com/privacy';
const INSTALLERS = ['install.sh', 'install.ps1'];

const root = join(import.meta.dirname, '..');
const repo = join(root, '..', '..');

/** One theme's colors as CSS custom properties: `textPrimary` becomes `--text-primary`. */
export function themeVariables(theme) {
  return Object.entries(theme.colors)
    .map(([key, value]) => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`)
    .join(' ');
}

/** The installer paths, or null while one is missing or still names the placeholder repository. */
export function publishableInstaller(dir) {
  const files = INSTALLERS.map((name) => join(dir, name));
  if (!files.every((file) => existsSync(file))) return null;
  if (files.some((file) => readFileSync(file, 'utf8').includes('OWNER/'))) return null;
  return files;
}

function installBlock() {
  return [
    '<p>Or set up a Host in one line (macOS or Linux):</p>',
    `<pre class="command"><code>curl -fsSL ${ORIGIN}/install.sh | sh</code></pre>`,
  ].join('\n');
}

export function build({
  out = join(root, 'dist'),
  installerDir = join(repo, 'packages/plugin/install'),
} = {}) {
  const theme = (id) =>
    JSON.parse(readFileSync(join(repo, 'packages/ui/tokens/themes', `${id}.json`), 'utf8'));
  const installer = publishableInstaller(installerDir);
  const fill = (html) =>
    html
      .replaceAll('/* DARK */', themeVariables(theme('indigo')))
      .replaceAll('/* LIGHT */', themeVariables(theme('papel')))
      .replaceAll('{{INSTALL}}', installer ? installBlock() : '')
      .replaceAll('{{PRIVACY_URL}}', PRIVACY_URL);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const page of ['index.html', '404.html']) {
    writeFileSync(join(out, page), fill(readFileSync(join(root, 'src', page), 'utf8')));
  }
  for (const image of ['icon.png', 'favicon.png']) {
    copyFileSync(join(repo, 'apps/mobile/assets/images', image), join(out, image));
  }
  writeFileSync(join(out, '_redirects'), `/privacy ${PRIVACY_URL} 302\n`);
  if (installer) {
    for (const file of installer) copyFileSync(file, join(out, file.split('/').pop()));
    const headers = INSTALLERS.map(
      (name) => `/${name}\n  Content-Type: text/plain; charset=utf-8\n`,
    );
    writeFileSync(join(out, '_headers'), headers.join(''));
  }
  return { installer: installer !== null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { installer } = build();
  console.log(
    `dist/ built${installer ? ' with the installer' : ' (installer not publishable yet)'}`,
  );
}
