# Pinned SDK build

Source: https://github.com/openchamber/openchamber/tree/56f33fd59a3225c28be4ba25b91aae958d4374f5/packages/sdk

Built with the upstream SDK build script and packed with bun pm pack. This package contains the #3734 provider and shared-surface contracts, which were not yet in the registry package named 1.24.2 when this extension was prepared. It is bundled into service/main.js; end users do not install dependencies. Replace this pin with a published SDK once that release includes these contracts.
