# Configuration

Configuration lives in `config.json` in the extension's installed folder. When the shared browser blocks an address, the page it shows gives that file's exact path. Copy `config.example.json` to start.

- **Restart after editing.** Changes apply when the extension restarts.
- **Back it up.** The file is excluded from Git and from the package, so keep a copy before reinstalling or updating.
- **Folder installs.** For a folder installation, clone this repository, configure it, and install its absolute path through OpenChamber's extension settings.

## Local development servers

Private and loopback destinations are blocked unless you allow them. List the exact origins you need:

```json
{
  "allowedOrigins": [
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]
}
```

Origin grants work as follows:
- They distinguish HTTP from HTTPS and include WebSocket traffic on the same host and port.
- They match the host name in the address, not what it resolves to. A domain that resolves or rebinds to a granted address cannot reach it, and an alias such as `myapp.test` needs its own entry.
- `localhost` also uses the grants for `127.0.0.1` and `[::1]`, because the service resolves it itself.
- A page that loads assets from, or calls, another private origin needs that origin allowed too.

`localhost` means the machine running the extension, so an SSH-forwarded port must be reachable there.

## Private networks

For several machines or many ports, list a private IPv4 block in `allowedNetworks` with the ports it may use:

```json
{
  "allowedNetworks": [
    { "cidr": "192.168.1.0/24", "ports": [3000, "5173-5199", 8080] }
  ]
}
```

- Ports are required, and a `"first-last"` string covers a range.
- A block applies to HTTP, HTTPS, and WebSocket traffic.
- A block must be private or loopback, and no broader than /8.

A block matches the address a name resolves to. So it also allows any domain that resolves into it on a listed port, including one a page rebinds there. Keep blocks and port lists narrow, and list loopback servers in `allowedOrigins` rather than as a loopback block.

## Discovering development servers

To reach development servers without listing them, set `"discoverDevServers": true`. The service then allows loopback ports with a live listener, over IPv4 and IPv6. It checks again at most every three seconds, so a server that stops loses access.

- **Platforms.** Discovery needs Linux, which uses `lsof` when installed and `/proc` otherwise, or macOS with `lsof`. On other systems it allows nothing.
- **Names.** `localhost` uses whichever loopback family the server listens on. Discovery grants only `127.0.0.1`, `[::1]`, and `localhost`, so another name that resolves to loopback stays blocked.
- **Never granted.** Ports held by OpenChamber itself, by its other child processes such as OpenCode and other extension services, or by this extension and its Chrome. Discovery allows nothing when it cannot tell which process owns a port.
- **Always skipped.** SSH, DNS, SMB, printing, common database ports, and the Node.js inspector port.
- **Everything else becomes reachable.** Every other loopback listener on the machine can be reached from pages in the shared browser, including databases on other ports, a second OpenChamber or OpenCode, and other browsers' debugging ports. Keep discovery off where that matters.

## Addresses that stay blocked

Link-local, cloud metadata, CGNAT, IPv6 transition, and reserved ranges stay blocked even when listed.

A blocked plain-HTTP address opens a page that:
- names the origin;
- gives the path of `config.json` and the entry to add;
- for a loopback address, says whether discovery is off or found no eligible server.

HTTPS navigations to a blocked address end in Chrome's own `ERR_TUNNEL_CONNECTION_FAILED`.

## Chrome

The service looks for Chrome or Chromium 109 or newer in standard locations. If it finds none, or picks the wrong one, set the path:

```json
{
  "chromePath": "/absolute/path/to/chromium"
}
```

Use a full Chrome or Chromium build. `chrome-headless-shell` lacks the DevTools frontend.
