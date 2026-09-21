# Server Browser for OpenChamber

Run Chrome on the OpenChamber server. Agents use the standard `browser.*` tools, and you can open the Server Browser panel to see and control the same page, including its current form values, cookies, and navigation state.

This is the extension extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734).

## Status and goal

**Experimental. This extension does not yet replace the original Server Browser implementation.** Version 0.3.0 adds an optional native-select compatibility mode and fixes a proxy socket error that could restart the service during navigation. It retains the project/chat isolation and docked navigation toolbar introduced in 0.2.0. Substantial gaps remain in debugging, tab management, and multi-viewer coordination.

The goal is functional parity with the Server Browser in PR #3425 through OpenChamber's official extension APIs. The reference for this extraction is [commit 362dbc3f305615200d762b721106c64e796b095b](https://github.com/JosueGalRe/openchamber/tree/362dbc3f305615200d762b721106c64e796b095b/packages/web/server/lib/browser). It is a feature reference, not a claim that every original runtime or platform was validated.

Parity means the agent and person can work in the exact same server-owned browser target, preserving cookies, authentication, form values, and navigation state during handoff. It also means recovering the original tab management, scoped sessions, debugging tools, local-server workflow, and interaction controls. Showing the same URL in a separate browser does not meet that goal.

The original implementation remains the functional reference until those gaps are closed and tested. The roadmap below describes intended work, not shipped features or a release-date commitment.

## Requirements

- An OpenChamber build containing [commit `959d179c6`](https://github.com/openchamber/openchamber/commit/959d179c6aa06af6d8102461c8fea166e0433445). The latest published host release checked on September 21, 2026 was v1.24.2, which predates the required scoped-provider and dock contracts. The manifest does not claim a minimum released version yet.
- Chrome or Chromium 109 or newer installed on the machine running OpenChamber.
- A supported host service runtime. Development uses Node.js 22 or newer and Bun for installing locked dependencies.

The extension includes its built service. Installing it in OpenChamber does not require installing this repository's development dependencies.

## Install

1. Open OpenChamber's extension settings and install from `https://github.com/JosueGalRe/openchamber-server-browser`.
2. Review and approve its service permission. The service launches Chrome on the OpenChamber host.
3. Select **Server Browser** under **Settings → General → OpenChamber Tools → Browser provider**.
4. Ask the agent to open a page from a chat. Open **Server Browser** from the panel rail to view that same page.

The service starts on the first browser action, even if no panel is open. Interacting with the panel takes control from the agent. Use the panel's release control action to hand the page back. OpenChamber owns this control handoff and rejects agent actions while you hold control.

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

Restart the extension after editing its configuration. `localhost` means the machine running the extension, so an SSH-forwarded port must be reachable there. A page that uses another private origin for assets, API requests, or sockets needs that origin allowed too. Grants distinguish HTTP from HTTPS and include the corresponding WebSocket traffic on the same host and port. Link-local, cloud metadata, CGNAT, IPv6 transition, and reserved ranges remain blocked even when listed.

Chrome discovery checks standard locations. If necessary, add `"chromePath": "/absolute/path/to/chromium"` to `config.json`. This file is local configuration and is excluded from Git and the distributed package. Keep a copy before reinstalling or updating an installation.

For a folder installation, clone this repository, configure it, and install its absolute directory path through OpenChamber's extension settings.

## What works today

The provider implements `browser.open`, `snapshot`, `click`, `type`, `scroll`, `back`, `forward`, `inspect`, `capture`, and `resize`. It starts without an open viewer. The shared panel sends pointer, keyboard, wheel, text, and resize events to the same Chrome target used by the agent.

Each authoritative `{ directory, sessionId }` pair gets its own browser runtime, cookies, local storage, form state, and history. Calls with either field missing fail closed instead of reusing a private chat's browser. The service keeps at most four live scopes and refuses a fifth rather than silently deleting browser state.

The first scope stays visible until the person picks another one. Agent work in another chat continues in that chat's browser without redirecting the shared viewer. The dock above the viewer lists live scopes and provides an address field plus back, forward, and reload controls through the official `serviceRequest` bridge.

After handing control back, use the last toolbar button, "Show native select menus in the shared browser", to enable visible native select menus for the selected project/chat scope. It is off by default and does not persist across a service restart. Enabling it applies Chromium's `appearance: base-select` to single-choice native selects in the current document and later navigations. Disabling it removes only the extension-owned inspector styles, without reloading the page or clearing form state.

OpenChamber owns the control handoff. A person can take over the page, the host refuses agent actions while that person holds control, and the agent can continue after control is released. This same-page workflow has been tested through the host and its panel.

## Known limitations and parity gaps

| Area | Original Server Browser reference | Extension 0.3.0 |
| --- | --- | --- |
| Chrome DevTools | Embedded Chrome DevTools with authenticated transport and frontend asset handling. | No embedded DevTools. `browser.inspect` returns element details; it does not replace DevTools. |
| Console and network inspection | Dedicated inspector with console capture, network rows, and request details. | Bounded console warnings/errors in snapshots. No interactive console, network inspector, or request-detail panel. |
| Tabs and popups | Tab listing, creation, switching, closing, and tracking targets opened by pages or CDP clients. | One controlled target per project/chat scope. No tab manager or selection/routing for new windows and popups. A workflow that opens another target may become inaccessible through the extension. |
| Project and chat isolation | Browser contexts scoped by directory and agent session, with separate cookies/storage. | One isolated runtime per authoritative project/chat pair, bounded to four live scopes. Unknown context fails closed. The selected viewer remains service-global. |
| Browser controls | Browser-specific navigation, tab, viewport, and inspection controls. | Docked session tabs, address field, back, forward, and reload. No browser-tab management, viewport picker, stop, or inspector controls yet. |
| Local-server access | Grants derived from live development-server discovery and checked against active destinations. | Manual `allowedOrigins` in `config.json`, applied on restart. No live discovery, automatic revocation when a dev server stops, or in-app origin editor. |
| Viewports | Coordination between the viewer, agent presets, and external DevTools emulation. | Agent presets and panel resizing work. The original viewport coordination and DevTools emulation behavior have not been ported. |
| Context menus and clipboard | Page-menu handling and selection reads through open shadow roots and same-origin frames. | Basic input and plain-text copy/paste. Selection reads the top document or its focused input; it does not traverse frames or shadow roots. No original viewer context menu or rich clipboard support. |
| Keyboard and pointer details | Dedicated editing-key and cross-platform shortcut handling. | Basic keys, pointer input, wheel, and pasted text. Full shortcut/IME parity is unverified; pointer events currently use a single-click count, without dedicated double-click handling. |
| Native popups | A matched local test showed the same invisible native `select` popup with the original screencast implementation. | A scope-local toolbar mode uses Chromium's `appearance: base-select` so single-choice options render inside the captured page. It is reversible and off by default because it changes the site's native select rendering. Native menus remain invisible while the mode is off. |
| Chrome/CDP configuration | Managed Chrome discovery and CDP configuration integrated with the original host workflow. | Standard executable discovery or a manual `chromePath`. No migrated CDP settings UI or supported attachment to an arbitrary existing Chrome session. |
| Runtime integration | Browser behavior integrated into OpenChamber's runtime contracts. | Linux web-host path validated. Mobile and VS Code integration have not been implemented. Electron, Windows/macOS, and private relay remain unverified. |

### Scope, viewing, and lifetime

Agent browser state is isolated by the project directory and chat session id supplied by OpenChamber. The shared viewer is still one service-global selection. It is a convenience view, not an authorization boundary between mutually untrusted viewers.

Only the first newly created scope becomes visible automatically. Later agent actions stay in their own background scope. A person can switch the visible scope while the shared surface is idle. Every dock command carries the view generation it was created for, so a delayed address or history command cannot mutate a scope selected afterward. Switching also cancels the old frame wait and rebases frame sequence numbers so the host requests the new image immediately.

When the visible scope changes, the service applies the current panel dimensions before publishing its first frame. This avoids showing a desktop-sized background browser as a tiny letterboxed image. Viewing a scope can therefore replace its last agent-selected viewport with the current panel size.

The SDK does not identify which panel viewer sent `serviceRequest`, and surface input does not carry the frame or scope generation the viewer saw. Dock mutations are therefore disabled while any user or agent controller owns the surface. This prevents the dock from bypassing the host lease, but one residual race remains: input generated from an old image can arrive after an idle scope switch and target the newly selected view. Full multi-viewer fencing needs host-issued viewer identity or a view generation on input.

Each scope currently uses a separate Chrome process and temporary profile. Stopping or restarting the service closes every process and removes its profiles, including cookies and login state. OpenChamber stops an unattended browser provider after ten minutes without actions; an open shared panel keeps it running. The next start creates fresh browsers. There is no session restore or persistent-profile option. Preserving state during a live handoff is supported; preserving it across process restarts is not. The original implementation also used temporary Chrome profiles, so durable profiles are not presented here as an existing original feature.

Native select compatibility applies only to single-choice `<select>` elements without `multiple`, with no `size` attribute or with `size="1"`. It does not style custom menus such as Radix components. Chrome must support `appearance: base-select`; unsupported versions return an error and leave the mode off. The service uses CDP inspector stylesheets, so page CSP does not need to be bypassed. Styles inside shadow roots and out-of-process frames are not guaranteed because the extension does not attach to additional targets for this workaround. A site can still depend on native select measurements or platform-specific behavior. During validation, one Bootstrap control became taller and showed both its own arrow and the base-select arrow. The extension never enables the mode automatically for this reason.

### Configuration and security boundaries

The local-origin list belongs to the extension installation, not to a project or chat. It remains in effect until configuration changes and the service restarts. Local configuration is not bundled and should be backed up before updating or reinstalling. Reserved and metadata address restrictions still apply even to listed destinations, as described above.

The service uses OpenChamber's authenticated loopback protocol and applies browser egress checks. The host's service approval and declared executable names describe permission intent; they do not provide an operating-system sandbox. The service runs with the host user's access.

### Compatibility and validation limits

The extension vendors the official SDK snapshot from `959d179c6` because the latest published SDK inspected during development did not contain scoped provider calls or docked surface controls. Replace that pin with a compatible published SDK and add a verified host version requirement when the release exists. The package version inside the snapshot still reads `1.24.2`; that string does not establish host compatibility.

The shared panel displays image frames. It does not expose the remote page's DOM as local controls, and accessibility or responsiveness parity with the original viewer has not been established. No performance or frame-rate equivalence is claimed.

Automated checks and manual host tests do not establish compatibility with every website, login popup, platform, transport, or concurrent workflow. The exact validation scope is recorded below.

## Roadmap to parity

Missing functionality is not automatically a limitation of the SDK. The table separates extension implementation, host/SDK design questions, and validation work:

| Work | Current assessment | Completion criteria |
| --- | --- | --- |
| Recover interaction details | Primarily extension implementation work. | Port selection traversal, editing keys, click behavior, and clipboard handling; verify them on real pages through the shared panel. |
| Recover tab management and browser controls | Chrome target management can live in the service. User controls and agent target selection need a design compatible with the host contracts. | Create, list, select, and close tabs; track popups; route agent and user input to the intended target without losing state. |
| Harden scoped viewing | Provider actions now carry authoritative project/chat identity and browser state is isolated. The shared viewer still has one service-global selection. | Bind frames and input to a host-issued view generation or viewer lease so stale input cannot cross an idle scope switch. |
| Restore the inspector and embedded DevTools | Not implemented. The image/input surface does not itself provide a DevTools frontend, asset proxy, or CDP transport. Evaluate supported extension UI/service mechanisms before claiming a new SDK API is required. | Inspect the same selected target, with authenticated assets and transport, bounded buffering, proper cleanup, and no raw debugger exposure to viewers. |
| Restore the local-server workflow | Manual grants work. Access to authoritative host discovery and scoped authorization needs investigation. | Discover eligible live dev servers, handle stopped/replaced listeners, and keep private destinations blocked without a valid grant. |
| Match session lifecycle behavior | Cleanup is implemented; original scoping and recovery behavior are not fully migrated. | Define idle, disconnect, crash, and restart behavior; test that failed or stale work cannot affect another session or revive a stopped service. |
| Establish runtime and release support | A validation and integration task, not a promise of automatic SDK compatibility. | Verify each supported runtime and transport, test a real agent workflow, use a compatible released SDK, and publish an explicit support matrix. |

The latest [maintainer response](https://github.com/openchamber/openchamber/pull/3425#issuecomment-5752977364) keeps embedded DevTools and development-server discovery/grants outside the SDK for now, while explicitly allowing an extension-owned console in the dock. Console and Network capture/UI have not yet been ported. The dock has a fixed manifest height, so an expandable inspector and hiding the host-owned title/control row require additional host support or a different layout.

The next implementation work should recover capabilities that fit the existing contracts and produce small reproductions for any remaining host blockers. Those findings can then be discussed upstream with concrete requests. We should call this a replacement for the original only after the parity gaps have been closed or explicitly documented as agreed differences, with evidence from the actual user flows.

## What we still need from the SDK

This assessment is based on the [official service contracts at the pinned host commit](https://github.com/openchamber/openchamber/blob/959d179c6aa06af6d8102461c8fea166e0433445/packages/sdk/GUEST_SERVICES.md). It records what remains after adopting scoped provider calls and docked controls. These are discussion points for upstream, not agreed API changes.

The SDK now provides unattended browser-provider actions, authoritative project/chat context, a shared image/input viewer with host-owned control, and an extension page docked beside that viewer. We do not need to request those again.

### Confirmed contract gaps for parity

| Need | Current contract | What would let us complete the migration |
| --- | --- | --- |
| Viewer identity and stale-input fencing | The shared surface has one service-global controller. Dock calls have no viewer identity, and input events have no view generation. | Bind dock calls and surface input to the viewer lease and the selected view generation. The service could then reject input produced from an old frame or by another viewer. |
| Released compatibility floor | The needed contracts exist at `959d179c6`, while the SDK snapshot still identifies itself as `1.24.2` and no compatible release was available during this work. | Publish the contracts in a release and document the first compatible OpenChamber version so the extension can restore `openchamber.engines.openchamber`. |

### Capabilities to investigate with upstream

These requirements are concrete, but we have not established that each requires a new API. Existing extension mechanisms should be evaluated first.

| Need | What needs clarification or support | Evidence that would close the question |
| --- | --- | --- |
| Agent tab selection | The ten browser actions do not define a tab-management contract. We need a supported way for agent requests to identify the intended target and agree with the viewer's selection. Additional extension tools may provide part of this. | A two-tab workflow where the agent lists/selects a target, the person sees that target, and concurrent viewers cannot silently redirect another action. |
| Dock sizing and control-row composition | The dock has a fixed manifest size, and the host owns its title/control row and handback action. A compact expandable inspector would benefit from a supported resizing or layout pattern. | Agree on an extension layout that can expand a console or network panel while preserving visible, host-owned control arbitration. This is a layout question, not a requirement for raw CDP access. |
| Supported runtime behavior | The implementation uses a pinned SDK build and only the Linux web host has been exercised so far. | A reproducible install against a released host/SDK combination, followed by validation on every runtime and transport we advertise. |

Embedded DevTools and live dev-server discovery/grants are deferred product discussions. The maintainer has explicitly kept them outside the SDK for now. We will keep manual origin configuration and investigate an extension-owned console/network inspector through supported panel and service mechanisms. Neither is presented as an accepted upstream API request.

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

`service/main.js` and `panel/main.js` are the committed bundles used by Git installations. `artifacts/openchamber-server-browser-0.3.0.zip` contains the installable package. Rebuild both after changing source files.

The SDK dependency is a vendored package built from a pinned OpenChamber commit because the registry package does not yet expose these contracts. See [vendor/README.md](vendor/README.md) for its source and replacement plan.

## Validation

Initial validation used Linux with OpenChamber web host at `56f33fd59a3225c28be4ba25b91aae958d4374f5`, using an isolated data directory and a temporary local website. The OpenCode backend was a test fixture; no model or real chat session was used. For 0.2.0, validation used the unmodified web host at `959d179c6`, a real managed OpenCode process, two test project/chat contexts, and real Chrome. No model conversation was run.

The host routed all ten browser actions to real Chrome, saved a capture to the test project, rendered the shared panel, and preserved a form value across user/agent handoff. Manual panel checks covered clicking, typing keys, pasting, resizing, taking control, and handing control back. An unapproved loopback port was blocked. Disabling the extension stopped its service and Chrome processes.

The automated suite covers service authentication and protocol validation, private-address policy, cancellation, real Chrome actions and shared input, temporary-profile cleanup, context isolation, fail-closed unknown context, pinned viewing, stale frame cancellation, dock generation checks, and the four-scope bound. Chrome-dependent tests report a skip when Chrome is unavailable. Windows, macOS, Electron, private relay, and mobile have not been validated.

The 0.2.0 pre-push run passed 34 tests with no skips. Live host checks verified isolated cookies and storage across two scopes, same-page user/agent handoff, the host's 409 during human control, keyboard session switching, Enter-only navigation, back/forward, reload with a URL fragment, and invalid-URL recovery. Narrow and wide toolbar layouts were visually checked.

For 0.3.0, the final automated run passed 41 tests with no skips, including real Chrome, compatibility under restrictive page CSP, navigation/reload persistence, disabling without clearing form values, scope isolation, and control/generation guards. A separate regression repeatedly aborts CONNECT tunnels while upstream data is arriving. It reproduced the uncaught `EPIPE` before the socket fix and passed afterward. The fix closes the affected connection rather than terminating the service; it does not change origin permissions.

Live checks on the same unmodified `959d179c6` Linux web host covered Selenium's native select, selecting an option with the mouse, preserving form values when disabling compatibility, and opening/selecting a Radix custom dropdown. The original integrated build also reproduced the invisible native popup in a matched local comparison, so this is not reported as an SDK rendering regression. The final uninstrumented bundle completed the previously failing local-to-public navigation with the viewer connected, retained a second independent scope, and remained connected during an idle check longer than 40 seconds. Build, syntax, focused lint, and ZIP integrity checks passed. This is bounded functional evidence, not a long-running stability or cross-platform claim.

## Attribution

Adapted from OpenChamber under the MIT license. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
