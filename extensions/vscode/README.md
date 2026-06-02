# Sadrazam VS Code Extension

Run `Sadrazam: Scan Workspace` from the command palette to scan the first workspace folder and publish findings to the Problems panel.

The extension uses `sadrazam --reporter compact-json`. During repository development it runs `dist/index.js` when available. For external use, install the `sadrazam` CLI on `PATH` or set `sadrazam.cliPath`.

Settings:

- `sadrazam.cliPath`: CLI path override.
- `sadrazam.scanOnOpen`: scan once after VS Code startup.
- `sadrazam.scanOnSave`: scan after saving files inside the workspace.

Scan commands and stderr are written to the Sadrazam output channel.
