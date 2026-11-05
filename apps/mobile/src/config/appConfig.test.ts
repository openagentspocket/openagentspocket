// Plain node modules, loaded through jest: the app's tsconfig carries no node types.
const fs = jest.requireActual('node:fs') as {
  readFileSync(file: string, encoding: 'utf8'): string;
  existsSync(file: string): boolean;
};
const path = jest.requireActual('node:path') as { join(...parts: string[]): string };

const root = process.cwd();
const configure = jest.requireActual(path.join(root, 'app.config.js')) as (input: {
  config: Record<string, unknown>;
}) => { ios: { appleTeamId?: string } };
const base = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

describe('Expo config and the Apple team', () => {
  const saved = process.env.APPLE_TEAM_ID;
  afterEach(() => {
    if (saved === undefined) delete process.env.APPLE_TEAM_ID;
    else process.env.APPLE_TEAM_ID = saved;
  });

  it('keeps the team out of every tracked file (the repo is open source)', () => {
    expect(base.ios.appleTeamId).toBeUndefined();
    for (const target of ['notification-service', 'widgets']) {
      const text = fs.readFileSync(
        path.join(root, 'targets', target, 'expo-target.config.js'),
        'utf8',
      );
      expect(text).not.toMatch(/appleTeamId|DEVELOPMENT_TEAM/);
    }
  });

  it('injects the owner team into ios.appleTeamId, the one place @bacons/apple-targets reads for the app and every target', () => {
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    expect(configure({ config: base }).ios.appleTeamId).toBe('TEAM123456');
  });

  it('builds without a team when none is configured', () => {
    delete process.env.APPLE_TEAM_ID;
    const local = path.join(root, 'app.local.json');
    if (!fs.existsSync(local)) expect(configure({ config: base }).ios.appleTeamId).toBeUndefined();
  });
});
