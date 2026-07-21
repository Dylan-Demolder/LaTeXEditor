/**
 * Plugins are data, not code.
 *
 * An earlier design had plugins ship a CommonJS entry point and a `PluginAPI`
 * object the app would hand them — editor access, filesystem, compile, events.
 * Nothing ever executed them, which was just as well: a plugin evaluated in the
 * webview inherits everything the app can do, including the Tauri IPC surface,
 * so it could read the API keys out of settings or write any file on disk.
 *
 * Declaring contributions in `plugin.json` gives the useful half of the feature
 * with nothing to sandbox. When a plugin needs to *do* something rather than
 * *provide* something, that is the point to design a real boundary — not now.
 */

/** What a plugin contributes. Only `snippets` does anything today. */
export type PluginType = "snippets" | "theme" | "component" | "tool";

/**
 * One completion-list entry. `body` is a Monaco snippet string, so `$1` and
 * `${1:default}` mark the tab stops — the same syntax the built-ins use.
 */
export interface PluginSnippet {
  /** What the user types to summon it. */
  prefix: string;
  name: string;
  description: string;
  body: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  description: string;
  author: string;
  /** Empty is valid: the plugin lists but contributes nothing. */
  snippets: PluginSnippet[];
}

export interface InstalledPlugin {
  id: string;
  path: string;
  enabled: boolean;
  manifest: PluginManifest;
}
