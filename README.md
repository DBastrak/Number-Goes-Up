# number go up

A desktop dashboard for your Destiny 2 raid &amp; dungeon stats. Built with **Electron + React (Vite)** via [electron-vite](https://electron-vite.org).

> This is an early example build. The UI is in place with placeholder data; real Steam integration comes next.

## Pages

1. **Login** — sign-in screen (accepts any details for now).
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

## Project structure

```
src/
  main/      Electron main process (window, IPC)
  preload/   contextBridge API exposed to the renderer
  renderer/  React app
    src/
      pages/       Login, Library, Activity, Settings
      components/  TopNav
      data/        mockData.js (placeholder content)
      styles/      per-page CSS + theme
```

## Next steps

- Wire the login form to real Steam authentication / Web API key.
- Replace `data/mockData.js` with live data fetched in the main process.
- Persist settings to disk.
