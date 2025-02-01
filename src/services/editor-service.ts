// editor-service.ts
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

        // 先将视口滚动到顶部
        editor.revealRange(
            new vscode.Range(0, 0, 0, 0),
            vscode.TextEditorRevealType.AtTop
        );

        // 等待一小段时间确保滚动完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 创建动画装饰器
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
            isWholeLine: true
        });

        // 返回Promise等待动画完成
        return new Promise((resolve) => {
            let currentLine = 0;
            
            // 动态调整动画速度（最大2秒完成）
            const baseSpeed = doc.lineCount > 500 ? 20 : 50;
            
            const animationInterval = setInterval(() => {
                if (currentLine > totalLines) {
                    clearInterval(animationInterval);
                    decorationType.dispose();
                    const selection = new vscode.Selection(0, 0, totalLines, endChar);
                    editor.selection = selection;
                    // 定位到底部
                    editor.revealRange(
                        new vscode.Range(totalLines, 0, totalLines, endChar),
                        vscode.TextEditorRevealType.Default
                    );
                    resolve(selection);
                    return;
                }

                // 仅更新装饰器
                const range = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(currentLine, doc.lineAt(currentLine).text.length)
                );
                editor.setDecorations(decorationType, [range]);
                
                currentLine++;
            }, baseSpeed);
        });
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

        // 插入生成时间注释
        await editor.edit(editBuilder => {
            const header = `\n// AI生成代码 - ${new Date().toLocaleString()}\n\n`;
            editBuilder.insert(insertionBase, header);
            currentPosition = insertionBase.translate(2);
        });

        try {
            for await (const chunk of codeStream) {
                if (token.isCancellationRequested) {
                    await editor.edit(editBuilder => {
                        editBuilder.insert(currentPosition, "\n// 生成已取消");
                    });
                    break;
                }

                const processedChunk = chunk.replace(/\r\n/g, '\n');
                await this.insertChunk(editor, currentPosition, processedChunk);
                
                currentPosition = this.calculateNewPosition(
                    currentPosition,
                    processedChunk
                );

                // 确保新插入的内容可见
                editor.revealRange(
                    new vscode.Range(currentPosition, currentPosition),
                    vscode.TextEditorRevealType.Default
                );

                fullCode += processedChunk;
            }

            await editor.edit(editBuilder => {
                editBuilder.insert(currentPosition, "\n");
            });

        } catch (error) {
            await this.insertErrorNotice(editor, currentPosition, error);
            throw error;
        }
    }

    private static async insertChunk(
        editor: vscode.TextEditor,
        position: vscode.Position,
        chunk: string
    ) {
        await editor.edit(editBuilder => {
            editBuilder.insert(position, chunk);
        });
    }

    private static calculateNewPosition(
        currentPosition: vscode.Position,
        chunk: string
    ): vscode.Position {
        const lines = chunk.split('\n');
        if (lines.length > 1) {
            return new vscode.Position(
                currentPosition.line + lines.length - 1,
                lines[lines.length - 1].length
            );
        }
        return currentPosition.translate(0, chunk.length);
    }

    private static async insertErrorNotice(
        editor: vscode.TextEditor,
        position: vscode.Position,
        error: unknown
    ) {
        const message = error instanceof Error ? error.message : '未知错误';
        await editor.edit(editBuilder => {
            editBuilder.insert(position, `\n// 生成错误: ${message}`);
        });
    }
}