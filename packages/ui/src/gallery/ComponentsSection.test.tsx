import { screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ComponentCapture, ComponentsSection } from './ComponentsSection';
import { componentCatalog, findCatalogEntry, parseCatalogKey } from './components/registry';

describe('component catalog harness', () => {
  it('registers each component once, each with a default or named variants', () => {
    const names = componentCatalog.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of componentCatalog) {
      expect(entry.variants.length).toBeGreaterThan(0);
      const ids = entry.variants.map((variant) => variant.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('parses Name and Name.variant keys', () => {
    expect(parseCatalogKey('AgentCard')).toEqual({ name: 'AgentCard', variantId: 'default' });
    expect(parseCatalogKey('AgentCard.blocked')).toEqual({
      name: 'AgentCard',
      variantId: 'blocked',
    });
    expect(findCatalogEntry('NoSuchComponent')).toBeUndefined();
  });

  it('renders every registered variant in Indigo and Papel', async () => {
    await renderThemed(<ComponentsSection />);
    for (const entry of componentCatalog)
      for (const variant of entry.variants)
        for (const skin of ['indigo', 'papel'])
          expect(screen.getByTestId(`catalog-${entry.name}-${variant.id}-${skin}`)).toBeTruthy();
    // Every catalog variant renders twice: the budget grows with the catalog and a loaded machine.
  }, 30_000);

  it('a capture of an unknown component says so instead of crashing', async () => {
    await renderThemed(<ComponentCapture name="NoSuchComponent.x" theme="papel" />);
    expect(screen.getByTestId('capture-NoSuchComponent.x')).toBeTruthy();
  });
});
