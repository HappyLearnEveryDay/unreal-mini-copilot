import * as vscode from 'vscode';
import axios from 'axios';
import { Readable } from 'stream';

interface DeepSeekResponseChunk {
    choices: {
        delta: {
            content?: string;
        };
    }[];
    error?: {
        message: string;
    };
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const key = await context.secrets.get('deepseekApiKey');
    if (!key) {
        vscode.window.showErrorMessage('请先设置DeepSeek API密钥');
        return undefined;
    }
    return key;
}

async function* generateCodeStream(prompt: string, apiKey: string): AsyncGenerator<string> {
    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.post<Readable>(
                'https://api.deepseek.com/v1/chat/completions',
                {
                    model: "deepseek-chat",
                    messages: [{
                        role: "user",
                        content: `你是一个专业的虚幻引擎C++开发者，根据以下需求生成高质量代码。要求：
1. 符合虚幻引擎代码规范
2. 包含必要的注释
3. 使用现代C++特性
4. 处理边界情况
5. 只需生成代码和必要的注释，不需要其他的说明

需求描述：${prompt}`
                    }],
                    temperature: 0.3,
                    stream: true
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    responseType: 'stream',
                    timeout: 120000
                }
            );

            let buffer = '';
            const stream = response.data;

            for await (const chunk of stream) {
                buffer += chunk.toString();
                
                while (true) {
                    const lineEnd = buffer.indexOf('\n');
                    if (lineEnd === -1) break;

                    const line = buffer.slice(0, lineEnd).trim();
                    buffer = buffer.slice(lineEnd + 1);

                    if (line.startsWith('data: ')) {
                        try {
                            const data: DeepSeekResponseChunk = JSON.parse(line.slice(6));
                            if (data.error) {
                                throw new Error(data.error.message);
                            }
                            if (data.choices[0].delta.content) {
                                yield data.choices[0].delta.content;
                            }
                        } catch (e) {
                            console.error('流数据解析错误:', e);
                        }
                    }
                }
            }
            return;

        } catch (error) {
            if (attempt === maxRetries - 1) throw error;

            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status === 429) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            throw error;
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('unreal-ai.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: '请输入DeepSeek API密钥',
            password: true,
            ignoreFocusOut: true
        });

        if (key) {
            await context.secrets.store('deepseekApiKey', key);
            vscode.window.showInformationMessage('API密钥已安全存储');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('unreal-ai.generate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('请先打开代码文件');
            return;
        }

        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('请先选中功能描述文本');
            return;
        }

        try {
            const apiKey = await getApiKey(context);
            if (!apiKey) return;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "AI代码生成中...",
                cancellable: true
            }, async (progress, token) => {
                let fullCode = '';
                const insertionBase = editor.selection.end;
                let currentPosition = insertionBase;

                // 插入初始注释并预留空行
                await editor.edit(editBuilder => {
                    const header = `\n// AI生成代码 - ${new Date().toLocaleString()}\n\n`;
                    editBuilder.insert(insertionBase, header);
                    currentPosition = insertionBase.translate(2); // 下移两行到空行位置
                });

                const codeStream = generateCodeStream(selectedText, apiKey);

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
                    progress.report({ message: `已生成 ${fullCode.length} 字符` });
                }

                // 确保最后有空行
                await editor.edit(editBuilder => {
                    editBuilder.insert(currentPosition, "\n");
                });
            });

        } catch (error) {
            let message = '未知错误';
            if (error instanceof Error) message = error.message;
            vscode.window.showErrorMessage(`代码生成失败: ${message}`);
            console.error('[Unreal AI]', error);
        }
    }));
}

export function deactivate() {}