import * as vscode from "vscode";
import {
	enableHotReload,
	hotRequireExportedFn,
	registerUpdateReconciler,
	getReloadCount,
} from "@hediet/node-reload";
import { Disposable } from "@hediet/std/disposable";

if (process.env.HOT_RELOAD) {
	enableHotReload({ entryModule: module, loggingEnabled: true });
}
registerUpdateReconciler(module);

import { ExecutionHighlighter } from "./ExecutionHighlighter";
import { LogResultDecorator } from "./LineHistory";

export class Extension {
	public readonly dispose = Disposable.fn();
	private readonly log?: vscode.OutputChannel;
	private readonly executionHightlighter: ExecutionHighlighter;
	private readonly logResultDecorator: LogResultDecorator;

	constructor() {
		if (getReloadCount(module) > 0) {
			const i = this.dispose.track(vscode.window.createStatusBarItem());
			i.text = "reload" + getReloadCount(module);
			i.show();
		}


		this.executionHightlighter = new ExecutionHighlighter();
		this.logResultDecorator = this.dispose.track(
			new LogResultDecorator()
		);
		this.log = this.dispose.track(
			vscode.window.createOutputChannel("debug log")
		);

		this.dispose.track(
			vscode.debug.registerDebugAdapterTrackerFactory("*", {
				createDebugAdapterTracker: (session) => ({
					onWillStartSession: () => {
						if(this.logResultDecorator){
							this.logResultDecorator.clear();
						}
						if (this.log) {
							this.log.clear();
						}
					},
					onDidSendMessage: (message) => {
						if (
							message.event === "output" &&
							"body" in message &&
							(
								message.body.category === "stdout" ||
								message.body.category === "stderr"
							)
						) {
							const body = message.body;
							const output = body.output;
							const source = body.source;

							if (source && source.path && body.line) {
								const path = source.path;
								const line = body.line - 1;

								const pathUri = vscode.Uri.file(path);
								const config = vscode.workspace.getConfiguration('realtime-debugging');

								if(config.get<boolean>('highlightLines', true)){
									this.executionHightlighter.highlight(
										pathUri,
										line
									);
								}
								if(config.get<boolean>('logOutput', true)){
									this.logResultDecorator.log(
										pathUri,
										line,
										output
									);
								}
							}
						}

						if (this.log) {
							this.log.appendLine(
								"-> " + JSON.stringify(message)
							);
						}
					},
					onWillReceiveMessage: (message) => {
						if (this.log) {
							this.log.appendLine(
								"<- " + JSON.stringify(message)
							);
						}
					},
				}),
			})
		);
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		hotRequireExportedFn(module, Extension, (Extension) => new Extension())
	);
}

export function deactivate() {}
