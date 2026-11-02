# Parity and roadmap

This extension is the extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734). It does not yet replace the original Server Browser implementation.

## Goal

The goal is functional parity with the Server Browser in PR #3425, built on OpenChamber's official extension APIs. The reference is [commit 362dbc3f305615200d762b721106c64e796b095b](https://github.com/JosueGalRe/openchamber/tree/362dbc3f305615200d762b721106c64e796b095b/packages/web/server/lib/browser). It is a feature reference, not a claim that every original runtime or platform was validated.

Parity means:
- The agent and the person work in the exact same server-owned browser target.
- Cookies, sign-ins, form values, and navigation state carry over across the handoff.
- The original's tab management, scoped sessions, debugging tools, local-server workflow, and interaction controls are all there.

Showing the same URL in a separate browser does not meet that goal. The original stays the functional reference until the gaps below are closed and tested.

## Gaps

| Area | Original Server Browser | This extension |
| --- | --- | --- |
| Chrome DevTools | Embedded Chrome DevTools with authenticated transport and frontend asset handling. | Chrome's bundled DevTools for the visible tab, through a token-guarded, policy-filtered relay. They are shown in place of the picture, with a screencast of the page beside them. One tab at a time; they close when another tab comes forward. Device mode is off. Performance recording passes the policy but is unverified. |
| Console and network inspection | Dedicated inspector with console capture, network rows, and request details. | DevTools, plus the Browser inspector page. It has console rows, network rows, request details, on-demand bodies, redaction, and a JavaScript prompt, for the visible tab while the page is open. |
| Tabs and popups | Tab listing, creation, switching, closing, and tracking targets opened by pages or CDP clients. | Page tabs for new tabs and popups, with create, switch, and close. Agents list tabs, name one with `tabId`, open background tabs, and close the tabs they opened. They cannot bring a tab to the viewer. |
| Project and chat isolation | Browser contexts scoped by directory and agent session, with separate cookies and storage. | One isolated runtime per authoritative project/chat pair, at most four, with idle expiry and least-recently-used replacement. Unknown context fails closed. The visible selection is shared by every viewer. |
| Browser controls | Navigation, tab, viewport, and inspection controls. | A dock for the viewer holding control. It has session tabs, Open for this chat, page tabs, the address field, history, reload or stop, the viewport picker, DevTools, native-select mode, and the page's errors and warnings. |
| Local-server access | Grants derived from live development-server discovery and checked against active destinations. | Manual `allowedOrigins` and `allowedNetworks`, applied on restart. Opt-in `discoverDevServers` covers live loopback listeners, excluded by process ownership because extensions do not receive the host's port list. No in-app origin editor. |
| Viewports | Coordination between the viewer, agent presets, and external DevTools emulation. | CSS-pixel sizing drawn at the viewer's pixel ratio, fit-panel and fixed modes, presets, custom sizes, rotation, mobile emulation, and agent/viewer authorship. DevTools' device mode is not available. |
| Context menus and clipboard | Page-menu handling, and selection reads through open shadow roots and same-origin frames. | A viewer menu inside the page for right clicks the page leaves alone, and DevTools' own menus. Plain-text copy reaches the viewer's clipboard from Ctrl/Cmd+C, the viewer menu, and DevTools. It reads through open shadow roots and same-origin frames, never from password fields. No rich clipboard formats. |
| Keyboard and pointer details | Dedicated editing-key and cross-platform shortcut handling. | Enter, editing and navigation keys, select-all, AltGr/Option characters, held-button dragging, and double and triple clicks. Full IME parity is unverified. With a host older than 2.6.0, punctuation reports the `keyCode` of its US key position. |
| Native popups | The original screencast showed the same invisible native `select` popup. | An opt-in, reversible scope mode renders single-choice options inside the page with `appearance: base-select`. Native menus stay invisible while it is off. |
| Chrome/CDP configuration | Managed Chrome discovery and CDP configuration integrated with the original host workflow. | Standard executable discovery or a manual `chromePath`. No CDP settings UI, no CDP endpoint for external MCP clients, and no attachment to an existing Chrome. |
| Runtime integration | Browser behavior integrated into OpenChamber's runtime contracts. | Exercised on Linux and macOS web hosts and on the macOS desktop app. Mobile and VS Code integration are not implemented. Windows and private relay are unverified. |

The panel displays image frames. It does not expose the remote page's DOM as local controls, and accessibility or responsiveness parity with the original viewer has not been established. No frame-rate equivalence is claimed. A frame at a 2x ratio carries four times the pixels: fine over loopback, heavier for a remote viewer on a slow link.

## Roadmap

Missing functionality is not automatically a limitation of the SDK. This table separates extension work, host/SDK questions, and validation:

| Work | Current assessment | Completion criteria |
| --- | --- | --- |
| Interaction details | Text entry, shortcuts, dragging, and multi-click selection are ported. IME behavior is unverified. | Verify IME composition and platform shortcuts on real pages through the shared panel. |
| Tab management and browser controls | Viewer-side tabs, popups, and controls are ported. Agents name tabs by id and close the ones they opened, but cannot bring a tab to the viewer. | Run a multi-tab workflow with a real model, not only direct tool calls. |
| Scoped viewing | Browser state is isolated per project/chat. Dock calls and input carry the viewer and the frame, so stale input cannot cross a scope, tab, or DevTools switch. The visible selection is shared. | Decide with upstream whether concurrent viewers need their own selection. |
| DevTools | Chrome's bundled DevTools, through the relay and its policy, at the viewer's pixel ratio, with their own menus and clipboard. | Follow tab switches, verify Performance recording and remote viewers, and run them on Linux and Windows. |
| Local-server workflow | Opt-in discovery allows live loopback listeners and drops them when they stop. It excludes by process because extensions do not receive the host's port list. | Adopt authoritative host discovery or scoped grants if upstream offers them. |
| Session lifecycle | Idle expiry, least-recently-used replacement, and crash recovery are implemented, and actions give up before the host's time limit. | Define restart behavior, and test that failed or stale work cannot affect another session or revive a stopped service. |
| Runtime and release support | A validation and integration task, not a promise of automatic SDK compatibility. | Verify each supported runtime and transport, test a real agent workflow, and publish an explicit support matrix. |

## What we still need from the SDK

This assessment is based on the [service contracts in OpenChamber 2.6.0](https://github.com/openchamber/openchamber/blob/v2.6.0/packages/sdk/GUEST_SERVICES.md). The SDK already provides:
- unattended browser-provider actions;
- authoritative project/chat context;
- a shared image/input viewer with host-owned control;
- a dock that sets its own height;
- tab ids on every browser action, and closing the tabs an agent opened;
- the identity and last frame of the viewer behind each dock call and input batch;
- the viewer's `keyCode` on key events;
- host clipboard writes from guest pages.

There are no confirmed contract gaps for parity in the workflows mapped so far.

The maintainers kept embedded DevTools and development-server discovery/grants out of the SDK ([maintainer response](https://github.com/openchamber/openchamber/pull/3425#issuecomment-5752977364)). DevTools here need no SDK change: their frontend runs in the server's Chrome and reaches the viewer through the existing surface. Discovery is an opt-in in the service.

Open questions for upstream:

| Need | What needs clarification or support | Evidence that would close the question |
| --- | --- | --- |
| Supported runtime behavior | The extension uses the released SDK 2.6.0. Linux and macOS web hosts and the macOS desktop app have been exercised. | Validation on every runtime and transport we advertise. |
| The tab an action without `tabId` uses | Since 2.5.0, the tool tells agents that such an action uses the tab they last used, else the user's open tab. The provider contract still says the tab the user sees. This extension follows the tool. | Upstream aligns the provider contract with the tool. |

Chrome target tracking, browser actions, input handling, clipboard behavior, proxy cleanup, and regression tests belong in the extension. Before any upstream request, prepare:
- the user workflow;
- the contract that prevents it;
- a minimal reproduction;
- the smallest proposed capability.
