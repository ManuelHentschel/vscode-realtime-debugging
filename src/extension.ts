import * as vscode from "vscode";

import { DebugAdapterTrackerFactory } from './debugAdapterTracker';


export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.debug.registerDebugAdapterTrackerFactory(
			"*",
			new DebugAdapterTrackerFactory()
		)
	);
}

export function deactivate() {}
