import * as vscode from "vscode";

export class LogResultDecorator {
	private readonly map = new Map<
		string,
		{ uri: vscode.Uri; lines: Map<number, LineHistory> }
	>();
	private readonly decorationType = vscode.window.createTextEditorDecorationType({
		after: {
			color: "gray",
			margin: "20px",
		},
	})

	private readonly annotateOutput: boolean = true;
	private readonly hoverOutput: boolean = true;

	constructor(annotateOutput: boolean = true, hoverOutput: boolean = true) {
		this.annotateOutput = annotateOutput;
		this.hoverOutput = hoverOutput;

		vscode.workspace.onDidChangeTextDocument((evt) => {
			this.updateLineNumbers(evt);
			this.updateDecorations();
		})
		vscode.workspace.onDidCloseTextDocument((doc) => {
			this.map.delete(doc.uri.toString());
		})
		vscode.workspace.onDidSaveTextDocument((doc) => {
			// remove annotations on save. could be disabled/removed.
			this.map.delete(doc.uri.toString());
			this.updateDecorations();
		})
		vscode.workspace.onDidOpenTextDocument((doc) => {
			// convert line numbers to offsets
			this.addOffsets(doc);
			this.updateDecorations();
		})
		vscode.window.onDidChangeActiveTextEditor((doc) => {
			if (doc) {
				// convert line numbers to offsets
				this.addOffsets(doc.document);
				this.updateDecorations();
			}
		})
	};

	public log(uri: vscode.Uri, line: number, output: string): void {
		let entry = this.map.get(uri.toString());
		if (!entry) {
			entry = { uri, lines: new Map() };
			this.map.set(uri.toString(), entry);
		}

		let history = entry.lines.get(line);
		if (!history) {
			history = new LineHistory(uri, line);
			entry.lines.set(line, history);
		}

		history.history.unshift(output);

		this.updateDecorations();
	}

	public clear(): void {
		this.map.clear();
		this.updateDecorations();
	}

	private updateDecorations() {
		for (const editor of vscode.window.visibleTextEditors) {
			const entry = this.map.get(editor.document.uri.toString());
			if (!entry) {
				editor.setDecorations(this.decorationType, []);
				continue;
			}

			editor.setDecorations(
				this.decorationType,
				[...entry.lines.values()].map((history) => {
					const range = editor.document.lineAt(history.line).range;
					const hoverMessage = new vscode.MarkdownString();
					hoverMessage.isTrusted = true;
					hoverMessage.appendMarkdown('**Recent Output:**\n');
					for (let h of history.history.slice().reverse()) {
						h = h.trim();
						hoverMessage.appendMarkdown('\n---\n```\n' + h + '\n```');
					}

					const ret: vscode.DecorationOptions = {
						range: range
					}
					if(this.hoverOutput){
						ret.hoverMessage = hoverMessage;
					}
					if(this.annotateOutput){
						ret.renderOptions = {
							after: {
								contentText: history.history[0].trim(),
							}
						};
					}

					return ret;
				})
			);
		}
	}

	private updateLineNumbers(evt: vscode.TextDocumentChangeEvent) {
		if (evt.contentChanges.length === 0) {
			// nothing changed. Use this occasion to add/update offsets
			this.addOffsets(evt.document);
		} else {
			// find matching annotations and update lines/offsets
			const entry = this.map.get(evt.document.uri.toString());
			if (entry) {
				entry.lines.forEach((lineHistory, k) => {
					const success = updateLineLocation(lineHistory, evt);
					if (!success) {
						entry.lines.delete(k);
					}
				});
			}
		}
	}
	private addOffsets(doc: vscode.TextDocument) {
		// method to update/add offsets to the lineHistory items
		// is done on document open, since TextDocumentchangeEvents do not contain the necessary info to do this after the change
		const entry = this.map.get(doc.uri.toString());
		if (entry) {
			entry.lines.forEach((lineHistory) => {
				const line = doc.lineAt(lineHistory.line);
				lineHistory.offset = doc.offsetAt(line.range.end);
			});
		}
	}
}

class LineHistory {
	constructor(public readonly uri: vscode.Uri, public line: number) {}
	public readonly history: string[] = [];
	public offset?: number; // is the offset of the last character on the line
}

function updateLineLocation(
	lineHistory: LineHistory,
	evt: vscode.TextDocumentChangeEvent
) {
	// handle a TextDocumentChange event
	// handles each change in the event separately
	// returns false, if any change affects a range that includes the considered line (-> success == false)
	// (indicates that the annotation should be deleted by the calling function)
	const doc = evt.document;
	let success: boolean = true;
	evt.contentChanges.forEach((change) => {
		const tmp = updateLineLocationByChange(lineHistory, change, doc);
		success = tmp && success;
	});
	return success;
}
function updateLineLocationByChange(
	lineHistory: LineHistory,
	change: vscode.TextDocumentContentChangeEvent,
	doc: vscode.TextDocument
) {
	const start = change.rangeOffset;
	const end0 = start + change.rangeLength; // end of the range before the change
	const end1 = start + change.text.length; // end of the range after the change
	const offset0 = lineHistory.offset; // offset of the last character on the line from lineHistory (before the change)
	let success: boolean = true; // true if change was handled properly, false if the anootation should be deleted
	if (offset0 === undefined) {
		// offsets not known --> delete annotation
		success = false;
	} else if (offset0 < start) {
		// change happened after the line --> do nothing
	} else if (offset0 <= end0) {
		// changed range indluces the line --> delete annotation
		success = false;
	} else {
		// offset > end0
		// change happened before the line --> adjust lineNumber/offset of lineHistory
		const offset1 = offset0 + end1 - end0;
		const position = doc.positionAt(offset1);
		const line = doc.lineAt(position);
		lineHistory.line = line.lineNumber;
		lineHistory.offset = offset1;
		success = true;
	}
	return success;
}
