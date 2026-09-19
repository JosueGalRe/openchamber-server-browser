# Server Browser for OpenChamber

Run Chrome on the OpenChamber server. Agents use the standard `browser.*` tools, and you can open the Server Browser panel to see and control the same page, including its current form values, cookies, and navigation state.

This is the extension extraction of [OpenChamber PR #3425](https://github.com/openchamber/openchamber/pull/3425). It uses the browser-provider and shared-surface contracts added in [#3734](https://github.com/openchamber/openchamber/pull/3734).

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

## Scope

The provider implements `browser.open`, `snapshot`, `click`, `type`, `scroll`, `back`, `forward`, `inspect`, `capture`, and `resize`. The shared panel sends pointer, keyboard, wheel, text, and resize events to the same browser target.

There is one shared browser target per extension service. The current SDK does not provide project or chat identity in browser-provider requests, so this extension does not promise isolated sessions per project or chat. Everyone authorized to use this OpenChamber instance can share the extension's browser. Do not use it as a boundary between mutually untrusted users.

Chrome uses a temporary profile. Stopping the service closes Chrome and removes that profile. OpenChamber stops an unattended browser provider after ten minutes without actions; an open shared panel keeps it running. Cookies and page state survive handoffs while the process is running, but not a service restart.

This first extraction does not include the original PR's embedded Chrome DevTools, multiple tabs, or mobile/VS Code integration. It uses the host's shared panel rather than adding a separate viewer UI.

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

Validated on Linux with a current OpenChamber web host at `56f33fd59a3225c28be4ba25b91aae958d4374f5`, using an isolated data directory and a temporary local website. The OpenCode backend was a test fixture; no model or real chat session was used.

The host routed all ten browser actions to real Chrome, saved a capture to the test project, rendered the shared panel, and preserved a form value across user/agent handoff. Manual panel checks covered clicking, typing keys, pasting, resizing, taking control, and handing control back. An unapproved loopback port was blocked. Disabling the extension stopped its service and Chrome processes.

The automated suite covers service authentication and protocol validation, private-address policy, cancellation, real Chrome actions and shared input, and temporary-profile cleanup. Chrome-dependent tests report a skip when Chrome is unavailable. Windows, macOS, Electron, private relay, and mobile have not been validated.

## Attribution

Adapted from OpenChamber under the MIT license. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
