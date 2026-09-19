# Server Browser for OpenChamber

Run Chrome on the OpenChamber server. Agents use the standard `browser.*` tools, and you can open the Server Browser panel to see and control the same page, including its current form values, cookies, and navigation state.

This is the extension extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734).

## Status and goal

**Experimental. This extension does not yet replace the original Server Browser implementation.** Version 0.1.0 delivers the shared browser and agent/user handoff, with substantial gaps in debugging, tab management, and session isolation.

The goal is functional parity with the Server Browser in PR #3425 through OpenChamber's official extension APIs. The reference for this extraction is [commit 362dbc3f305615200d762b721106c64e796b095b](https://github.com/JosueGalRe/openchamber/tree/362dbc3f305615200d762b721106c64e796b095b/packages/web/server/lib/browser). It is a feature reference, not a claim that every original runtime or platform was validated.

Parity means the agent and person can work in the exact same server-owned browser target, preserving cookies, authentication, form values, and navigation state during handoff. It also means recovering the original tab management, scoped sessions, debugging tools, local-server workflow, and interaction controls. Showing the same URL in a separate browser does not meet that goal.

The original implementation remains the functional reference until those gaps are closed and tested. The roadmap below describes intended work, not shipped features or a release-date commitment.

## Requirements

- An OpenChamber build containing #3734. The version string `1.24.2` alone does not establish compatibility because the SDK published under that version predates these contracts.
- Chrome or Chromium 109 or newer installed on the machine running OpenChamber.
- A supported host service runtime. Development uses Node.js 22 or newer and Bun for installing locked dependencies.

The extension includes its built service. Installing it in OpenChamber does not require installing this repository's development dependencies.

## Install

1. Open OpenChamber's extension settings and install from `https://github.com/JosueGalRe/openchamber-server-browser`.
2. Review and approve its service permission. The service launches Chrome on the OpenChamber host.
3. Select **Server Browser** under **Settings → General → OpenChamber Tools → Browser provider**.
4. Ask the agent to open a page. Open **Server Browser** from the panel rail to view that same page.

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

OpenChamber owns the control handoff. A person can take over the page, the host refuses agent actions while that person holds control, and the agent can continue after control is released. This same-page workflow has been tested through the host and its panel.

## Known limitations and parity gaps

| Area | Original Server Browser reference | Extension 0.1.0 |
| --- | --- | --- |
| Chrome DevTools | Embedded Chrome DevTools with authenticated transport and frontend asset handling. | No embedded DevTools. `browser.inspect` returns element details; it does not replace DevTools. |
| Console and network inspection | Dedicated inspector with console capture, network rows, and request details. | Bounded console warnings/errors in snapshots. No interactive console, network inspector, or request-detail panel. |
| Tabs and popups | Tab listing, creation, switching, closing, and tracking targets opened by pages or CDP clients. | One controlled target. No tab manager or selection/routing for new windows and popups. A workflow that opens another target may become inaccessible through the extension. |
| Project and chat isolation | Browser contexts scoped by directory and agent session, with separate cookies/storage. | One shared context per extension service. No project/chat isolation or independent agent session ownership. |
| Browser controls | Browser-specific navigation, tab, viewport, and inspection controls. | Generic SDK shared panel. Navigation actions exist for the agent, but the original browser toolbar and tab UI have not been migrated. |
| Local-server access | Grants derived from live development-server discovery and checked against active destinations. | Manual `allowedOrigins` in `config.json`, applied on restart. No live discovery, automatic revocation when a dev server stops, or in-app origin editor. |
| Viewports | Coordination between the viewer, agent presets, and external DevTools emulation. | Agent presets and panel resizing work. The original viewport coordination and DevTools emulation behavior have not been ported. |
| Context menus and clipboard | Page-menu handling and selection reads through open shadow roots and same-origin frames. | Basic input and plain-text copy/paste. Selection reads the top document or its focused input; it does not traverse frames or shadow roots. No original viewer context menu or rich clipboard support. |
| Keyboard and pointer details | Dedicated editing-key and cross-platform shortcut handling. | Basic keys, pointer input, wheel, and pasted text. Full shortcut/IME parity is unverified; pointer events currently use a single-click count, without dedicated double-click handling. |
| Chrome/CDP configuration | Managed Chrome discovery and CDP configuration integrated with the original host workflow. | Standard executable discovery or a manual `chromePath`. No migrated CDP settings UI or supported attachment to an arbitrary existing Chrome session. |
| Runtime integration | Browser behavior integrated into OpenChamber's runtime contracts. | Linux web-host path validated. Mobile and VS Code integration have not been implemented. Electron, Windows/macOS, and private relay remain unverified. |

### Shared state and lifetime

Everyone authorized to use this OpenChamber instance can share the extension's browser. Two chats or projects can therefore navigate or change the same page. The user/agent control handoff prevents conflicting user input; it does not create separate sessions for different agents or users. This extension is not an isolation boundary between mutually untrusted users.

Chrome uses a temporary profile. Stopping or restarting the service closes Chrome and removes its profile, including cookies and login state. OpenChamber stops an unattended browser provider after ten minutes without actions; an open shared panel keeps it running. The next start creates a fresh browser. There is no session restore or persistent-profile option. Preserving state during a live handoff is supported; preserving it across process restarts is not. The original implementation also used temporary Chrome profiles, so durable profiles are not presented here as an existing original feature.

### Configuration and security boundaries

The local-origin list belongs to the extension installation, not to a project or chat. It remains in effect until configuration changes and the service restarts. Local configuration is not bundled and should be backed up before updating or reinstalling. Reserved and metadata address restrictions still apply even to listed destinations, as described above.

The service uses OpenChamber's authenticated loopback protocol and applies browser egress checks. The host's service approval and declared executable names describe permission intent; they do not provide an operating-system sandbox. The service runs with the host user's access.

### Compatibility and validation limits

The extension requires the browser-provider and shared-surface contracts from #3734. The initial build vendors an official SDK snapshot because the published package inspected during development lacked those exports. That pin needs to be replaced with a compatible published SDK and a verified host version requirement. The manifest's version floor alone does not prove that a host contains the required contracts.

The shared panel displays image frames. It does not expose the remote page's DOM as local controls, and accessibility or responsiveness parity with the original viewer has not been established. No performance or frame-rate equivalence is claimed.

Automated checks and manual host tests do not establish compatibility with every website, login popup, platform, transport, or concurrent workflow. The exact validation scope is recorded below.

## Roadmap to parity

Missing functionality is not automatically a limitation of the SDK. The table separates extension implementation, host/SDK design questions, and validation work:

| Work | Current assessment | Completion criteria |
| --- | --- | --- |
| Recover interaction details | Primarily extension implementation work. | Port selection traversal, editing keys, click behavior, and clipboard handling; verify them on real pages through the shared panel. |
| Recover tab management and browser controls | Chrome target management can live in the service. User controls and agent target selection need a design compatible with the host contracts. | Create, list, select, and close tabs; track popups; route agent and user input to the intended target without losing state. |
| Restore project/chat isolation | The current provider request carries `requestId`, `action`, and `parameters`, without authoritative project/chat identity. The shared surface is also one session per service. This needs host/SDK contract work or a supported alternative. | Route both agent actions and viewers to the same scoped context, with isolation tests for cookies, storage, permissions, and concurrent sessions. Do not infer identity from the last visible project. |
| Restore the inspector and embedded DevTools | Not implemented. The image/input surface does not itself provide a DevTools frontend, asset proxy, or CDP transport. Evaluate supported extension UI/service mechanisms before claiming a new SDK API is required. | Inspect the same selected target, with authenticated assets and transport, bounded buffering, proper cleanup, and no raw debugger exposure to viewers. |
| Restore the local-server workflow | Manual grants work. Access to authoritative host discovery and scoped authorization needs investigation. | Discover eligible live dev servers, handle stopped/replaced listeners, and keep private destinations blocked without a valid grant. |
| Match session lifecycle behavior | Cleanup is implemented; original scoping and recovery behavior are not fully migrated. | Define idle, disconnect, crash, and restart behavior; test that failed or stale work cannot affect another session or revive a stopped service. |
| Establish runtime and release support | A validation and integration task, not a promise of automatic SDK compatibility. | Verify each supported runtime and transport, test a real agent workflow, use a compatible released SDK, and publish an explicit support matrix. |

The next implementation work should recover capabilities that fit the existing contracts and produce small reproductions for any remaining host blockers. Those findings can then be discussed upstream with concrete requests. We should call this a replacement for the original only after the parity gaps have been closed or explicitly documented as agreed differences, with evidence from the actual user flows.

## What we still need from the SDK

This assessment is based on the [official service contracts at the pinned host commit](https://github.com/openchamber/openchamber/blob/56f33fd59a3225c28be4ba25b91aae958d4374f5/packages/sdk/GUEST_SERVICES.md). It records what this migration needs, not a claim that newer SDK versions cannot address it. These are discussion points for upstream, not agreed API changes.

The SDK already provides the two foundations requested during the original discussion: unattended browser-provider actions and a shared image/input panel with host-owned user/agent control. We do not need to request those again.

### Confirmed contract gaps for parity

| Need | Current contract | What would let us complete the migration |
| --- | --- | --- |
| Authoritative project/chat scope | `/browser-control` carries `requestId`, `action`, and `parameters`. It does not identify the originating project or chat. A request id identifies an action, not a persistent browser session. | A host-issued scope identity on provider actions, with defined behavior for actions outside a chat. The same scope must be available when attaching a viewer, so the person and agent select the same isolated Chrome context. |
| Scoped viewing and control | The shared surface has one session and controller per extension service. It cannot distinguish our proposed independent project/chat browser contexts. | A supported way to address scoped surface sessions and bind control, frames, input, and cleanup to that identity. Multiple OS processes are not required; the needed guarantee is unambiguous routing and isolation. |
| Browser UI alongside the shared surface | `service.surface: true` excludes `panel.entry`; the host renders the generic canvas. The extension cannot put its original toolbar or tab strip in that panel through `panel.entry`. | A supported composition mechanism for browser controls around or beside the shared surface, or another documented extension UI pattern that preserves the same target and host control authority. |

### Capabilities to investigate with upstream

These requirements are concrete, but we have not established that each requires a new API. Existing extension mechanisms should be evaluated first.

| Need | What needs clarification or support | Evidence that would close the question |
| --- | --- | --- |
| Agent tab selection | The ten browser actions do not define a tab-management contract. We need a supported way for agent requests to identify the intended target and agree with the viewer's selection. Additional extension tools may provide part of this. | A two-tab workflow where the agent lists/selects a target, the person sees that target, and concurrent viewers cannot silently redirect another action. |
| Embedded DevTools and live inspection | The shared surface transports images and input. `serviceRequest` is request/response, not a general CDP stream. We need a supported way to host the DevTools frontend and assets and carry authenticated, target-scoped bidirectional messages with cancellation and backpressure. | A small extension demonstration that inspects its own Chrome target through the host, including disconnect, permission revocation, and supported remote transports. If existing mechanisms cannot do this, use that reproduction to propose a transport/UI extension. |
| Live local-server discovery and grants | Static configuration does not reproduce the original host's live dev-server discovery or session-scoped authorization. We need to establish whether extensions can consume those authoritative host capabilities through a supported API. | A workflow that discovers an eligible listener, grants access only to its scope, and revokes access when it stops or approval is withdrawn. Reading internal files or calling undocumented host endpoints is not the intended integration. |
| Supported SDK release and runtime behavior | The initial implementation uses a pinned SDK build. Compatible published exports, a reliable minimum host version, and the supported runtime/transport matrix need confirmation. | A reproducible install against a released host/SDK combination, followed by validation on each runtime and transport we advertise. This is a release/compatibility requirement, not a request for a new browser feature. |

### Work that remains ours

Chrome target tracking, browser actions, selection traversal, editing-key handling, clipboard improvements, proxy cleanup, and regression tests belong in the extension. A missing implementation is not evidence that the SDK needs to change. Persistent profiles are also a separate product decision, not a prerequisite for reproducing the original temporary-profile behavior.

For any upstream API request, first provide the user workflow, the current contract that prevents it, a minimal reproduction, and the smallest proposed capability. Prioritize shared scope identity and viewer routing because they determine whether subsequent tabs, permissions, and DevTools attach to the correct browser session.

## Build and test

```sh
bun install --frozen-lockfile
bun run build
bun run test
bun run check
bun run package
```

`service/main.js` is the committed, bundled service used by Git installations. `artifacts/openchamber-server-browser-0.1.0.zip` contains the installable package. Rebuild the service after changing source files.

The SDK dependency is a vendored package built from a pinned OpenChamber commit because the registry package does not yet expose these contracts. See [vendor/README.md](vendor/README.md) for its source and replacement plan.

## Validation

Initial validation used Linux with OpenChamber web host at `56f33fd59a3225c28be4ba25b91aae958d4374f5`, using an isolated data directory and a temporary local website. The OpenCode backend was a test fixture; no model or real chat session was used.

The host routed all ten browser actions to real Chrome, saved a capture to the test project, rendered the shared panel, and preserved a form value across user/agent handoff. Manual panel checks covered clicking, typing keys, pasting, resizing, taking control, and handing control back. An unapproved loopback port was blocked. Disabling the extension stopped its service and Chrome processes.

The automated suite covers service authentication and protocol validation, private-address policy, cancellation, real Chrome actions and shared input, and temporary-profile cleanup. Chrome-dependent tests report a skip when Chrome is unavailable. Windows, macOS, Electron, private relay, and mobile have not been validated.

## Attribution

Adapted from OpenChamber under the MIT license. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
