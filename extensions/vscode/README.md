# Sadrazam VS Code Extension

Run `Sadrazam: Scan Workspace` from the command palette to scan the first workspace folder and publish findings to the Problems panel.

The extension uses `sadrazam --reporter compact-json`. During repository development it runs `dist/index.js` when available. For external use, install the `sadrazam` CLI on `PATH` or set `sadrazam.cliPath`.
