# Pinned SDK build

Source: https://github.com/openchamber/openchamber/tree/959d179c6aa06af6d8102461c8fea166e0433445/packages/sdk

Built with the upstream SDK build script and packed with `bun pm pack`. This snapshot adds authoritative browser-provider context and docked panel controls beside a shared surface. No released OpenChamber version contained those contracts when version 0.2.0 was prepared, so the extension does not declare a guessed host-version floor. The package is bundled into `service/main.js` and `panel/main.js`; end users do not install dependencies. Replace this pin and restore `openchamber.engines.openchamber` after a compatible release is verified.
