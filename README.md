# Server Browser for OpenChamber

Run Chrome on the OpenChamber server. Agents drive it with the `browser.*` actions of OpenChamber's `openchamber_web` tool. Open the Server Browser panel to see and control the same page, with its form values, cookies, and navigation state, and to inspect it with Chrome DevTools.

This is the extension extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734).

## Status

**Experimental. This extension does not yet replace the original Server Browser implementation.** Version 0.9.0 has Chrome's own DevTools for the page in the panel, draws pages and DevTools at your display's pixel ratio, lets double and triple clicks select text, and copies to your clipboard from the page menu and from DevTools. [Releases](https://github.com/JosueGalRe/openchamber-server-browser/releases) list what each version changed and how it was checked.

The goal is functional parity with the Server Browser in PR #3425 through OpenChamber's official extension APIs. The reference is [commit 362dbc3f305615200d762b721106c64e796b095b](https://github.com/JosueGalRe/openchamber/tree/362dbc3f305615200d762b721106c64e796b095b/packages/web/server/lib/browser), a feature reference rather than a claim that every original runtime or platform was validated. Parity means the agent and the person work in the exact same server-owned browser target, keeping cookies, sign-ins, form values, and navigation state across the handoff, with the original's tab management, scoped sessions, debugging tools, local-server workflow, and interaction controls. Showing the same URL in a separate browser does not meet that goal. The original stays the functional reference until the gaps below are closed and tested.

## Requirements

- OpenChamber 2.0.1 or newer. The manifest declares `openchamber.engines.openchamber: >=2.0.1`, so older hosts refuse to install or update it.
- Chrome or Chromium 109 or newer on the machine running OpenChamber, a full build rather than `chrome-headless-shell`: DevTools use the frontend bundled with that Chrome. Drawing at your display's pixel ratio needs a Chrome that can emulate its headless screen (`Emulation.updateScreen`); an older one keeps the panel at 1x.
- A supported host service runtime. Development uses Node.js 22 or newer and Bun for installing locked dependencies. The extension includes its built service, so installing it does not need this repository's development dependencies.
- For development-server discovery only: Linux, which uses `lsof` when installed and `/proc` otherwise, or macOS with `lsof`. On other systems discovery allows nothing.

## Install

1. Open OpenChamber's extension settings and install from `https://github.com/JosueGalRe/openchamber-server-browser`, or install the ZIP attached to a release.
2. Review and approve its service permission. The service launches Chrome on the OpenChamber host.
3. Select **Server Browser** under **Settings → General → OpenChamber Tools → Browser provider**.
4. In a chat, ask the agent to open a page with the `openchamber_web` tool. Open **Server Browser** from the panel rail to view that same page.

For a folder installation, clone this repository, configure it, and install its absolute directory path through OpenChamber's extension settings.

### Updating

- **From 0.8.x:** update in place; no new permissions. While a viewer is attached, pages see your display's `devicePixelRatio` (2 on most Macs) instead of 1. Their layout, `screen` size, and agent captures do not change. If the dock lacks the DevTools button afterwards, reopen the panel.
- **From 0.7.x:** an agent action without a tab id uses the tab the agent last used, not the tab selected in the dock.
- **From 0.6.x:** `browser.open` without a tab id opens a background tab unless the visible tab is still blank. Version 0.7.0 and later need OpenChamber 2.0.1, so update OpenChamber first.
- **From 0.5.x:** version 0.6.0 declares `lsof` and `ps` for development-server discovery, so approve the service again. Origin grants match only the host name they list.

Back up your installed `config.json` before updating or reinstalling: it is local configuration and is not part of the package.

## Using it

### Agents and the panel share one browser

The service starts on the first browser action, even with no panel open. Opening the panel alone does not start a browser. Each browser belongs to a project/chat pair: the dock offers **Open for this chat** for the chat you are viewing, and otherwise the chat's first agent action starts it.

OpenChamber owns the control handoff. Your first click, key, wheel, or paste in the picture takes control and also reaches the page. While you hold control, OpenChamber refuses the agent's browser actions; **Hand back to agent** releases it. The "Click or type to take control" line and that button belong to OpenChamber's panel, not to this extension.

OpenCode 2 also gives agents its own `browser.*` tools, such as `browser.tabs.open`, for its desktop app. Those calls never reach this extension and fail with `browser.disconnected` on a web host; ask the agent to use `openchamber_web` instead.

### Agent actions

The provider implements `browser.open`, `snapshot`, `click`, `type`, `select`, `scroll`, `back`, `forward`, `inspect`, `capture`, `resize`, and `close`.

- **Tabs.** `browser.snapshot` lists the chat's tabs with ids, and every action accepts a `tabId` from that list. Without one, an action uses the tab the agent last used, or the newest it opened when that one closed, and the tab selected in the dock only while the agent has none. An id this browser did not issue is refused rather than applied to another tab.
- **Opening and closing.** `browser.open` without a `tabId` opens a background tab unless the visible tab is still blank, and returns that tab's id. `browser.close` closes a tab the agent opened, its most recent one without a `tabId`, and refuses tabs the viewer or a page opened.
- **Settling.** `browser.open` reports `settled: true` only once the page has loaded and then gone quiet, with no new resource and no DOM tree or text change for 500 ms, waiting at most 5 seconds. `browser.capture` waits the same way for at most 3 seconds.
- **Selects and snapshots.** `browser.snapshot` lists each native select's options, up to 32, and a `selector` scopes its text as well as its elements. `browser.select` picks one option of a native single-value select by exact label or value. It refuses ambiguous, disabled, multiple, and custom controls without changing the page.
- **Captures** are one pixel per CSS pixel of the viewport, whatever pixel ratio the panel draws at.
- **Background tabs.** Acting on a background tab does not change what the viewer sees.
- **Time limits.** OpenChamber replaces a service that misses an action's time limit, which would take every chat's browser with it. So an action the page does not finish in time fails a little earlier instead, after 18 seconds or 43 for `browser.open`, with "The page did not respond in time".

### Scopes and lifetime

Each authoritative `{ directory, sessionId }` pair gets its own Chrome process and temporary profile, with its own cookies, storage, form state, and history. Calls missing either field fail closed instead of reusing another chat's browser.

- **Limits.** The service keeps at most four live scopes. At the limit, the scope unused for longest makes room once it has been idle for a minute. If every scope was active in the last minute, the new chat's action fails with an explanation.
- **Idle expiry.** A scope closes after five minutes without agent actions, dock commands, input, or a viewer showing it. That removes its profile and sign-ins.
- **Crashes.** If Chrome exits unexpectedly, the dock says so and the chat's next action starts a new browser.
- **Service stops.** Stopping or restarting the service stops every Chrome first and then removes its profiles, well within the five seconds OpenChamber waits before killing the service. OpenChamber stops an unattended browser provider after ten minutes without actions; an open panel keeps it running.
- **No persistence.** There is no session restore or persistent profile. State survives a live handoff, not idle expiry or a restart.

The first scope becomes visible automatically. After that, the dock follows the chat you open in OpenChamber when that chat has a browser, and its session tabs pick any live scope. Agent work in another chat continues in that chat's browser without moving the viewer.

### The panel

The dock above the picture holds:
- session tabs and **Open for this chat**;
- page tabs;
- the address field, back, forward, and reload or stop;
- the console problem count;
- the DevTools button;
- a viewport picker with rotation and mobile emulation;
- the native-select mode.

The viewer holding control can use the dock while other viewers' docks wait. Every dock command and input batch carries the frame it was made on, so one made on a picture of an earlier view (another scope, tab, or DevTools state) is refused instead of landing in the new one. An address typed without a scheme opens over HTTP when it is an IP address or `localhost`, and over HTTPS otherwise.

- **Tabs and popups.** Links that open a new tab and `window.open` popups become page tabs. You can open, switch, and close them, and closing a popup returns to the tab that opened it. Titles, loading state, and history update live, and **Stop** interrupts a slow load. Every tab the extension opens gets its own Chrome window, so a background tab keeps painting and the agent can capture it. A tab a page opens from a link shares its opener's window, as in Chrome.
- **Sizes and sharpness.** Pages are sized in CSS pixels and drawn at your display's pixel ratio, so text stays sharp on high-density displays without changing the page's layout. **Fit panel** follows the panel. A preset (mobile, tablet, desktop), a custom size, rotation, or mobile emulation fixes the size until someone picks another, and OpenChamber letterboxes it. The picker says when the agent chose the current size.
- **Keyboard and pointer.** Text entry works for Enter, editing and navigation keys, select-all, and AltGr/Option characters. Pages see the `keyCode` your browser computed for your layout on OpenChamber 2.6.0 and later, and the US key position's code before that. Dragging selects text and moves sliders, and double and triple clicks select a word and a line.
- **Clipboard.** Ctrl/Cmd+C copies the page selection, including inside open shadow roots and same-origin frames, but never a password field. Pasting types the pasted text.
- **Context menu.** A right click the page does not handle opens a viewer menu drawn inside the page with Back, Forward, Reload, and Copy. Copy puts the selection on your clipboard. Where OpenChamber cannot write it (its window must have focus, and some browsers also want a recent click), a notification offers a Copy button instead.

### Chrome DevTools

The `</>` button in the dock opens Chrome's own DevTools for the visible tab in place of the picture; the button again shows the page. The frontend is the one bundled with the Chrome running the page, so it always matches its protocol. It shows a live screencast of the page beside the panels, where the element picker and highlights appear and where you can click and type into the page. Hide that pane with DevTools' screencast toggle when the panel is narrow, or maximize the panel to fit both.

- **Look.** DevTools follow OpenChamber's light or dark theme. They draw their own context menus, because headless Chrome shows no native ones.
- **Copying.** What they copy (Copy element, Copy as cURL, a selected node with Cmd/Ctrl+C) goes to your clipboard like the page menu's Copy.
- **One tab at a time.** DevTools inspect one tab at a time and close when another tab comes forward or theirs closes. Closing them, like closing Chrome's, drops their console and network history.
- **Device mode is off.** The dock's viewport picker owns the page's size.

### Browser inspector and page problems

**Browser inspector**, under **Extension pages** in OpenChamber's sidebar, captures the visible tab's console messages and network requests while it is open:
- **Limits:** up to 300 console rows, 200 requests, and 2 MiB.
- **Request details:** shown on demand, with bodies up to 8,000 characters.
- **Redaction:** query parameters, headers, and JSON or form fields with credential-like names show `[REDACTED]`.
- **Prompt:** runs JavaScript in the page.

The dock's error and warning count opens a list of the visible tab's latest 50 errors and warnings under the address bar, growing the dock while it is open. The count and list start over when the page loads a new document.

### Native select menus

Chrome draws a native `<select>` popup outside the page, where the panel cannot show it. After handing control back, the last toolbar button, "Show native select menus in the shared browser", applies Chromium's `appearance: base-select` so single-choice selects open inside the page, for the selected scope. It is off by default and does not persist across a service restart. Turning it off removes only the extension's inspector styles, without reloading the page or clearing form state.

The mode covers only `<select>` without `multiple` and with no `size` or `size="1"`, not custom menus such as Radix components. It needs a Chrome that supports `appearance: base-select` and does not reach shadow roots or out-of-process frames. It can change a site's select rendering; one Bootstrap control grew taller and showed two arrows. The extension never turns it on by itself.

## Local development servers

Private and loopback destinations are blocked unless you allow them. Copy `config.example.json` to `config.json` in the installed extension directory and list the exact origins you need:

```json
{
  "allowedOrigins": [
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]
}
```

For several machines or many ports, list a private IPv4 block in `allowedNetworks` with the ports it may use. Ports are required, and a `"first-last"` string covers a range. A block applies to HTTP, HTTPS, and WebSocket traffic, and it must be private or loopback and no broader than /8:

```json
{
  "allowedNetworks": [
    { "cidr": "192.168.1.0/24", "ports": [3000, "5173-5199", 8080] }
  ]
}
```

A block matches the address a name resolves to, so it also allows any domain that resolves into it on a listed port, including one a page rebinds there. Keep blocks and port lists narrow, and list loopback servers in `allowedOrigins` rather than as a loopback block.

To reach development servers without listing them, set `"discoverDevServers": true`. The service then allows loopback ports with a live listener, over IPv4 and IPv6, checking again at most every three seconds, so a server that stops loses access.

- **Names.** `localhost` uses whichever loopback family the server listens on. Discovery grants only `127.0.0.1`, `[::1]`, and `localhost`.
- **Never granted.** Ports held by OpenChamber itself, its other child processes such as OpenCode and other extension services, or this extension and its Chrome. It allows nothing when it cannot tell which process owns a port.
- **Always skipped.** SSH, DNS, SMB, printing, common database ports, and the Node.js inspector port.
- **Everything else becomes reachable.** Every other loopback listener on the machine can be reached from pages in the shared browser, including databases on other ports, a second OpenChamber or OpenCode, and other browsers' debugging ports. Keep discovery off where that matters.

Restart the extension after editing its configuration. `localhost` means the machine running the extension, so an SSH-forwarded port must be reachable there. A page that loads assets from, or calls, another private origin needs that origin allowed too.

Origin grants:
- distinguish HTTP from HTTPS and include WebSocket traffic on the same host and port;
- match the host name in the address, not what it resolves to, so a domain that resolves or rebinds to a granted address cannot reach it, and an alias such as `myapp.test` needs its own entry;
- let `localhost` use the grants for `127.0.0.1` and `[::1]`, because the service resolves it itself.

Link-local, cloud metadata, CGNAT, IPv6 transition, and reserved ranges stay blocked even when listed. A blocked plain-HTTP address opens a page that names the origin, the path of `config.json`, and the entry to add, and for a loopback address whether discovery is off or found no eligible server. HTTPS navigations to a blocked address end in Chrome's own `ERR_TUNNEL_CONNECTION_FAILED`.

Chrome discovery checks standard locations. If necessary, add `"chromePath": "/absolute/path/to/chromium"` to `config.json`. The file is excluded from Git and from the package.

## Security boundaries

The service uses OpenChamber's authenticated loopback protocol, and every scope's traffic goes through its egress policy. The host's service approval and declared executable names describe intent; they are not an operating-system sandbox, and the service runs with the host user's access. The local-origin list belongs to the installation, not to a project or chat, and applies until configuration changes and the service restarts.

The visible scope is one selection shared by every viewer, a convenience view rather than an authorization boundary between mutually untrusted viewers.

**DevTools never get raw access to Chrome.** The frontend runs in a browser context of its own and reaches the inspected tab only through a relay in the service. The relay listens on a random loopback port and accepts only the frontend's `devtools://devtools` origin with a 32-byte token that is new each time DevTools open. It caps messages and buffering at 64 MiB.

Its policy passes the page's own protocol domains and the targets the page owns. It refuses:
- the `Browser` domain, other targets, and stream handles it did not hand out;
- downloads, file uploads and drops from the server's disk, and device-metrics overrides;
- navigation other than http(s) or `about:blank`, which drops the connection.

Cookie commands stay in the scope's context. The frontend's own traffic goes through the scope's egress policy, apart from the relay port, and pages it tries to open are closed.

**Development-server discovery** trusts process ownership, not intent: with it on, any page the agent or a person opens can send requests to every eligible loopback listener. Discovery runs `lsof`, and `ps` on macOS; both are declared in the manifest. It never widens access beyond loopback.

**Chrome presents itself as regular Chrome,** because Google refuses sign-in from a browser that says it is automated. The User-Agent names `Chrome` instead of `HeadlessChrome`, with the major version that `chrome --version` reports or, on Windows, that `chrome.exe`'s version resource gives, and `navigator.webdriver` is false. Pages therefore cannot tell from those signals that an agent may be driving the browser.

## Known limitations and parity gaps

| Area | Original Server Browser reference | Extension 0.9.0 |
| --- | --- | --- |
| Chrome DevTools | Embedded Chrome DevTools with authenticated transport and frontend asset handling. | Chrome's bundled DevTools for the visible tab through a token-guarded, policy-filtered relay, shown in place of the picture with a screencast of the page beside them. One tab at a time; they close when another tab comes forward. Device mode is off. Performance recording passes the policy but is unverified. |
| Console and network inspection | Dedicated inspector with console capture, network rows, and request details. | DevTools, plus the Browser inspector page with console rows, network rows, request details, on-demand bodies, redaction, and a JavaScript prompt for the visible tab while the page is open. |
| Tabs and popups | Tab listing, creation, switching, closing, and tracking targets opened by pages or CDP clients. | Page tabs for new tabs and popups, with create, switch, and close. Agents list tabs, name one with `tabId`, open background tabs, and close the tabs they opened; they cannot bring one to the viewer. |
| Project and chat isolation | Browser contexts scoped by directory and agent session, with separate cookies and storage. | One isolated runtime per authoritative project/chat pair, at most four, with idle expiry and least-recently-used replacement. Unknown context fails closed. The visible selection is shared by every viewer. |
| Browser controls | Navigation, tab, viewport, and inspection controls. | Dock with session tabs, Open for this chat, page tabs, address field, history, reload or stop, viewport picker, DevTools, native-select mode, and the page's errors and warnings, for the viewer holding control. |
| Local-server access | Grants derived from live development-server discovery and checked against active destinations. | Manual `allowedOrigins` and `allowedNetworks`, applied on restart, plus opt-in `discoverDevServers` for live loopback listeners, excluded by process ownership because extensions do not receive the host's port list. No in-app origin editor. |
| Viewports | Coordination between the viewer, agent presets, and external DevTools emulation. | CSS-pixel sizing drawn at the viewer's pixel ratio, fit-panel and fixed modes, presets, custom sizes, rotation, mobile emulation, and agent/viewer authorship. DevTools' device mode is not available. |
| Context menus and clipboard | Page-menu handling and selection reads through open shadow roots and same-origin frames. | Viewer menu inside the page for right clicks the page leaves alone, and DevTools' own menus. Plain-text copy to the viewer's clipboard from Ctrl/Cmd+C, the viewer menu, and DevTools, through open shadow roots and same-origin frames, never from password fields. No rich clipboard formats. |
| Keyboard and pointer details | Dedicated editing-key and cross-platform shortcut handling. | Enter, editing and navigation keys, select-all, AltGr/Option characters, held-button dragging, and double and triple clicks. Full IME parity is unverified. With a host older than 2.6.0, punctuation reports the `keyCode` of its US key position. |
| Native popups | The original screencast showed the same invisible native `select` popup. | An opt-in, reversible scope mode renders single-choice options inside the page with `appearance: base-select`. Native menus stay invisible while it is off. |
| Chrome/CDP configuration | Managed Chrome discovery and CDP configuration integrated with the original host workflow. | Standard executable discovery or a manual `chromePath`. No CDP settings UI, CDP endpoint for external MCP clients, or attachment to an existing Chrome. |
| Runtime integration | Browser behavior integrated into OpenChamber's runtime contracts. | Exercised on Linux and macOS web hosts and the macOS desktop app. Mobile and VS Code integration are not implemented. Windows and private relay are unverified. |

The panel displays image frames. It does not expose the remote page's DOM as local controls, and accessibility or responsiveness parity with the original viewer has not been established. No frame-rate equivalence is claimed. A frame at a 2x ratio carries four times the pixels: fine over loopback, heavier for a remote viewer on a slow link.

## Roadmap to parity

Missing functionality is not automatically a limitation of the SDK. The table separates extension work, host/SDK questions, and validation:

| Work | Current assessment | Completion criteria |
| --- | --- | --- |
| Interaction details | Text entry, shortcuts, dragging, and multi-click selection are ported. IME behavior is unverified. | Verify IME composition and platform shortcuts on real pages through the shared panel. |
| Tab management and browser controls | Viewer-side tabs, popups, and controls are ported; agents name tabs by id and close the ones they opened. Agents cannot bring a tab to the viewer. | Run a multi-tab workflow with a real model, not only direct tool calls. |
| Scoped viewing | Browser state is isolated per project/chat, and dock calls and input carry the viewer and frame, so stale input cannot cross a scope, tab, or DevTools switch. The visible selection is shared. | Decide with upstream whether concurrent viewers need their own selection. |
| DevTools | Chrome's bundled DevTools through the relay and its policy, at the viewer's pixel ratio, with their own menus and clipboard. | Follow tab switches, verify Performance recording and remote viewers, and run them on Linux and Windows. |
| Local-server workflow | Opt-in discovery allows live loopback listeners and drops them when they stop, excluding by process because extensions do not receive the host's port list. | Adopt authoritative host discovery or scoped grants if upstream offers them. |
| Session lifecycle | Idle expiry, least-recently-used replacement, and crash recovery are implemented, and actions give up before the host's time limit. | Define restart behavior and test that failed or stale work cannot affect another session or revive a stopped service. |
| Runtime and release support | A validation and integration task, not a promise of automatic SDK compatibility. | Verify each supported runtime and transport, test a real agent workflow, and publish an explicit support matrix. |

## What we still need from the SDK

This assessment is based on the [service contracts in OpenChamber 2.6.0](https://github.com/openchamber/openchamber/blob/v2.6.0/packages/sdk/GUEST_SERVICES.md). The SDK provides:
- unattended browser-provider actions and authoritative project/chat context;
- a shared image/input viewer with host-owned control, and a dock that sets its own height;
- tab ids on every browser action, and closing the tabs an agent opened;
- the identity and last frame of the viewer behind each dock call and input batch;
- the viewer's `keyCode` on key events;
- host clipboard writes from guest pages.

We do not need to request those again.

**Confirmed contract gaps for parity:** none for the workflows mapped so far.

The maintainers kept embedded DevTools and development-server discovery/grants out of the SDK ([maintainer response](https://github.com/openchamber/openchamber/pull/3425#issuecomment-5752977364)). DevTools here need no SDK change: their frontend runs in the server's Chrome and reaches the viewer through the existing surface. Discovery is an opt-in in the service.

Open questions for upstream:

| Need | What needs clarification or support | Evidence that would close the question |
| --- | --- | --- |
| Supported runtime behavior | The extension uses the released SDK 2.6.0; Linux and macOS web hosts and the macOS desktop app have been exercised. | Validation on every runtime and transport we advertise. |
| The tab an action without `tabId` uses | Since 2.5.0 the tool tells agents that such an action uses the tab they last used, else the user's open tab, while the provider contract still says the tab the user sees. This extension follows the tool. | Upstream aligns the provider contract with the tool. |

Chrome target tracking, browser actions, input handling, clipboard behavior, proxy cleanup, and regression tests belong in the extension. For any upstream request, first provide the user workflow, the contract that prevents it, a minimal reproduction, and the smallest proposed capability.

## Build and test

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run check
bun run package
```

`service/main.js`, `panel/main.js`, and `panel/inspector.js` are the committed bundles used by Git installations; rebuild them after changing source files. `bun run package` writes the installable package to `artifacts/openchamber-server-browser-<version>.zip`. Chrome-dependent tests report a skip when Chrome is unavailable.

## Validation

The automated suite runs real Chrome where it can. It covers:
- service authentication and protocol validation, private-address policy, origin grants and discovery, and cancellation;
- every browser action and shared input against real pages: keyboard layouts, dragging, multi-click selection, copying, the viewer menu, tabs and popups, loading state, viewports at the viewer's pixel ratio, and crash recovery;
- temporary-profile cleanup, scope isolation, fail-closed unknown context, stale-frame and generation guards, and the scope bound;
- the inspector, and DevTools through their relay and policy.

For 0.9.0 the suite passed 101 tests on macOS with Chrome 156, where the Linux-only listener test skips. Its real Chrome tests check:
- **DevTools:**
  - the relay refuses a client without the frontend's origin;
  - the policy denies `Browser.close` and drops a `file://` navigation;
  - pages the frontend opens are closed;
  - DevTools fill the panel at its ratio while the page keeps its size;
  - input arrives in CSS pixels, and DevTools close when another tab comes forward;
  - a right click shows DevTools' own menu, and a DevTools copy reaches the copy chord.
- **Pages at a 2x ratio:**
  - frames come at twice the CSS size;
  - a loaded mobile page keeps its 980px layout;
  - agent captures stay at CSS size, and nothing is enlarged back at 1x;
  - `screen` keeps its CSS size.
- **Clicks:** a double click selects a word and a triple click a line.

These tests fail against 0.8.3, as does the mobile layout test without its fix. On the OpenChamber desktop app 2.6.1-canary on macOS, installed from this folder:
- the dock opened DevTools, and their Console ran code in the page and stayed connected across a reload;
- pages and DevTools came at 1336×1586 for a 668×793 panel at 2x;
- the context menu showed Copy ▸ Copy element, and the copied markup reached the clipboard;
- double clicks selected words.

On an isolated web host of the same version, the real panel opened and closed DevTools, a click in the Elements tree highlighted the element in the page's screencast, and a maximized panel showed both side by side.

Linux, Windows, Safari and Firefox as hosts, private relay, and mobile have not been run with this build, nor has the 2.0.1 floor. No cross-platform or long-running stability claim is made. Earlier releases record their own checks in their [release notes](https://github.com/JosueGalRe/openchamber-server-browser/releases).

## Attribution

Adapted from OpenChamber under the MIT license. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
