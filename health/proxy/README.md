# Oura proxy (only if you need it)

Pulse calls the Oura API straight from your browser. If **Sync now** fails with a
"blocked by CORS" message, Oura isn't accepting requests from your page's address.
This tiny relay fixes that.

1. Create a free Cloudflare account → **Workers & Pages** → **Create Worker**.
2. Paste in `worker.js` and change `ALLOWED_ORIGIN` to where you host Pulse
   (for example `https://your-username.github.io`).
3. Deploy, copy the worker URL, and paste it into **Settings → Oura → Setup & advanced → Proxy URL**.

The worker only forwards `GET /v2/usercollection/*` requests and stores nothing.
