# Changelog

## [1.1.1](https://github.com/buremba/1mcp/compare/v1.1.0...v1.1.1) (2025-11-23)


### Bug Fixes

* Prevent Prism auto-highlighting conflicts in Features section, enhance FAQ hash-based scrolling to react to URL changes, and correct a typo. ([a2a9ce4](https://github.com/buremba/1mcp/commit/a2a9ce48928a96c9e14f3c62692519decd394dd0))

## [1.1.0](https://github.com/buremba/1mcp/compare/v1.0.0...v1.1.0) (2025-11-22)


### Features

* add new calculator tools to the AI SDK example and refactor React fragment to span in docs component. ([6d186c2](https://github.com/buremba/1mcp/commit/6d186c2fdf4a389cf3d2963f2c40c3c7e18be228))
* replace sentry and context7 feature endpoints with github ([cf28e48](https://github.com/buremba/1mcp/commit/cf28e4802ee791ec0e87fb318a0a17f3cb654060))

## 1.0.0 (2025-11-22)


### Features

* add Apache 2.0 license and enable npm publishing ([a8d7b92](https://github.com/buremba/1mcp/commit/a8d7b926dd743e6e8c0b192053055d37fe6c3fd2))
* Add GitHub Actions workflow for Cloudflare Pages deployment ([e6115f3](https://github.com/buremba/1mcp/commit/e6115f3a02528008ef0eb48819292208f21af27f))
* Add interactive code highlighting and an interactive configuration display to the features section, and remove HowItWorksSection from the main app layout. ([f6a70c2](https://github.com/buremba/1mcp/commit/f6a70c200c9159fe826b6df1e316b9ee1c71edcd))
* Configure Cloudflare Pages deployment and rename project in package.json. ([e4130b0](https://github.com/buremba/1mcp/commit/e4130b0fc3082f37ef24cbafc937574187d00e90))
* Flatten `policy` configuration in examples and enhance documentation with Anthropic comparison, feature details, and interactive elements, plus minor UI adjustments. ([dfcdcc6](https://github.com/buremba/1mcp/commit/dfcdcc6fb4b186a4d030181e9851f34188b0c4c8))
* introduce integration dropdown and modal, add 'How It Works' section, and update hero content ([d5fb45d](https://github.com/buremba/1mcp/commit/d5fb45dc6ffbf6316ddcadf6e4f93057226234ff))
* Refactor code highlighting for multi-language support, update MCP configuration examples, and refine section title styling. ([df4d774](https://github.com/buremba/1mcp/commit/df4d774f750b32590fb2b015a1811c89ad53f106))


### Bug Fixes

* add token support for release-please workflow ([337a550](https://github.com/buremba/1mcp/commit/337a5501d6c7e9f26a79a4fc075800e1a1e26e99))
* Configure Cloudflare Pages build for pnpm monorepo ([ea72412](https://github.com/buremba/1mcp/commit/ea724120ce677edb08365b3a6588b213bb9077cd))
* Create Pages project before deployment if it doesn't exist ([4b009b3](https://github.com/buremba/1mcp/commit/4b009b32d73ba85f9caf008868b4b259f3b58aa0))
* Install and build docs as standalone npm project ([0214a2c](https://github.com/buremba/1mcp/commit/0214a2c407ae2678a6e738d10f9f964acc104341))
* Remove unsupported [build] section from wrangler.toml ([1d95a40](https://github.com/buremba/1mcp/commit/1d95a400cc5e3e77fbf0cfb9c9850e92efc7f33a))
* specify 'dist' directory for `wrangler pages deploy` scripts ([4e45938](https://github.com/buremba/1mcp/commit/4e4593867a90e8e6d50ed355f3499589c81a7b8a))
* Update build output directory for docs root in Pages config ([53c7d31](https://github.com/buremba/1mcp/commit/53c7d31e9831829b1b86383c181f07202c1ed5a0))
* Use pnpm workspace build command in GitHub Actions ([361ff97](https://github.com/buremba/1mcp/commit/361ff977b356a92be5c3e94947113f2b99125c7f))


### Reverts

* remove unnecessary token parameter from release-please workflow ([6860772](https://github.com/buremba/1mcp/commit/68607723be45e499711518e57cb42a6c1b027fe0))
