# Dashboard

Read-only desk view for the bot. Vite + React + Tailwind, no UI kit.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to localhost:8787
npm run build
```

`?user=<id>` selects which account the Desk and Activity tabs show; it accepts
either the internal user id or a Telegram id. When the API is unreachable the
dashboard falls back to a sample desk so the layout stays demonstrable on a
static host.
