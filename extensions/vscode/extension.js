const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const vscode = require("vscode");

let diagnostics;
let outputChannel;
let pendingScan = Promise.resolve();

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("sadrazam");
  outputChannel = vscode.window.createOutputChannel("Sadrazam");
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(outputChannel);

  const command = vscode.commands.registerCommand("sadrazam.scanWorkspace", async () => {
    await enqueueScan(context, { showInformation: true });
  });

  context.subscriptions.push(command);

  const saveSubscription = vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!getConfiguration().get("scanOnSave")) {
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);

    if (!folder) {
      return;
    }

    await enqueueScan(context, { folder, showInformation: false });
  });

  context.subscriptions.push(saveSubscription);

  if (getConfiguration().get("scanOnOpen")) {
    enqueueScan(context, { showInformation: false });
  }
}

function deactivate() {
  diagnostics?.dispose();
}

function getConfiguration() {
  return vscode.workspace.getConfiguration("sadrazam");
}

async function enqueueScan(context, options = {}) {
  pendingScan = pendingScan
    .catch(() => undefined)
    .then(() => scanWorkspace(context, options))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel?.appendLine(`Scan failed: ${message}`);
      vscode.window.showErrorMessage(`Sadrazam scan failed: ${message}`);
    });

  await pendingScan;
}

async function scanWorkspace(context, options = {}) {
  const folder = options.folder ?? getWorkspaceFolder();

  if (!folder) {
    vscode.window.showWarningMessage("Sadrazam needs an open workspace folder.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Sadrazam scan",
      cancellable: false,
    },
    async () => {
      outputChannel?.appendLine(`Scanning ${folder.uri.fsPath}`);
      const output = await runSadrazam(context, folder.uri.fsPath);
      const report = parseCompactReport(output);
      publishDiagnostics(folder, report.findings);
      outputChannel?.appendLine(`Found ${report.findings.length} issue(s).`);

      if (options.showInformation) {
        vscode.window.showInformationMessage(`Sadrazam found ${report.findings.length} issue(s).`);
      }
    },
  );
}

function getWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0] : null;
}

function runSadrazam(context, workspaceRoot) {
  const resolved = resolveSadrazamCommand(context);
  const args = [...resolved.args, workspaceRoot, "--reporter", "compact-json"];
  outputChannel?.appendLine(`Running: ${resolved.command} ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    cp.execFile(
      resolved.command,
      args,
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (stderr.trim()) {
          outputChannel?.appendLine(stderr.trim());
        }

        if (stdout.trim()) {
          resolve(stdout);
          return;
        }

        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        resolve("{}");
      },
    );
  });
}

function resolveSadrazamCommand(context) {
  const configured = getConfiguration().get("cliPath");

  if (configured && configured.trim()) {
    return { command: configured.trim(), args: [] };
  }

  const repoCli = path.resolve(context.extensionPath, "..", "..", "dist", "index.js");

  if (fs.existsSync(repoCli)) {
    return { command: process.execPath, args: [repoCli] };
  }

  return { command: "sadrazam", args: [] };
}

function parseCompactReport(output) {
  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`Sadrazam returned invalid compact JSON: ${error.message}`);
  }

  if (!parsed || !Array.isArray(parsed.findings)) {
    throw new Error("Sadrazam compact JSON did not include a findings array.");
  }

  return parsed;
}

function publishDiagnostics(folder, findings) {
  diagnostics.clear();

  const byFile = new Map();

  for (const finding of findings) {
    const uri = getDiagnosticUri(folder, finding);
    const entries = byFile.get(uri.toString()) ?? { uri, diagnostics: [] };
    entries.diagnostics.push(toDiagnostic(finding));
    byFile.set(uri.toString(), entries);
  }

  for (const entry of byFile.values()) {
    diagnostics.set(entry.uri, entry.diagnostics);
  }
}

function getDiagnosticUri(folder, finding) {
  if (finding.file) {
    return vscode.Uri.joinPath(folder.uri, finding.file);
  }

  if (finding.workspace?.packagePath) {
    return vscode.Uri.file(finding.workspace.packagePath);
  }

  return vscode.Uri.joinPath(folder.uri, "package.json");
}

function toDiagnostic(finding) {
  const line = Number.isInteger(finding.line) && finding.line > 0 ? finding.line - 1 : 0;
  const column = Number.isInteger(finding.column) && finding.column > 0 ? finding.column - 1 : 0;
  const range = new vscode.Range(line, column, line, column + 1);
  const severity = finding.severity === "error"
    ? vscode.DiagnosticSeverity.Error
    : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(range, finding.message, severity);
  diagnostic.source = "sadrazam";
  diagnostic.code = finding.type;
  return diagnostic;
}

module.exports = {
  activate,
  deactivate,
};
