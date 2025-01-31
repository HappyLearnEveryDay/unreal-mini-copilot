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

    static validateSelection(editor: vscode.TextEditor): string | undefined {
        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('请先选中功能描述文本');
            return undefined;
        }
        return selectedText;
    }

    static async insertStreamContent(
        editor: vscode.TextEditor,
        stream: AsyncGenerator<string>,
        token: vscode.CancellationToken
    ) {
        let fullCode = '';
        const insertionBase = editor.selection.end;
        let currentPosition = insertionBase;

        // 插入初始注释
        await editor.edit(editBuilder => {
            const header = `\n// AI生成代码 - ${new Date().toLocaleString()}\n\n`;
            editBuilder.insert(insertionBase, header);
            currentPosition = insertionBase.translate(2);
        });

        try {
            for await (const chunk of stream) {
                if (token.isCancellationRequested) {
                    await this.insertCancelNotice(editor, currentPosition);
                    break;
                }

                const processedChunk = chunk.replace(/\r\n/g, '\n');
                await this.insertChunk(editor, currentPosition, processedChunk);
                
                // 更新光标位置
                currentPosition = this.calculateNewPosition(
                    currentPosition,
                    processedChunk
                );

                fullCode += processedChunk;
            }

            // 插入结尾空行
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

    private static async insertCancelNotice(
        editor: vscode.TextEditor,
        position: vscode.Position
    ) {
        await editor.edit(editBuilder => {
            editBuilder.insert(position, "\n// 生成已取消");
        });
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