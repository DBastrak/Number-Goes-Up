# number go up

A desktop dashboard for your Destiny 2 raid &amp; dungeon stats. Built with **Electron + React (Vite)** via [electron-vite](https://electron-vite.org).

## Pages

1. **Login** — sign-in screen.
2. **Library / Stats** — left sidebar of sections; selecting one fills the main panel with that section's games and summary stats.
3. **Activity / Achievements** — a feed of recent activity plus an achievements list.
4. **Settings** — account, appearance, and data/sync options.

## Getting started

```bash
npm install
npm run dev      # launch the app in development (hot reload)
```

Other scripts:

```bash
npm run build    # bundle main / preload / renderer into out/
npm run preview  # run the bundled build
```

## Configuration (`.env`)

Create a `.env` file in the project root (it's also shipped to the packaged app's
resources dir). Keys:

```ini
# Required — used on every Bungie API request.
bungieAPI=your_api_key

# Optional — enables "Sign in with Bungie" (OAuth). Without these the app still works
# via name lookup, but live fireteam / private-profile reads stay unavailable.
bungieClientId=your_oauth_client_id
bungieClientSecret=your_oauth_client_secret   # only for a "Confidential" app
bungieRedirectUri=https://localhost/          # must match the app's registered redirect
```

Get these from the [Bungie developer portal](https://www.bungie.net/en/Application):

1. Create an application → copy the **API Key** into `bungieAPI`.
2. Set **OAuth Client Type** to *Confidential* (gives a client secret + refresh tokens).
3. Set the **Redirect URL** to `https://localhost/` (or your own https URL) and mirror it
   in `bungieRedirectUri`. The app never serves this URL — it intercepts the redirect in
   the sign-in window to read the auth code.
4. Under **Scope**, enable the read scopes you want (e.g. *Read your Destiny vault and
   character inventory*). Phase 1 only needs read access; item transfers would add the
   *Move or equip Destiny gear* scope later.
5. Copy the **OAuth client_id** and **client_secret** into `.env`.

OAuth tokens are stored in `userData/oauth.json`, encrypted at rest via the OS keychain
(DPAPI on Windows) when available.

## Project structure

```
src/
  main/      Electron main process (window, IPC)
  preload/   contextBridge API exposed to the renderer
  renderer/  React app
    src/
      pages/       Login, Library, Activity, Settings
      components/  TopNav
      data/        
      styles/      per-page CSS + theme
```

