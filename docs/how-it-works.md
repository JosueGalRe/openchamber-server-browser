# How it works

The details behind the [README](../README.md): what agents can do, how browsers are scoped, and what each part of the panel does.

## One browser, shared

The extension provides OpenChamber's browser provider and a shared surface. Its service starts on the first browser action, even with no panel open. Opening the panel alone does not start a browser. Each browser belongs to a project/chat pair: the dock offers **Open for this chat** for the chat you are viewing, and otherwise the chat's first agent action starts it.

OpenChamber owns the control handoff. Your first click, key, wheel, or paste in the picture takes control and also reaches the page. While you hold control, OpenChamber refuses the agent's browser actions; **Hand back to agent** releases it. The "Click or type to take control" line and that button belong to OpenChamber's panel, not to this extension.

OpenCode 2 also gives agents its own `browser.*` tools, such as `browser.tabs.open`, for its desktop app. Those calls never reach this extension and fail with `browser.disconnected` on a web host.

## Agent actions

The provider implements `browser.open`, `snapshot`, `click`, `type`, `select`, `scroll`, `back`, `forward`, `inspect`, `capture`, `resize`, and `close`.

- **Tabs.** `browser.snapshot` lists the chat's tabs with ids, and every action accepts a `tabId` from that list. Without one, an action uses:
  1. the tab the agent last used;
  2. otherwise the newest tab it opened, if that one closed;
  3. otherwise the tab selected in the dock.

  An id this browser did not issue is refused rather than applied to another tab.
- **Opening a tab.** `browser.open` without a `tabId` opens a background tab, unless the visible tab is still blank, and returns that tab's id.
- **Closing a tab.** `browser.close` closes a tab the agent opened, its most recent one without a `tabId`, and refuses tabs the viewer or a page opened.
- **Settling.** `browser.open` reports `settled: true` only once the page has loaded and then gone quiet: no new resource and no DOM tree or text change for 500 ms, waiting at most 5 seconds. `browser.capture` waits the same way for at most 3 seconds.
- **Native selects.** `browser.snapshot` lists each native select's options, up to 32, and a `selector` scopes its text as well as its elements. `browser.select` picks one option of a native single-value select by exact label or value. It refuses ambiguous, disabled, multiple, and custom controls without changing the page.
- **Captures** are one pixel per CSS pixel of the viewport, whatever pixel ratio the panel draws at.
- **Background tabs.** Acting on a background tab does not change what the viewer sees.
- **Time limits.** OpenChamber replaces a service that misses an action's time limit, and every chat's browser would go with it. So an action the page does not finish in time fails a little earlier instead, after 18 seconds, or 43 for `browser.open`, with "The page did not respond in time".

## Scopes and lifetime

Each authoritative `{ directory, sessionId }` pair gets its own Chrome process and temporary profile, with its own cookies, storage, form state, and history. Calls missing either field fail closed instead of reusing another chat's browser.

- **At most four scopes.** At the limit, the scope unused for longest makes room once it has been idle for a minute. If every scope was active in the last minute, the new chat's action fails with an explanation.
- **Idle expiry.** A scope closes after five minutes without agent actions, dock commands, input, or a viewer showing it. That removes its profile and sign-ins.
- **Crashes.** If Chrome exits unexpectedly, the dock says so and the chat's next action starts a new browser.
- **Stopping.** Stopping or restarting the service stops every Chrome first and then removes its profiles, within the five seconds OpenChamber waits before killing the service. OpenChamber stops an unattended browser provider after ten minutes without actions; an open panel keeps it running.
- **Nothing persists.** There is no session restore or persistent profile. State survives a live handoff, not idle expiry or a restart.

The first scope becomes visible automatically, and when the visible scope closes, expires, or crashes, the one used most recently takes its place. After that, the dock follows the chat you open in OpenChamber when that chat has a browser, and its session picker, shown once there are two or more, picks any live scope. Agent work in another chat continues in that chat's browser without moving the viewer.

## The panel

The dock above the picture holds:
- a session picker and **Open for this chat**;
- page tabs;
- the address field, back, forward, and reload or stop;
- the console problem count;
- the DevTools button;
- a viewport picker with rotation and mobile emulation;
- the native-select mode;
- on touch screens, a keyboard button for typing into the page.

**Narrow panels and phones.** In a panel narrower than 560 px, the address gets a line of its own and the viewport, DevTools, and native-select controls move under it. Under a touch pointer the controls grow to touch size, and the address keeps 16 px text so iOS does not zoom in. The dock asks OpenChamber for the height its rows take, plus the error list while it is open.

**Typing from a phone.** The picture cannot open a phone's keyboard, so under a touch pointer the dock has a keyboard button. Once you hold control (the tap on the page's field takes it), the button opens the keyboard on a hidden field of the dock and types into the page what you type there: text as text, the keyboard's deletions and autocorrections as Backspaces, and line breaks as Enter. It is refused for any other viewer, and handing control back closes it.

**Fields on a phone.** The address and the custom size fields are text fields with the URL and number keyboards, because Chrome on Android ignores `enterkeyhint` on URL and number fields and offers Next instead of Go. The click or tap that focuses the address selects it, as in a browser.

From OpenChamber 2.7.1 the phone shows the panel, with the picture, as a workspace tab, and the Browser inspector under **More** in the sessions list. The manifest opts both in with `panel.mobile` and `page.mobile`; older hosts ignore the keys.

**Who can use the dock.** The viewer holding control can use the dock while other viewers' docks wait.

**Stale input is refused.** Every dock command and input batch carries the frame it was made on. One made on a picture of an earlier view (another scope, tab, or DevTools state) is refused instead of landing in the new one.

**Typed addresses.** An address typed without a scheme opens over HTTP when it is an IP address or `localhost`, and over HTTPS otherwise.

- **Tabs and popups.** Links that open a new tab, and `window.open` popups, become page tabs.
  - You can open, switch, and close them; closing a popup returns to the tab that opened it.
  - Titles, loading state, and history update live, and **Stop** interrupts a slow load.
  - Every tab the extension opens gets its own Chrome window, so a background tab keeps painting and the agent can capture it. A tab a page opens from a link shares its opener's window, as in Chrome.
- **Sizes and sharpness.** Pages are sized in CSS pixels and drawn at your display's pixel ratio, rounded to a whole number from 1 to 3 (Chrome takes no other), so text stays sharp on high-density displays without changing the page's layout.
  - **Fit panel** follows the panel.
  - A preset (mobile, tablet, desktop), a custom size, rotation, or mobile emulation fixes the size until someone picks another, and OpenChamber letterboxes it.
  - The picker says when the agent chose the current size.
  - Drawing at the display's ratio needs a Chrome that can emulate its headless screen (`Emulation.updateScreen`); an older one stays at 1x. Pages then see your `devicePixelRatio`, while their `screen` size and layout stay the same.
- **Keyboard and pointer.**
  - Text entry works with Enter, editing and navigation keys, select-all, and AltGr/Option characters.
  - Pages see the `keyCode` your browser computed for your layout on OpenChamber 2.6.0 and later, and the US key position's code before that.
  - Dragging selects text and moves sliders.
  - Double and triple clicks select a word and a line; the service counts quick presses itself because hosts send no click count.
- **Clipboard.** Ctrl/Cmd+C copies the page selection, including inside open shadow roots and same-origin frames, but never a password field. Pasting types the pasted text.
- **Context menu.** A right click the page does not handle opens a viewer menu drawn inside the page, with Back, Forward, Reload, and Copy. Copy puts the selection on your clipboard. Where OpenChamber cannot write the clipboard (its window must have focus, and some browsers also want a recent click), a notification offers a Copy button instead.

## Chrome DevTools

The `</>` button opens Chrome's own DevTools for the visible tab in place of the picture; pressing it again shows the page.

- **Frontend.** It is the one bundled with the Chrome running the page, so it always matches its protocol. That needs a full Chrome or Chromium build rather than `chrome-headless-shell`.
- **Screencast pane.** DevTools show a live screencast of the page beside their panels, where the element picker and highlights appear and where you can click and type into the page. Hide that pane with DevTools' screencast toggle when the panel is narrow.
- **Look.** DevTools follow OpenChamber's light or dark theme and render at your display's pixel ratio. They draw their own context menus, because headless Chrome shows no native ones.
- **Copying.** What they copy (Copy element, Copy as cURL, a selected node with Cmd/Ctrl+C) goes to your clipboard like the page menu's Copy.
- **One tab at a time.** DevTools inspect one tab at a time and close when another tab comes forward or theirs closes. Closing them, like closing Chrome's, drops their console and network history.
- **No device mode.** The dock's viewport picker owns the page's size.

[Security](security.md) describes how DevTools reach the page.

## Browser inspector and page problems

**Browser inspector**, under **Extension pages** in OpenChamber's sidebar, captures the visible tab's console messages and network requests while it is open:
- up to 300 console rows, 200 requests, and 2 MiB;
- request details, and bodies up to 8,000 characters on demand;
- `[REDACTED]` in place of query parameters, headers, and JSON or form fields with credential-like names;
- a prompt that runs JavaScript in the page.

The dock's error and warning count opens a list of the visible tab's latest 50 errors and warnings under the address bar, growing the dock while it is open. The count and list start over when the page loads a new document.

## Work Status

From OpenChamber 2.5.2, a chat's **Work Status** panel has a Server Browser section. OpenChamber draws it from what the service reports every five seconds:
- **Chrome**: the memory of every server browser, across all projects, with a chart of the last half hour.
- **One line per browser in the project**:
  - the visible tab's title;
  - a dot: amber while the agent works, the accent color while you hold control, green when idle;
  - the page's error or warning count;
  - its memory, when there is more than one browser;
  - a tooltip with the address, tab count, and chat.
- **Close**: stops that browser after a second, confirming click, even in the middle of an agent action, which then fails. Its tabs, cookies, and sign-ins go with it.

How it behaves:
- **Project, not chat.** OpenChamber tells the section which project the chat is in, not which chat, so the section lists every browser in the project.
- **Memory.** Resident sizes would count the Chromium code that all of Chrome's processes share once per process, about three times the real figure.
  - On macOS the service reads the physical footprint Activity Monitor shows, with `top`. That costs about half a second of CPU, so it samples every 30 seconds, and again when a browser opens or closes.
  - On Linux it reads each process's proportional size from `/proc`, which needs kernel 4.14 or newer.
  - Elsewhere the Chrome line is left out.
- **Lifetimes.** Reading the section never keeps a browser alive: browsers still close after five minutes unused. A read does start the service process when it is not running, without starting Chrome, and that process stays up while Work Status is on screen.
- **Older hosts.** OpenChamber 2.0.1 to 2.5.1 cannot draw the section and show a one-line note in its place.

## Native select menus

Chrome draws a native `<select>` popup outside the page, where the panel cannot show it. After handing control back, the last toolbar button, "Show native select menus in the shared browser", applies Chromium's `appearance: base-select` for the selected scope, so single-choice selects open inside the page.

- **Lifetime.** It is off by default and does not persist across a service restart.
- **Turning it off** removes only the extension's inspector styles, without reloading the page or clearing form state. Using inspector styles also means page CSP does not need to be bypassed.
- **What it covers.** Only `<select>` without `multiple`, and with no `size` or `size="1"`. Not custom menus such as Radix components.
- **Requirements.** A Chrome that supports `appearance: base-select`. It does not reach shadow roots or out-of-process frames.
- **Side effects.** It can change a site's select rendering: one Bootstrap control grew taller and showed two arrows. That is why the extension never turns it on by itself.
