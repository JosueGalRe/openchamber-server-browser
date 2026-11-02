# Security

What the extension isolates, what it trusts, and how Chrome DevTools reach a page.

## The service

The service uses OpenChamber's authenticated loopback protocol.

- **It runs as the host user.** The host's service approval and declared executable names describe intent; they are not an operating-system sandbox.
- **Egress policy.** Every scope's browser traffic goes through the service's egress policy (see [Configuration](configuration.md)).
- **Local-origin grants** belong to the installation, not to a project or chat. They apply until configuration changes and the service restarts.

## Scopes and viewers

Each project/chat pair gets its own Chrome process and temporary profile. Agent calls without both fields fail closed instead of reusing another chat's browser.

The visible scope is one selection shared by every viewer. It is a convenience view, not an authorization boundary between mutually untrusted viewers. Only the viewer holding control can use the dock, and input or a dock command made on a picture of an earlier view is refused.

## Chrome DevTools

DevTools never get raw access to Chrome. The frontend runs in a browser context of its own and reaches the inspected tab only through a relay in the service.

**The relay:**
- listens on a random loopback port;
- accepts only the frontend's `devtools://devtools` origin, with a 32-byte token that is new each time DevTools open;
- caps messages and buffering at 64 MiB.

**The relay's policy:**
- **Passes:** the page's own protocol domains and the targets the page owns.
- **Refuses:**
  - the `Browser` domain, other targets, and stream handles it did not hand out;
  - downloads, file uploads and drops from the server's disk, and device-metrics overrides.
- **Drops the connection:** on navigation to anything but http(s) or `about:blank`.
- **Binds:** cookie commands to the scope's context.

**The frontend itself:**
- its own traffic goes through the scope's egress policy, apart from the relay port;
- pages it tries to open are closed;
- what it copies goes to the service, which hands it to the viewer's clipboard instead of the server's.

## Development-server discovery

Discovery trusts process ownership, not intent. With it on, any page the agent or a person opens can send requests to every eligible loopback listener. Discovery runs `lsof`, and `ps` on macOS; both are declared in the manifest. It never widens access beyond loopback.

## How Chrome presents itself

Chrome runs headless but presents itself as regular Chrome, because Google refuses sign-in from a browser that says it is automated.

- **User-Agent.** It names `Chrome` instead of `HeadlessChrome`, with the major version that `chrome --version` reports. On Windows the version comes from `chrome.exe`'s version resource. If neither gives a version, Chrome keeps its `HeadlessChrome` User-Agent.
- **Automation flag.** `navigator.webdriver` is false.
- **Pixel ratio.** While a viewer is attached, pages see the viewer's `devicePixelRatio`, as on that viewer's own display.

Pages therefore cannot tell from those signals that an agent may be driving the browser.
