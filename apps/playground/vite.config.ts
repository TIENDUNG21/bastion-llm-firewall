import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * The built page may not talk to any server: connect-src 'none' makes the
 * browser refuse fetch, XHR, WebSocket and beacons. Added at build time only,
 * because the dev server needs a WebSocket for hot reload.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'bastion-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      ),
  };
}

export default defineConfig({
  base: '/bastion-llm-firewall/',
  resolve: {
    alias: {
      '@bastion/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  plugins: [contentSecurityPolicy()],
  server: { port: 5200, strictPort: true },
  preview: { port: 5201, strictPort: true },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
});
