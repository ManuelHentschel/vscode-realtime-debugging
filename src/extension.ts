import * as vscode from "vscode";


import { ExecutionHighlighter } from "./ExecutionHighlighter";
import { LogResultDecorator } from "./LineHistory";


export class DebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
	private log?: vscode.OutputChannel;
	private readonly logResultDecorator?: LogResultDecorator;
	private readonly addTimestamp: boolean;

	constructor(){
		const config = vscode.workspace.getConfiguration(
			"realtime-debugging"
		);
		if(config.get<boolean>("logDAP")){
			this.log = vscode.window.createOutputChannel("Debug Log")
		};
		this.addTimestamp = config.get<boolean>("addTimestamp", true);
		const annotateOutput: boolean = config.get<boolean>("annotateOutput", true);
		const hoverOutput: boolean = config.get<boolean>("hoverOutput", true);
		if(annotateOutput || hoverOutput){
			this.logResultDecorator = new LogResultDecorator(annotateOutput, hoverOutput);
		}
	}

	public createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
		return new DebugAdapterTracker(this.log, this.logResultDecorator, this.addTimestamp);
	}
}

export class DebugAdapterTracker implements vscode.DebugAdapterTracker {
	private readonly log?: vscode.OutputChannel;
	private readonly executionHightlighter?: ExecutionHighlighter;
	private readonly logResultDecorator?: LogResultDecorator;
	private readonly addTimestamp: boolean;

	private isNewline: boolean = true;

	constructor(log?: vscode.OutputChannel, logResultDecorator?: LogResultDecorator, addTimestamp: boolean = true) {
		this.log = log;
		this.logResultDecorator = logResultDecorator;
		this.addTimestamp = addTimestamp;
	}

	public onWillStartSession() {
		if (this.logResultDecorator) {
			this.logResultDecorator.clear();
		}
		if (this.log) {
			this.log.clear();
		}
	}

	public onDidSendMessage(message: any) {
		if (
			message.event === "output" &&
			"body" in message && (
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

				if (this.executionHightlighter) {
					this.executionHightlighter.highlight(
						pathUri,
						line
					);
				}
				if (this.logResultDecorator) {
					this.logResultDecorator.log(
						pathUri,
						line,
						output
					);
				}

				if(this.addTimestamp && body.output){
					const tmpTimeStamp = timeStamp();
					let txt = <string>body.output;
					const lines = txt.split('\n');
					const ind0 = (this.isNewline ? 0 : 1);
					let ind1 = lines.length - 1;
					if(lines[ind1] === ''){
						ind1 -= 1;
						this.isNewline = true;
					} else{
						this.isNewline = false;
					}
					for(let i=ind0; i<=ind1; i++){
						lines[i] = `[${tmpTimeStamp}]  ${lines[i]}`;
					}
					body.output = lines.join('\n');
				}
			}
		}

		if (this.log) {
			const ts = timeStamp();
			this.log.appendLine(`[${ts}] -> ${JSON.stringify(message)}`);
		}
	}
	public onWillReceiveMessage(message: any) {
		if (this.log) {
			const ts = timeStamp();
			this.log.appendLine(`[${ts}] <- ${JSON.stringify(message)}`);
		}
	}
}

function timeStamp(): string {
	const date = new Date();
	const s = date.toISOString().replace(/^.*T(.*)Z$/, '$1');
	return s;
}


export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.debug.registerDebugAdapterTrackerFactory(
			"*",
			new DebugAdapterTrackerFactory()
		)
	);
}

export function deactivate() {}
