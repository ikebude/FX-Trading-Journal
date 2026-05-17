import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFeatureEnabled,
  resolveFlags,
  registerWidgetPlugin,
  listWidgetPlugins,
  _resetPluginRegistry,
} from '../src/lib/feature-flags';

beforeEach(() => _resetPluginRegistry());

describe('feature flags — T6.7', () => {
  it('uses built-in defaults', () => {
    expect(isFeatureEnabled('voiceMemos')).toBe(true);
    expect(isFeatureEnabled('pluginWidgets')).toBe(false);
  });

  it('override wins over default (incl. explicit false)', () => {
    expect(isFeatureEnabled('voiceMemos', { voiceMemos: false })).toBe(false);
    expect(isFeatureEnabled('pluginWidgets', { pluginWidgets: true })).toBe(true);
  });

  it('resolveFlags merges defaults + overrides', () => {
    const r = resolveFlags({ nlSearch: false });
    expect(r.nlSearch).toBe(false);
    expect(r.coachingPrompts).toBe(true);
  });
});

describe('plugin scaffold — T6.7', () => {
  const plugin = {
    id: 'p1',
    title: 'Demo',
    apiVersion: '1.0.0',
    render: () => null,
  };

  it('registration is a no-op while pluginWidgets is off (v1.1)', () => {
    expect(registerWidgetPlugin(plugin)).toBe(false);
    expect(listWidgetPlugins()).toEqual([]);
  });

  it('registers when the flag is forced on (v1.2 contract)', () => {
    expect(registerWidgetPlugin(plugin, { pluginWidgets: true })).toBe(true);
    expect(listWidgetPlugins()).toHaveLength(1);
    // duplicate id rejected
    expect(registerWidgetPlugin(plugin, { pluginWidgets: true })).toBe(false);
  });
});
