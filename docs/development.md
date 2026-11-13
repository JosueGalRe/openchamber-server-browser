# Development

## Setup

Development uses Node.js 22 or newer and Bun for installing locked dependencies. Chrome or Chromium 109 or newer must be installed for the real-browser tests. To try changes in OpenChamber, install this repository's absolute path through the extension settings: a folder installation restarts the service when its bundle changes.

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run check
bun run package
```

| Command | What it does |
| --- | --- |
| `bun run build` | Bundles `src/` with esbuild into `service/main.js`, `panel/main.js`, `panel/inspector.js`, and `panel/status.js`. |
| `bun run test` | Runs the suite. Chrome-dependent tests report a skip when Chrome is unavailable, and the listener test runs only on Linux. |
| `bun run check` | Checks the service bundle's syntax. |
| `bun run package` | Writes the installable package to `artifacts/openchamber-server-browser-<version>.zip`. |

The bundles are committed, because Git installations use them as they are. Rebuild them after changing source files. A clean build must reproduce the committed bundles byte for byte.

## Layout

| Path | Contents |
| --- | --- |
| `src/main.js` | Service entry: configuration, manager, HTTP server |
| `src/service.js` | HTTP routes: browser provider, dock, surface, inspector |
| `src/browser-manager.js` | Scopes, the visible selection, control, view fencing |
| `src/browser-runtime.js` | One scope's Chrome: tabs, viewports, pixel ratio, commands |
| `src/surface.js` | Screencast frames and viewer input |
| `src/browser-actions.js` | The agent's `browser.*` actions |
| `src/chrome-process.js` | Launching Chrome: executable, profile, User-Agent |
| `src/context-menu.js` | The viewer menu drawn inside pages |
| `src/devtools.js` | The DevTools relay and frontend target |
| `src/devtools-policy.js` | What DevTools may send and receive |
| `src/policy-proxy.js`, `src/config.js`, `src/dev-servers.js` | Egress policy, configuration, development-server discovery |
| `src/panel.js` | The dock (`panel/index.html`) |
| `src/inspector-page.js`, `src/inspector.js` | The Browser inspector page and its capture |
| `src/status-section.js` | The Work Status section: its rows, Chrome's memory, and Close |
| `src/status-page.js` | The note hosts before 2.5.2 show in that section's place (`panel/status.html`) |

## Validation

The automated suite runs real Chrome where it can.

| Covers | Checks |
| --- | --- |
| The service | Authentication and protocol validation, private-address policy, origin grants and discovery, and cancellation. |
| Browser actions and shared input | Every action and shared input against real pages: keyboard layouts, dragging, multi-click selection, copying, the viewer menu, tabs and popups, loading state, viewports at the viewer's pixel ratio, and crash recovery. |
| Scopes and guards | Temporary-profile cleanup, scope isolation, fail-closed unknown context, stale-frame and generation guards, and the scope bound. |
| Inspection | The inspector, and DevTools through their relay and policy. |

Each [release](https://github.com/JosueGalRe/openchamber-server-browser/releases) records the automated and manual checks behind it. Those include the hosts, platforms, and Chrome versions used, and what was not run.

**Runs so far:**
- Linux and macOS web hosts.
- The macOS desktop app.
- The OpenChamber Android app on a Pixel 9 Pro XL, and the mobile web UI with touch emulation.

**Never run:**
- Windows, Safari and Firefox as hosts, private relay, iOS, and tablets.

No cross-platform or long-running stability claim is made.

For manual checks, use an isolated OpenChamber host with its own data directory, rather than a host you use day to day.

## Releases

Releases are experimental pre-releases.

1. **Feature commits**, each with its rebuilt bundles and a green suite.
2. **Docs update.**
3. A commit that bumps `package.json` to the new version.
4. **Tag.** A signed annotated tag `vX.Y.Z` with the message "Server Browser X.Y.Z experimental release".
5. **GitHub pre-release.** Its notes cover what changed, how to update, known limitations, and validation. It has the ZIP from `bun run package` attached, with its SHA-256 in the notes.

Git installations offer the update once `package.json` on the default branch has a newer version.
