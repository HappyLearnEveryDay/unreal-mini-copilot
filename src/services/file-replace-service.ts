import * as vscode from 'vscode';

export class FileReplaceService {
    static async replaceEntireFile(editor: vscode.TextEditor, codeStream: AsyncGenerator<string>, token: vscode.CancellationToken): Promise<void> {
        const doc = editor.document;
        
        // 创建累积缓冲区
        let accumulatedContent = '';
        
        try {
            // 首次清空文件
            await editor.edit(editBuilder => {
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length)
                );
                editBuilder.delete(fullRange);
            });

            // 处理流式内容
            for await (const chunk of codeStream) {
                if (token.isCancellationRequested) {
                    return;
                }

                accumulatedContent += chunk;
                
                // 整块更新内容
                await editor.edit(editBuilder => {
                    const fullRange = new vscode.Range(
                        doc.positionAt(0),
                        doc.positionAt(doc.getText().length)
                    );
                    editBuilder.replace(fullRange, accumulatedContent);
                });
            }

            // 格式化最终文档
            await vscode.commands.executeCommand('editor.action.formatDocument');

        } catch (error) {
            vscode.window.showErrorMessage(`文件更新错误: ${error}`);
            throw error;
        }
    }
}