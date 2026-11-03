import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

// Hosts from OpenChamber 2.5.2 draw the Work Status section from the service's
// `/status` answers and never load this page. Older hosts need an entry for the
// manifest to parse, and get this note in the host's theme.
const host = connectHost();
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  // A narrow panel wraps the note onto a second line.
  new ResizeObserver(() => {
    void host.setHeight(Math.ceil(document.body.getBoundingClientRect().height)).catch(() => {});
  }).observe(document.body);
});
