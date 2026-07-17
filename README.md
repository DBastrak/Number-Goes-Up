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
4. Under **Scope**, enable:
   - *Read your Destiny vault and character inventory* — needed to view the inventory.
   - *Move or equip Destiny gear* — needed for the inventory manager's drag-to-transfer.
5. Copy the **OAuth client_id** and **client_secret** into `.env`.

If you add the *Move or equip* scope after already signing in, **sign out and sign back
in** — the access token only carries the scopes granted at authorization time.

OAuth tokens are stored in `userData/oauth.json`, encrypted at rest via the OS keychain
(DPAPI on Windows) when available.

### Inventory manager

The **Inventory** tab (Bungie sign-in required) shows your vault and each character's
weapons and armour in DIM-style columns. Drag a tile to another column to move it
(character→character routes through the vault automatically); hover a tile for its live
stats and perks; the search box filters by item or perk name.

On first open it downloads the Destiny item database (`DestinyInventoryItemDefinition` plus
stat/damage tables), slims it to just what the UI needs, and caches it in `userData`
(`manifest-*.json`). This is a one-time download that refreshes automatically after each
game patch (detected via the manifest version).

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

