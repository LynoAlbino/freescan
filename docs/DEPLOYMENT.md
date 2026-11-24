# Static deployment

Build with `npm ci && npm run build`. Deploy the contents of `dist/`. The default relative base supports root and subdirectory hosting. For GitHub Pages, set `BASE_PATH=/repository-name/` at build time.

## GitHub Pages

The included `.github/workflows/pages.yml` builds, tests and uploads `dist` with the official Pages actions. Push this directory to your own repository, enable Settings → Pages → GitHub Actions, and run the workflow. No secrets, backend or paid plan are required for a public repository. Change the base path if using a custom domain.

## Cloudflare Pages

Create a Pages project from the repository. Select no preset, Node 22+, build command `npm ci && npm run build`, output directory `dist`. No Functions or bindings are required. A `_headers` file provides additional security headers on compatible static hosts. HTTPS is supplied by Pages.

## Self-hosted Nginx example

```nginx
server {
  listen 443 ssl;
  server_name scan.example.org;
  root /srv/freescan/dist;
  include mime.types;
  # Configure your own TLS certificate/key here.
  location / { try_files $uri $uri/ =404; }
  location = /sw.js {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
  }
  location = /index.html { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy no-referrer;
  add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()";
}
```

Use a current `mime.types` with `application/wasm wasm` and JavaScript for `.mjs`. The page includes a CSP; retain it when changing the shell. The app uses WASM but does not require SharedArrayBuffer or cross-origin isolation. Do not force-download `.traineddata.gz` with `Content-Encoding: gzip`: these files are intentionally compressed payloads consumed by Tesseract, not transport-compressed responses.

## Release checks

1. Run `npm test`, `npm run test:e2e` and `npm run build`.
2. Deploy the complete output, including `vendor/`, `tessdata/`, fonts, icons and `sw.js`.
3. On a fresh browser profile, wait for Ready offline, disconnect networking, reload and import/export a document. Download each language needed before testing it offline.
4. Test on physical target phones. Review `docs/TESTING.md`; browser emulation cannot verify camera optics, torch behavior, actual iOS installation or low-memory operation.
5. Keep versioned assets available during deployment and serve HTML/service-worker scripts with revalidation. Existing users activate an update from Settings after their draft is saved.
