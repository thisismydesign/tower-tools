# The Tower

This repo is for tools for the mobile game: "The Tower"

https://the-tower-idle-tower-defense.fandom.com/
https://play.google.com/store/apps/details?id=com.TechTreeGames.TheTower&hl=en
https://store.techtreegames.com/thetower/
https://www.reddit.com/r/TheTowerGame/

## Canvases

Repo-owned canvases live at `.cursor/canvases/<name>.canvas.tsx` — versioned source of truth, edit here. The IDE renders only from `~/.cursor/projects/<workspace>/canvases/`, so after editing, `cp` the repo copy over the managed one. Live UI edits persist to a managed-folder `*.canvas.data.json` sidecar (not versioned); fold meaningful values into the repo defaults. Skills reference their canvas by name and keep it current.
