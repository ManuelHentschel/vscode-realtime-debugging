import * as vscode from "vscode";

export class ExecutionHighlighter {
	private readonly highlighter = new Highlighter();

	highlight(uri: vscode.Uri, line: number): void {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.toString() === uri.toString()) {
				const range = editor.document.lineAt(line).range;
				this.highlighter.highlight(editor, range);
			}
		}
	}
}

export class Highlighter {
	private lastHighlight: Highlight | undefined;

	highlight(editor: vscode.TextEditor, range: vscode.Range): void {
		if (this.lastHighlight) {
			this.lastHighlight.deprecate();
		}
		this.lastHighlight = new Highlight(editor, range, () => {});
	}
}

class Highlight {
	private type: vscode.TextEditorDecorationType | undefined;

	constructor(
		private readonly textEditor: vscode.TextEditor,
		private readonly range: vscode.Range,
		onHide: () => void
	) {
		this.type = vscode.window.createTextEditorDecorationType({
			backgroundColor: "orange",
		});
		textEditor.setDecorations(this.type, [range]);

		setTimeout(() => {
			this.dispose();
			onHide();
		}, 1000);
	}

	deprecate() {
		if (this.type) {
			this.type.dispose();
			this.type = vscode.window.createTextEditorDecorationType({
				backgroundColor: "yellow",
			});
			this.textEditor.setDecorations(this.type, [this.range]);
		}
	}

	dispose() {
		if (this.type) {
			this.type.dispose();
		}
		this.type = undefined;
	}
}
