import * as vscode from 'vscode';

export class EditorService {
    static validateEditor(): vscode.TextEditor | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开代码文件');
            return undefined;
        }
        return editor;
    }

    static async createFullSelection(editor: vscode.TextEditor): Promise<vscode.Selection> {
        const doc = editor.document;
        const totalLines = doc.lineCount - 1;
        const endChar = doc.lineAt(totalLines).text.length;

        // 创建动画装饰器
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
            isWholeLine: true
        });

        // 逐行扩展动画
        let currentLine = 0;
        const animationInterval = setInterval(() => {
            if (currentLine > totalLines) {
                clearInterval(animationInterval);
                decorationType.dispose();
                return;
            }
            
            const range = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(currentLine, doc.lineAt(currentLine).text.length)
            );
            editor.setDecorations(decorationType, [range]);
            currentLine++;
        }, 50);

        // 返回完整选择范围
        return new vscode.Selection(
            new vscode.Position(0, 0),
            new vscode.Position(totalLines, endChar)
        );
    }

    static async validateSelection(editor: vscode.TextEditor): Promise<string | undefined> {
        if (editor.selection.isEmpty) {
            const newSelection = await this.createFullSelection(editor);
            editor.selection = newSelection;
        }

        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('选中的内容为空');
            return undefined;
        }
        return selectedText;
    }


    static async insertStreamContent(editor: vscode.TextEditor, codeStream: AsyncGenerator<string>, token: vscode.CancellationToken): Promise<void> {
        let fullCode = '';
        const insertionBase = editor.selection.end;
        let currentPosition = insertionBase;

        // 插入初始注释并预留空行
        await editor.edit(editBuilder => {
            const header = `\n// AI生成代码 - ${new Date().toLocaleString()}\n\n`;
            editBuilder.insert(insertionBase, header);
            currentPosition = insertionBase.translate(2); // 下移两行到空行位置
        });

        for await (const chunk of codeStream) {
            if (token.isCancellationRequested) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(currentPosition, "\n// 生成已取消");
                });
                break;
            }

            // 处理换行符
            const processedChunk = chunk.replace(/\r\n/g, '\n');

            await editor.edit(editBuilder => {
                editBuilder.insert(currentPosition, processedChunk);

                // 计算新位置
                const lines = processedChunk.split('\n');
                if (lines.length > 1) {
                    currentPosition = new vscode.Position(
                        currentPosition.line + lines.length - 1,
                        lines[lines.length - 1].length
                    );
                } else {
                    currentPosition = currentPosition.translate(0, processedChunk.length);
                }
            });

            fullCode += processedChunk;
        }

        // 确保最后有空行
        await editor.edit(editBuilder => {
            editBuilder.insert(currentPosition, "\n");
        });
    }
}
