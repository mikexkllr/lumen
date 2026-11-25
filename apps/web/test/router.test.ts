// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { currentRoute, href, navigate } from '../src/lib/router.ts';

describe('hash router', () => {
  it('splits and decodes the route', () => {
    location.hash = '#/practice/r/a%2Cb';
    expect(currentRoute()).toEqual(['practice', 'r', 'a,b']);
    location.hash = '';
    expect(currentRoute()).toEqual([]);
  });

  it('navigates with and without a history entry and tells listeners', () => {
    const seen: string[] = [];
    addEventListener('hashchange', () => seen.push(location.hash));
    const before = history.length;
    navigate('onboarding/age', true);
    expect(location.hash).toBe('#/onboarding/age');
    expect(history.length).toBe(before);
    expect(seen).toContain('#/onboarding/age');
    navigate('/profile');
    expect(location.hash).toBe('#/profile');
  });

  it('builds links', () => {
    expect(href('legal/terms')).toBe('#/legal/terms');
    expect(href('/u/@ada')).toBe('#/u/@ada');
  });
});
