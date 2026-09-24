# Server Browser for OpenChamber

Run Chrome on the OpenChamber server. Agents drive it with the `browser.*` actions of OpenChamber's `openchamber_web` tool, and you can open the Server Browser panel to see and control the same page, including its current form values, cookies, and navigation state.

This is the extension extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734).

## Status and goal

**Experimental. This extension does not yet replace the original Server Browser implementation.** Version 0.6.0 ports most of the remaining viewer, tab, lifecycle, and inspection features of PR #3425 onto the same SDK 2.0.0 contracts. Text entry and shortcuts, dragging, copying, a page context menu, page tabs and popups, live loading state with a stop button, a viewport picker, idle scope expiry, crash recovery, a browser for the chat you are viewing, a console and network inspector, and opt-in development-server discovery now work. It keeps the blocked-address page and `allowedNetworks` from 0.5.0, OpenChamber 2.0.0 support from 0.4.0, the native-select compatibility mode from 0.3.0, and project/chat isolation from 0.2.0. Embedded DevTools, agent-side tab selection, multi-viewer fencing, and other runtimes remain open.

The goal is functional parity with the Server Browser in PR #3425 through OpenChamber's official extension APIs. The reference for this extraction is [commit 362dbc3f305615200d762b721106c64e796b095b](https://github.com/JosueGalRe/openchamber/tree/362dbc3f305615200d762b721106c64e796b095b/packages/web/server/lib/browser). It is a feature reference, not a claim that every original runtime or platform was validated.

Parity means the agent and person can work in the exact same server-owned browser target, preserving cookies, authentication, form values, and navigation state during handoff. It also means recovering the original tab management, scoped sessions, debugging tools, local-server workflow, and interaction controls. Showing the same URL in a separate browser does not meet that goal.

The original implementation remains the functional reference until those gaps are closed and tested. The roadmap below describes intended work, not shipped features or a release-date commitment.

## Requirements

- OpenChamber 2.0.0 or newer. The manifest declares `openchamber.engines.openchamber: >=2.0.0`, so older hosts refuse to install or update it.
- Chrome or Chromium 109 or newer installed on the machine running OpenChamber.
- A supported host service runtime. Development uses Node.js 22 or newer and Bun for installing locked dependencies.
- For development-server discovery only: Linux, which uses `lsof` when installed and `/proc` otherwise, or macOS with `lsof`. On other systems discovery allows nothing.

The extension includes its built service. Installing it in OpenChamber does not require installing this repository's development dependencies.

## Install

1. Open OpenChamber's extension settings and install from `https://github.com/JosueGalRe/openchamber-server-browser`.
2. Review and approve its service permission. The service launches Chrome on the OpenChamber host.
3. Select **Server Browser** under **Settings → General → OpenChamber Tools → Browser provider**.
4. In a chat, ask the agent to open a page with the `openchamber_web` tool. Open **Server Browser** from the panel rail to view that same page.

Updating from 0.5.x: version 0.6.0 adds `lsof` and `ps` to the service's declared executables for development-server discovery. OpenChamber withdraws a service approval when an update declares new permissions, so approve the service again after updating. Discovery stays off unless you enable it.

The service starts on the first browser action, even if no panel is open. Interacting with the panel takes control from the agent. Use the panel's release control action to hand the page back. OpenChamber owns this control handoff and rejects agent actions while you hold control.

Opening the panel alone does not start a browser. Each browser belongs to a project/chat pair: the dock offers **Open for this chat** for the chat you are viewing, and otherwise the chat's first agent action starts it. Until then the dock explains this and keeps its toolbar disabled. OpenCode 2 also gives agents its own `browser.*` tools, such as `browser.tabs.open`, for its desktop app. Those calls never reach this extension and fail with `browser.disconnected` on a web host; ask the agent to use `openchamber_web` instead.

## Local development servers

Private and loopback destinations are blocked unless you explicitly allow them. Copy `config.example.json` to `config.json` in the installed extension directory and list the exact origins you need:

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

To reach development servers without listing them, set `"discoverDevServers": true`. The service then allows loopback ports with a live listener, over IPv4 and IPv6, and checks again at most every three seconds, so a server that stops loses access. `localhost` uses whichever loopback family the server listens on. Discovery never allows ports held by OpenChamber itself, the host's other child processes such as OpenCode and other extension services, or this extension and its Chrome, and it allows nothing when it cannot tell which process owns a port. SSH, DNS, SMB, printing, common database ports, and the Node.js inspector port are always skipped. Every other loopback listener on the machine can become reachable from pages in the shared browser, including databases on other ports, a second OpenChamber or OpenCode, and debugging ports of other browsers. Keep discovery off where that matters.

Restart the extension after editing its configuration. `localhost` means the machine running the extension, so an SSH-forwarded port must be reachable there. A page that uses another private origin for assets, API requests, or sockets needs that origin allowed too. Origin grants distinguish HTTP from HTTPS and include the corresponding WebSocket traffic on the same host and port. Link-local, cloud metadata, CGNAT, IPv6 transition, and reserved ranges remain blocked even when listed.

A blocked plain-HTTP address opens a Server Browser page that names the origin, the path of this `config.json`, and the entry to add. For a loopback address it also says whether discovery is off or found no eligible server on that port. HTTPS navigations to a blocked address still end in Chrome's own `ERR_TUNNEL_CONNECTION_FAILED` error.

Chrome discovery checks standard locations. If necessary, add `"chromePath": "/absolute/path/to/chromium"` to `config.json`. This file is local configuration and is excluded from Git and the distributed package. Keep a copy before reinstalling or updating an installation.

For a folder installation, clone this repository, configure it, and install its absolute directory path through OpenChamber's extension settings.

## What works today

The provider implements `browser.open`, `snapshot`, `click`, `type`, `scroll`, `back`, `forward`, `inspect`, `capture`, and `resize`. It starts without an open viewer. The shared panel sends pointer, keyboard, wheel, text, and resize events to the same Chrome target used by the agent, and agent actions work on the tab selected in the dock.

Each authoritative `{ directory, sessionId }` pair gets its own browser runtime, cookies, local storage, form state, and history. Calls with either field missing fail closed instead of reusing a private chat's browser. The service keeps at most four live scopes, and a scope with no activity for five minutes closes. At the limit, the scope unused for longest makes room once it has been idle for a minute; if every scope was active in the last minute, the new chat's action fails with an explanation instead of deleting active browser state. If Chrome exits unexpectedly, the service drops that scope and the dock says so. The chat's next browser action, or **Open for this chat**, starts a new browser.

The first scope becomes visible automatically. After that, the dock follows the chat you open in OpenChamber when that chat has a browser, and you can pick any live scope from its session tabs. Agent work in another chat continues in that chat's browser without redirecting the viewer. The dock above the viewer provides page tabs, an address field, back, forward, reload or stop, a viewport picker, the native-select mode, and a count of the page's console errors and warnings, all through the official `serviceRequest` bridge. An address typed without a scheme opens over HTTP when it is an IP address or `localhost`, and over HTTPS otherwise.

Input covers the common local-browser cases: Enter, editing and navigation keys, Ctrl/Cmd+A, AltGr/Option characters, dragging to select text or move sliders, the wheel, and pasting. Ctrl/Cmd+C copies the page selection, including selections inside open shadow roots and same-origin frames, but never the contents of a password field. A right click that the page does not handle itself opens a viewer menu drawn inside the page with Back, Forward, Reload, and Copy. Copy offers the text through an OpenChamber notification with a copy button, because the service cannot write to your clipboard.

Links that open a new tab and `window.open` popups become page tabs in the dock. You can open, switch, and close tabs, and closing a popup returns to the tab that opened it. Tab titles, loading state, and back/forward availability update live, and **Stop** interrupts a slow load.

Pages are sized in CSS pixels: the service converts the panel's device-pixel size with the viewer's pixel ratio, so moving the viewer to a display with another ratio does not change the page's layout width. **Fit panel** follows the panel. A preset (mobile, tablet, desktop), a custom size, rotation, or mobile emulation fixes the size until someone picks another, and the host letterboxes it. The picker says when the agent chose the current size.

**Browser inspector**, under **Extension pages** in OpenChamber's sidebar, captures the visible tab's console messages and network requests while it is open, up to 300 console rows, 200 requests, and 2 MiB. It shows request details and, on demand, bodies up to 8,000 characters. Query parameters, headers, and JSON or form fields with credential-like names show `[REDACTED]`. Its prompt runs JavaScript in the page. The dock's error and warning counts start over whenever the page loads a new document.

After handing control back, use the last toolbar button, "Show native select menus in the shared browser", to enable visible native select menus for the selected project/chat scope. It is off by default and does not persist across a service restart. Enabling it applies Chromium's `appearance: base-select` to single-choice native selects in the current document and later navigations. Disabling it removes only the extension-owned inspector styles, without reloading the page or clearing form state.

OpenChamber owns the control handoff. A person can take over the page, the host refuses agent actions while that person holds control, and the agent can continue after control is released. This same-page workflow has been tested through the host and its panel.

## Known limitations and parity gaps

| Area | Original Server Browser reference | Extension 0.6.0 |
| --- | --- | --- |
| Chrome DevTools | Embedded Chrome DevTools with authenticated transport and frontend asset handling. | No embedded DevTools. The Browser inspector page covers console, network, and JavaScript evaluation, and `browser.inspect` returns element details. |
| Console and network inspection | Dedicated inspector with console capture, network rows, and request details. | Browser inspector extension page with console rows, network rows, request details, on-demand bodies, redaction, and a JavaScript prompt. It captures the visible tab only while the page is open. |
| Tabs and popups | Tab listing, creation, switching, closing, and tracking targets opened by pages or CDP clients. | Page tabs in the dock for new tabs and popups opened by pages, with create, switch, and close. Agents act on the tab selected in the dock; there is no agent-side tab API (`browser.tabs`, `tabId`). |
| Project and chat isolation | Browser contexts scoped by directory and agent session, with separate cookies/storage. | One isolated runtime per authoritative project/chat pair, bounded to four live scopes with idle expiry and least-recently-used replacement. Unknown context fails closed. The selected viewer remains service-global. |
| Browser controls | Browser-specific navigation, tab, viewport, and inspection controls. | Dock with session tabs, Open for this chat, page tabs, address field, back, forward, reload or stop, viewport picker, native-select mode, and a console-problem count. |
| Local-server access | Grants derived from live development-server discovery and checked against active destinations. | Manual `allowedOrigins` and `allowedNetworks`, applied on restart, plus opt-in `discoverDevServers` for live loopback listeners. Discovery excludes by process ownership because extensions do not receive the host's port list. No in-app origin editor. |
| Viewports | Coordination between the viewer, agent presets, and external DevTools emulation. | CSS-pixel sizing with the viewer's pixel ratio, fit-panel and fixed modes, presets, custom sizes, rotation, mobile emulation, and agent/viewer authorship. External DevTools emulation is not ported. |
| Context menus and clipboard | Page-menu handling and selection reads through open shadow roots and same-origin frames. | Viewer menu drawn inside the page for right clicks the page leaves alone. Plain-text copy through open shadow roots and same-origin frames, never from password fields. No rich clipboard formats or copy/paste fallback buttons. |
| Keyboard and pointer details | Dedicated editing-key and cross-platform shortcut handling. | Enter, editing and navigation keys, select-all, AltGr/Option characters, and held-button dragging. Like the original, pointer input sends a click count of 1, so double-click selection does not work. Full IME parity is unverified. |
| Native popups | A matched local test showed the same invisible native `select` popup with the original screencast implementation. | A scope-local toolbar mode uses Chromium's `appearance: base-select` so single-choice options render inside the captured page. It is reversible and off by default because it changes the site's native select rendering. Native menus remain invisible while the mode is off. |
| Chrome/CDP configuration | Managed Chrome discovery and CDP configuration integrated with the original host workflow. | Standard executable discovery or a manual `chromePath`. No CDP settings UI, CDP endpoint for external MCP clients, or supported attachment to an existing Chrome session. |
| Runtime integration | Browser behavior integrated into OpenChamber's runtime contracts. | Linux web-host path validated. Mobile and VS Code integration have not been implemented. Electron, Windows/macOS, and private relay remain unverified. |

### Scope, viewing, and lifetime

Agent browser state is isolated by the project directory and chat session id supplied by OpenChamber. The shared viewer is still one service-global selection. It is a convenience view, not an authorization boundary between mutually untrusted viewers.

Only the first newly created scope becomes visible automatically. Later agent actions stay in their own background scope. A person can switch the visible scope while the shared surface is idle, from the dock's session tabs or by opening another chat that has a browser. Every dock command carries the view generation it was created for, so a delayed address or history command cannot mutate a scope selected afterward. Switching also cancels the old frame wait and rebases frame sequence numbers so the host requests the new image immediately.

When the visible scope changes, the service applies the current panel size before publishing its first frame, so a scope in **Fit panel** mode never appears as a tiny letterboxed image. A fixed size stays until someone picks another, whether the agent or a viewer chose it.

The SDK does not identify which panel viewer sent `serviceRequest`, and surface input does not carry the frame or scope generation the viewer saw. Dock mutations are therefore disabled while any user or agent controller owns the surface. This prevents the dock from bypassing the host lease, but one residual race remains: input generated from an old image can arrive after an idle scope switch and target the newly selected view. Full multi-viewer fencing needs host-issued viewer identity or a view generation on input.

Each scope uses a separate Chrome process and temporary profile. A scope closes after five minutes without agent actions, dock commands, input, or a viewer showing it, which removes its profile, cookies, and login state. Stopping or restarting the service closes every process and removes its profiles. OpenChamber stops an unattended browser provider after ten minutes without actions; an open shared panel keeps it running. The next start creates fresh browsers. There is no session restore or persistent-profile option. Preserving state during a live handoff is supported; preserving it across idle expiry or process restarts is not. The original implementation also used temporary Chrome profiles, so durable profiles are not presented here as an existing original feature.

Native select compatibility applies only to single-choice `<select>` elements without `multiple`, with no `size` attribute or with `size="1"`. It does not style custom menus such as Radix components. Chrome must support `appearance: base-select`; unsupported versions return an error and leave the mode off. The service uses CDP inspector stylesheets, so page CSP does not need to be bypassed. Styles inside shadow roots and out-of-process frames are not guaranteed because the extension does not attach to additional targets for this workaround. A site can still depend on native select measurements or platform-specific behavior. During validation, one Bootstrap control became taller and showed both its own arrow and the base-select arrow. The extension never enables the mode automatically for this reason.

### Configuration and security boundaries

The local-origin list belongs to the extension installation, not to a project or chat. It remains in effect until configuration changes and the service restarts. Local configuration is not bundled and should be backed up before updating or reinstalling. Reserved and metadata address restrictions still apply even to listed destinations, as described above.

The service uses OpenChamber's authenticated loopback protocol and applies browser egress checks. The host's service approval and declared executable names describe permission intent; they do not provide an operating-system sandbox. The service runs with the host user's access.

Development-server discovery trusts process ownership, not intent. With it on, any page that the agent or a person opens in the shared browser can send requests to every eligible loopback listener. Discovery runs `lsof`, and `ps` on macOS; both are declared in the manifest. It never widens access beyond loopback.

### Compatibility and validation limits

The extension depends on the published `@openchamber/sdk@2.0.0`, the first registry release with scoped provider calls and docked surface controls. Only the Linux web host has been exercised against the 2.0.0 floor.

The shared panel displays image frames. It does not expose the remote page's DOM as local controls, and accessibility or responsiveness parity with the original viewer has not been established. No performance or frame-rate equivalence is claimed.

Automated checks and manual host tests do not establish compatibility with every website, login popup, platform, transport, or concurrent workflow. The exact validation scope is recorded below.

## Roadmap to parity

Missing functionality is not automatically a limitation of the SDK. The table separates extension implementation, host/SDK design questions, and validation work:

| Work | Current assessment | Completion criteria |
| --- | --- | --- |
| Recover interaction details | Ported in 0.6.0, except double-click selection, which the original also lacks, and verified IME behavior. | Verify IME composition and platform shortcuts on real pages through the shared panel. |
| Recover tab management and browser controls | Viewer-side tabs, popups, and controls are ported. Agent target selection still has no contract. | Let agent requests name the intended tab and agree with the viewer's selection without losing state. |
| Harden scoped viewing | Provider actions now carry authoritative project/chat identity and browser state is isolated. The shared viewer still has one service-global selection. | Bind frames and input to a host-issued view generation or viewer lease so stale input cannot cross an idle scope switch. |
| Restore the inspector and embedded DevTools | The console and network inspector is an extension page. Embedded DevTools is not implemented; the image/input surface does not provide a DevTools frontend, asset proxy, or CDP transport. | Inspect the same selected target with DevTools, with authenticated assets and transport, bounded buffering, proper cleanup, and no raw debugger exposure to viewers. |
| Restore the local-server workflow | Opt-in discovery allows live loopback listeners and drops them when they stop. It excludes by process because extensions do not receive the host's port list. | Validate discovery on macOS, and adopt authoritative host discovery or scoped grants if upstream offers them. |
| Match session lifecycle behavior | Idle expiry, least-recently-used replacement, and crash recovery are implemented. | Define restart behavior and test that failed or stale work cannot affect another session or revive a stopped service. |
| Establish runtime and release support | A validation and integration task, not a promise of automatic SDK compatibility. | Verify each supported runtime and transport, test a real agent workflow, use a compatible released SDK, and publish an explicit support matrix. |

The latest [maintainer response](https://github.com/openchamber/openchamber/pull/3425#issuecomment-5752977364) keeps embedded DevTools and development-server discovery/grants outside the SDK for now, while explicitly allowing an extension-owned console. The console and network inspector is therefore an extension page, and the dock, whose manifest height is fixed, shows only a problem count. Discovery lives in the service as an opt-in.

The next implementation work should recover capabilities that fit the existing contracts and produce small reproductions for any remaining host blockers. Those findings can then be discussed upstream with concrete requests. We should call this a replacement for the original only after the parity gaps have been closed or explicitly documented as agreed differences, with evidence from the actual user flows.

## What we still need from the SDK

This assessment is based on the [official service contracts at commit `959d179c6`](https://github.com/openchamber/openchamber/blob/959d179c6aa06af6d8102461c8fea166e0433445/packages/sdk/GUEST_SERVICES.md); the published SDK 2.0.0 ships the same compiled contracts. It records what remains after adopting scoped provider calls and docked controls. These are discussion points for upstream, not agreed API changes.

The SDK now provides unattended browser-provider actions, authoritative project/chat context, a shared image/input viewer with host-owned control, and an extension page docked beside that viewer. We do not need to request those again.

### Confirmed contract gaps for parity

| Need | Current contract | What would let us complete the migration |
| --- | --- | --- |
| Viewer identity and stale-input fencing | The shared surface has one service-global controller. Dock calls have no viewer identity, and input events have no view generation. | Bind dock calls and surface input to the viewer lease and the selected view generation. The service could then reject input produced from an old frame or by another viewer. |

### Capabilities to investigate with upstream

These requirements are concrete, but we have not established that each requires a new API. Existing extension mechanisms should be evaluated first.

| Need | What needs clarification or support | Evidence that would close the question |
| --- | --- | --- |
| Agent tab selection | The ten browser actions do not define a tab-management contract. We need a supported way for agent requests to identify the intended target and agree with the viewer's selection. Additional extension tools may provide part of this. | A two-tab workflow where the agent lists/selects a target, the person sees that target, and concurrent viewers cannot silently redirect another action. |
| Dock sizing and control-row composition | The dock has a fixed manifest size, and the host owns its title/control row and handback action. 0.6.0 puts the inspector on an extension page instead. | Agree on a supported pattern if a compact expandable console in the dock is still wanted, while preserving visible, host-owned control arbitration. |
| Supported runtime behavior | The implementation uses the released SDK 2.0.0, and only the Linux web host has been exercised so far. | A reproducible install against a released host/SDK combination, followed by validation on every runtime and transport we advertise. |

Embedded DevTools and host-level development-server discovery/grants are deferred product discussions. The maintainer has explicitly kept them outside the SDK for now. The extension's opt-in discovery and its inspector page use existing service and page mechanisms; neither is presented as an accepted upstream API request.

### Work that remains ours

Chrome target tracking, browser actions, selection traversal, editing-key handling, clipboard improvements, proxy cleanup, and regression tests belong in the extension. A missing implementation is not evidence that the SDK needs to change. Persistent profiles are also a separate product decision, not a prerequisite for reproducing the original temporary-profile behavior.

For any upstream API request, first provide the user workflow, the current contract that prevents it, a minimal reproduction, and the smallest proposed capability. Viewer identity and stale-input fencing are the remaining correctness issue for scoped viewing. DevTools and local-server discovery remain separate product discussions.

## Build and test

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run check
bun run package
```

`service/main.js`, `panel/main.js`, and `panel/inspector.js` are the committed bundles used by Git installations. `artifacts/openchamber-server-browser-0.6.0.zip` contains the installable package. Rebuild the bundles after changing source files.

## Validation

Initial validation used Linux with OpenChamber web host at `56f33fd59a3225c28be4ba25b91aae958d4374f5`, using an isolated data directory and a temporary local website. The OpenCode backend was a test fixture; no model or real chat session was used. For 0.2.0, validation used the unmodified web host at `959d179c6`, a real managed OpenCode process, two test project/chat contexts, and real Chrome. No model conversation was run.

The host routed all ten browser actions to real Chrome, saved a capture to the test project, rendered the shared panel, and preserved a form value across user/agent handoff. Manual panel checks covered clicking, typing keys, pasting, resizing, taking control, and handing control back. An unapproved loopback port was blocked. Disabling the extension stopped its service and Chrome processes.

The automated suite covers service authentication and protocol validation, private-address policy, cancellation, real Chrome actions and shared input, temporary-profile cleanup, context isolation, fail-closed unknown context, pinned viewing, stale frame cancellation, dock generation checks, and the four-scope bound. Chrome-dependent tests report a skip when Chrome is unavailable. Windows, macOS, Electron, private relay, and mobile have not been validated.

The 0.2.0 pre-push run passed 34 tests with no skips. Live host checks verified isolated cookies and storage across two scopes, same-page user/agent handoff, the host's 409 during human control, keyboard session switching, Enter-only navigation, back/forward, reload with a URL fragment, and invalid-URL recovery. Narrow and wide toolbar layouts were visually checked.

For 0.3.0, the final automated run passed 41 tests with no skips, including real Chrome, compatibility under restrictive page CSP, navigation/reload persistence, disabling without clearing form values, scope isolation, and control/generation guards. A separate regression repeatedly aborts CONNECT tunnels while upstream data is arriving. It reproduced the uncaught `EPIPE` before the socket fix and passed afterward. The fix closes the affected connection rather than terminating the service; it does not change origin permissions.

Live checks on the same unmodified `959d179c6` Linux web host covered Selenium's native select, selecting an option with the mouse, preserving form values when disabling compatibility, and opening/selecting a Radix custom dropdown. The original integrated build also reproduced the invisible native popup in a matched local comparison, so this is not reported as an SDK rendering regression. The final uninstrumented bundle completed the previously failing local-to-public navigation with the viewer connected, retained a second independent scope, and remained connected during an idle check longer than 40 seconds. Build, syntax, focused lint, and ZIP integrity checks passed. This is bounded functional evidence, not a long-running stability or cross-platform claim.

For 0.4.0, validation used the OpenChamber 2.0.0 web host with OpenCode 2.0.15. An `openchamber_web` `browser.open` call from a real chat created a scope for that chat's directory and session, launched Chromium, and appeared in the panel. Before any action, the rebuilt panel showed its empty-state hint with the toolbar disabled. After the host's idle stop, no Chrome process or temporary profile remained. The host's own install check accepted the package on 2.0.0 and refused it on 1.24.2 as `host-too-old`. Switching to SDK 2.0.0 left both bundles byte-identical to the 0.3.0 build, and the automated suite passed 41 tests with no skips.

For 0.5.0, the automated suite passed 46 tests with no skips. With the built bundle, a real `config.json`, and real Chrome, a listed port inside an allowed block loaded. The same host on an unlisted port with a server running, and an address outside the block, showed the new blocked page, and a `0.0.0.0/0` block stopped the service with a clear error. The blocked page rendered without overflow at 320, 622, and 1440 pixels. Through the live OpenChamber 2.0.0 panel, typing `192.168.1.20:3100` opened `http://192.168.1.20:3100/` and `example.com` opened `https://example.com/`. A blocked HTTPS address still ended in `ERR_TUNNEL_CONNECTION_FAILED`.

For 0.6.0, the automated suite passed 82 tests with no skips. Real Chrome covered keyboard input, dragging, copying through shadow roots and frames, the viewer menu, tabs and popups, loading state and stop, CSS-pixel viewports, crash recovery, and the inspector, and a real listener scan ran through both `lsof` and `/proc`. Live checks used the OpenChamber 2.0.0 web host with OpenCode 2.0.15 in an isolated data directory, real Chromium, two real chats, and a local test site reached through development-server discovery, with the viewer driven through Chrome DevTools. They covered typing, Enter, AltGr characters, dragging to select, Ctrl+C, the viewer menu and its Copy notification, a page's own context menu, page tabs, `target=_blank` and `window.open` popups, live titles and stop, a pixel-ratio change, presets, rotation, custom sizes, the inspector's console, request details, redaction, and prompt, the problem count, Open for this chat, following chat switches, killing Chrome, and idle expiry. Discovery allowed the test site while the blocked page still covered the host's own port and its OpenCode. That pass found and fixed eight defects: a black viewer when the first frame request opened the page, a screencast start during a renderer swap, drags without the held button, the viewer menu closing on a repeated control claim, problem counts surviving navigation, a pixel-ratio change resizing the page, a custom-size editor that never applied inside the host's sandboxed frame, and inspector tabs losing focus on every poll. No agent action ran through the host in this pass; the automated suite covers the provider path. Windows, macOS, Electron, private relay, and mobile have not been validated.

## Attribution

Adapted from OpenChamber under the MIT license. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
