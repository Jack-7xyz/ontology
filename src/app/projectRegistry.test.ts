import { describe, expect, it } from 'vitest';
import { getPublicProjects, matchPublicProjectRoute } from './projectRegistry';

describe('projectRegistry', () => {
  it('exposes only public projects', () => {
    expect(getPublicProjects().map((project) => project.slug)).toEqual(['retail']);
  });

  it('matches the retail route base and nested retail paths', () => {
    expect(matchPublicProjectRoute('/retail')?.slug).toBe('retail');
    expect(matchPublicProjectRoute('/retail/source/orders')?.slug).toBe('retail');
  });

  it('does not match unknown route prefixes', () => {
    expect(matchPublicProjectRoute('/retailer')).toBeNull();
    expect(matchPublicProjectRoute('/airplane')).toBeNull();
  });
});
