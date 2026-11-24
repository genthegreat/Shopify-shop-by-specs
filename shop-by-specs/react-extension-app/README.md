# react-extension-app

React source for the Shop by Specs theme app extension. It is bundled with
webpack (see `webpack.config.js`) into
`../extensions/shop-by-specs-collections/assets/react-extension.js`.

## Scripts

- `npm run build` – production build of the extension bundle.
- `npm run watch` – rebuild the bundle on file changes.
- `npm run build-and-deploy` – build, then run `shopify app deploy` from the parent app.
- `npm run lint` – run ESLint (flat config in `eslint.config.js`).
