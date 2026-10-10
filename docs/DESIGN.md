# Mecord design

How the system is built and why. The README covers usage; this covers structure and trade-offs.

## 1. Architecture

| Part | Where | Job |
|---|---|---|
| **Host** (`src/*.rs`, `Mecord.exe`) | own process | Discovers and launches Discord, speaks CDP, injects the core, serves the page's RPC, compiles user plugins (embedded esbuild), watches files, talks to the store, runs native helpers, owns persistent config. |
| **Core** (`core/src/*.ts` → `core/dist/core.js`) | Discord's page | Webpack hook and patcher, plugin manager, Flux/commands/context-menu/toast/style services, settings UI (shadow DOM). Embedded in the exe as a string. |
| **Plugins** (`plugins/*`, `userplugins/`) | Discord's page | Independent bundles evaluated by the core; `@mecord/api` is their only import. |
| **Native helpers** | child processes | Optional per-plugin programs (hash-pinned, consent-gated). |
| **Store** (`store/`) | static files | Signed catalog + per-version plugin files. |

Nothing in Discord's install folder is modified. The only coupling is the `--remote-debugging-port=0` argument Mecord passes when it launches Discord.

## 2. Process model and lifecycle

1. **Find Discord**: newest `%LocalAppData%\<Channel>\app-x.y.z\<Channel>.exe`.
2. **Attach or launch**: if a live `DevToolsActivePort` exists, attach to the running instance. Else, if Discord is running without the endpoint, ask (native dialog) before restarting it. Else launch it. Chromium flags such as the Performance Suite's GPU options can only be given here.
3. **Inject** (per `discord.com` page target): `Page.setBypassCSP`, `Runtime.addBinding("__mecordBinding")`, `Page.addScriptToEvaluateOnNewDocument(core)`, then reload so the core runs before Discord's scripts.
4. **Boot**: the core installs the webpack hook, asks the host for `init` (config, plugin sources, themes), loads plugins (registering patches), and calls `start()` for enabled ones once Discord's modules exist. It reports `ready`.
5. **Run**: single-threaded host loop: CDP events, RPC, a 400 ms file/theme poll, 60 s URL-theme refresh. Slow work (network, native calls, dialogs, import) runs on worker threads and replies through a channel.
6. **Recover**: no `ready` within 25 s of injection (even if the core never reached `init`) → remove the injected script, drop CSP bypass, reload a clean page, count a failure. Three failures → safe mode (core with no plugins/themes; host ignores config writes from the page so the real config can't be clobbered).
7. **Exit**: when the CDP connection closes the host stops helpers; if Discord reappears within 5 s (self-update restart) it offers to re-attach.

Page ⇄ host RPC is JSON over the CDP binding (`{id, op, args}` → `{id, ok, result|error}`) plus host-pushed events (`plugin.update`, `theme.update`, …).

## 3. Webpack patching

Discord's JS is webpack bundles whose module factories are functions. The core:

- Hooks the `webpackChunkdiscord_app` array. Because several webpack runtimes share it and each chains onto whatever `push` it read, every value ever assigned to `push` gets its own fixed wrapper (a single "latest" wrapper recurses; this was a real bug found in testing).
- Captures `__webpack_require__` synchronously and wraps factories that never pass through `push` (the entry bundle's modules).
- Wraps each factory lazily: the first time a module runs, the factory source is matched against all patches, replacements are applied, each patch is test-compiled in isolation (`eval`), and the combined result replaces the factory. A patch that doesn't match or doesn't compile is marked and skipped; the original code runs. Object-method-shorthand factories (`123(e,t,n){…}`) are normalized to `function` first.
- Patch states: `pending`, `applied`, `nomatch`, `evalerror`, `needs-reload`, `disabled`, `stale`.

Patch text is Vencord-like: `find` (string/regex locating the module), replacements with `\i` (identifier) in regexes and `$self` (the plugin's instance, wrapped so exceptions are caught).

**Hot reload semantics.** Plugin logic behind `$self` swaps live. A *changed patch* can't be undone in a module that already ran; it is shown as `needs-reload` and applied on **Reload Discord UI**. Removed patches become `stale`. Unchanged patches keep their record across reloads (keyed by plugin + find + replacement).

**Surviving Discord updates.** Matching is on source shape, not module ids. After an update, Diagnostics shows which patches stopped matching. The core's only own patch (slash-command registry) is listed there too.

## 4. Plugin API

See `plugins/api.d.ts`. A plugin default-exports `definePlugin({...})` with any of: `settings` (schema), `patches`, `commands`, `flux`, `styles`, `contextMenu`, `start(ctx)`, `stop(ctx)`, `renderSettings(el, ctx)`. `ctx` offers `settings`, `storage` (host-persisted), `net.fetch` (host-proxied, capability-checked), `native.call`, `log`, and `add(disposer)`; everything registered through `ctx.add` or the declarative fields is undone on stop/reload.

Services: `Flux.subscribe/intercept/dispatch`, `Commands.register` (appears in Discord's native slash menu), `ContextMenu.register` (DOM-based; resolves message/user/channel/guild from the React fiber of the right-clicked element), `Toasts`, `Styles`, `Stores` (lookup of Discord's Flux stores), `Webpack.find*`.

Note: Flux stores are Proxies that report any property as present, so `findByProps` skips them; use `Stores.X`/`findStore`.

## 5. Store, atomic install, trust

```
exe pins Ed25519 pubkey ─► index.json (+ .sig): {version↑, expires, plugins:[{files:[{path,sha256,size}], native:{sha256}, capabilities}]}
                                   └─► every file hash-checked ─► staged dir ─► journal ─► rename into place ─► installed.json (temp+rename)
```

- A hash fetched from the same place as the file only detects corruption, so the **index is signed**; hashes live inside it. Index must verify, be unexpired, and not be older than the highest version seen (rollback refused). A last-good copy supports offline use until it expires.
- **Atomic**: downloads go to `plugins/.staging/…`; all files verified; a journal record is fsynced; the directory is renamed to `plugins/<id>/<version>`; the pointer file is rewritten via temp+rename; one previous version is kept. `store::recover()` finishes or discards interrupted installs at startup.
- `native` and `capabilities` shown to the user come from the signed index, never from plugin-supplied files.
- **Native plugins**: `native.consent` is handled by a host-side Windows dialog (the page can't spoof it) and stores the helper's SHA-256. At spawn the helper bytes are re-hashed, copied to a private cache path, and run from there, so the file can't be swapped between check and launch.
- Honest limit: JavaScript plugins are not sandboxed from the page. Capabilities gate only host APIs. Review + signature are the defence.

## 6. Data

`%AppData%\Mecord`: `config.json` (plugins/themes/quickCss/wallpaper/ui/consent/host), `plugins/`, `userplugins/`, `themes/`, `storage/<plugin>.json`, `backups/` (pre-import snapshots), `cache/` (esbuild, theme CSS, native helper copies, last index), `journal/`, `logs/mecord.log`.

Backup JSON: `{schema, created, mecord, settings:{ui,wallpaper}, plugins:[{id,origin,version,enabled,settings}], themes:[{id,name,enabled,url|css}], quickCss}`. Merge: incoming wins per settings key; plugin/theme lists are unions by id; Quick CSS only if asked. Replace: reset to the file. Both snapshot first. Missing store plugins are installed through the normal verified path.

## 7. Deliberate trade-offs

- **CDP injection instead of an `app.asar` shim**: no files modified, trivial `--vanilla`, immune to Discord re-patching; costs a restart on first attach and exposes a loopback debug port while Discord runs.
- **Vanilla-DOM UI in a shadow root** instead of Discord's React components: immune to Discord's component churn and theme CSS, at the cost of not matching Discord's look exactly.
- **DOM-level context menus and message decorations** instead of patching Discord's menu modules: fewer moving parts to break; less native-feeling.
- **No tray / installer yet**: the in-Discord UI plus a desktop shortcut covers daily use.
