import * as vscode from 'vscode';

export class FileReplaceService {
    static async replaceEntireFile(editor: vscode.TextEditor, codeStream: AsyncGenerator<string>, token: vscode.CancellationToken): Promise<void> {
        const doc = editor.document;
        const originalContent = doc.getText();
        const originalLength = originalContent.length;
        
        // 创建模糊背景装饰类型
        const decorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.4',
            backgroundColor: 'rgba(200, 200, 200, 0.3)' // 半透明灰色背景模拟模糊
        });
        
        let accumulatedContent = '';
        
        try {
            for await (const chunk of codeStream) {
                if (token.isCancellationRequested) {
                    return;
                }

                accumulatedContent += chunk;
                
                // 计算当前内容长度和剩余原内容
                const currentLength = accumulatedContent.length;
                const remainingOriginal = currentLength < originalLength 
                    ? originalContent.substring(currentLength) 
                    : '';
                
                // 构建新内容（新生成部分 + 剩余原内容）
                const newContent = accumulatedContent + remainingOriginal;
                
                // 替换整个文档内容
                await editor.edit(editBuilder => {
                    const fullRange = new vscode.Range(
                        doc.positionAt(0),
                        doc.positionAt(doc.getText().length)
                    );
                    editBuilder.replace(fullRange, newContent);
                });
                
                // 更新装饰范围（仅未替换部分）
                if (currentLength < originalLength) {
                    const startPos = doc.positionAt(currentLength);
                    const endPos = doc.positionAt(originalLength);
                    const decorationRange = new vscode.Range(startPos, endPos);
                    editor.setDecorations(decorationType, [decorationRange]);
                } else {
                    editor.setDecorations(decorationType, []);
                }
            }

            // 生成完成后清理残留原内容
            if (accumulatedContent.length < originalLength) {
                await editor.edit(editBuilder => {
                    const deleteRange = new vscode.Range(
                        doc.positionAt(accumulatedContent.length),
                        doc.positionAt(originalLength)
                    );
                    editBuilder.delete(deleteRange);
                });
            }
            
            // 格式化最终文档
            await vscode.commands.executeCommand('editor.action.formatDocument');
            
            // 移除所有装饰
            editor.setDecorations(decorationType, []);

        } catch (error) {
            vscode.window.showErrorMessage(`文件更新错误: ${error}`);
            throw error;
        } finally {
            decorationType.dispose();
        }
    }
}