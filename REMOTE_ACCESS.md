# Using the fork from your phone (Tailscale)

The OpenCode server only listens on `127.0.0.1`. Tailscale's `serve` feature publishes it to **your tailnet only** (not the internet) over HTTPS with a real certificate. HTTPS matters: browsers only allow installing the app and receiving push notifications on secure pages.

## One-time setup on the PC

1. Start the desktop app (it runs the OpenCode background service), then find the service's port:

   ```bash
   opencode service status
   ```

   It prints a URL like `http://127.0.0.1:28673`. Note the port.

2. Turn on HTTPS certificates for your tailnet if you haven't: Tailscale admin console → **DNS** → enable **MagicDNS** and **HTTPS Certificates**.

3. Publish the service to your tailnet (replace `28673` with your port):

   ```bash
   tailscale serve --bg 28673
   ```

   Tailscale prints an address like `https://your-pc.your-tailnet.ts.net`. Only devices signed in to your tailnet can reach it. Undo it any time with `tailscale serve reset`.

## Pair your phone

1. On the PC, create a pairing link that points at the Tailscale address:

   ```bash
   opencode pair --url https://your-pc.your-tailnet.ts.net
   ```

2. With Tailscale connected on the phone, scan the QR code (or open the link). The link works once and expires after 5 minutes. The phone stays signed in for 30 days.

## Install the app and turn on notifications

- **Android (Chrome):** menu → **Install app** (or **Add to Home screen**).
- **iPhone (Safari, iOS 16.4+):** Share → **Add to Home Screen**. iOS only allows push for apps added to the home screen.

Then open the installed app → **Settings** → your server → **Push notifications on this device**, and allow notifications when asked. Use **Send test** to check.

You'll get a notification when a session finishes or fails, and when the agent needs approval or asks a question. Nothing is sent while the app is open and in front of you on that device.

## Starting work remotely

Everything in the app works from the phone: open sessions from the sidebar, start new ones, answer questions and approvals, switch permission modes. Sessions run on the PC, so the PC must be on and the desktop app (or `opencode serve`) running.
