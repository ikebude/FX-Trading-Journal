/**
 * T6.7 — feature flags + read-only plugin scaffold.
 *
 * Flags are resolved deterministically: explicit override > env-style
 * config map > built-in default. The plugin registry is intentionally
 * read-only in v1.1 — it establishes the contract v1.2 widget plugins
 * will implement; nothing is loaded or executed yet.
 */

export type FeatureFlag =
  | 'voiceMemos' // T6.1
  | 'nlSearch' // T6.2
  | 'screenshotOcr' // T6.3
  | 'coachingPrompts' // T6.4
  | 'auditSeal' // T6.5
  | 'multiAccountPortfolio' // T5.1
  | 'pluginWidgets'; // T6.7 (off until v1.2)

const DEFAULTS: Record<FeatureFlag, boolean> = {
  voiceMemos: true,
  nlSearch: true,
  screenshotOcr: true,
  coachingPrompts: true,
  auditSeal: true,
  multiAccountPortfolio: true,
  pluginWidgets: false,
};

export function isFeatureEnabled(
  flag: FeatureFlag,
  overrides: Partial<Record<FeatureFlag, boolean>> = {},
): boolean {
  if (Object.prototype.hasOwnProperty.call(overrides, flag)) {
    return overrides[flag] as boolean;
  }
  return DEFAULTS[flag];
}

/** All resolved flags (defaults merged with overrides). */
export function resolveFlags(
  overrides: Partial<Record<FeatureFlag, boolean>> = {},
): Record<FeatureFlag, boolean> {
  const out = { ...DEFAULTS };
  for (const k of Object.keys(out) as FeatureFlag[]) {
    out[k] = isFeatureEnabled(k, overrides);
  }
  return out;
}

// ── Read-only plugin scaffold (v1.2 contract) ──────────────────

export interface DashboardWidgetPlugin {
  id: string;
  title: string;
  /** Semver of the plugin API this targets. */
  apiVersion: string;
  /** Pure render contract — receives serialisable aggregate data. */
  render: (data: unknown) => unknown;
}

const REGISTRY = new Map<string, DashboardWidgetPlugin>();

/** Register a plugin. No-op + false return when pluginWidgets is off. */
export function registerWidgetPlugin(
  plugin: DashboardWidgetPlugin,
  flags: Partial<Record<FeatureFlag, boolean>> = {},
): boolean {
  if (!isFeatureEnabled('pluginWidgets', flags)) return false;
  if (REGISTRY.has(plugin.id)) return false;
  REGISTRY.set(plugin.id, plugin);
  return true;
}

/** Snapshot of registered plugins (empty in v1.1 — feature is off). */
export function listWidgetPlugins(): DashboardWidgetPlugin[] {
  return [...REGISTRY.values()];
}

/** Test/util only — clear the registry. */
export function _resetPluginRegistry(): void {
  REGISTRY.clear();
}
