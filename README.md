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
