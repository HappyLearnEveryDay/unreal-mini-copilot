import * as vscode from 'vscode';
import axios from 'axios';

// 定义API响应类型
interface DeepSeekResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
    error?: {
        message: string;
    };
}

// 安全获取API密钥
async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const key = await context.secrets.get('deepseekApiKey');
    if (!key) {
        vscode.window.showErrorMessage('请先设置DeepSeek API密钥');
        return undefined;
    }
    return key;
}

// AI代码生成函数
async function generateCode(prompt: string, apiKey: string): Promise<string> {
    const maxRetries = 5;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.post<DeepSeekResponse>(
                'https://api.deepseek.com/v1/chat/completions',
                {
                    //model: "deepseek-coder-33b-instruct",
					model: "deepseek-chat",
                    messages: [{
                        role: "user",
                        content: `你是一个专业的虚幻引擎C++开发者，根据以下需求生成高质量代码。要求：
1. 符合虚幻引擎代码规范
2. 包含必要的注释
3. 使用现代C++特性
4. 处理边界情况

需求描述：${prompt}`
                    }],
                    temperature: 0.3
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    timeout: 200000
                }
            );

            if (response.data.error) {
                throw new Error(response.data.error.message);
            }

            return response.data.choices[0].message.content;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as axios.AxiosError;
                const status = axiosError.response?.status;
                const data = axiosError.response?.data as DeepSeekResponse;
                const message = data?.error?.message || axiosError.message;

                if (status === 429 && attempt < maxRetries - 1) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.warn(`Rate limit exceeded. Retrying in ${waitTime / 1000} seconds...`);
                    await delay(waitTime);
                    continue;
                }

                throw new Error(`API请求失败 (${status}): ${message}`);
            }
            throw error;
        }
    }

    throw new Error('API请求失败: 超过最大重试次数');
}

export function activate(context: vscode.ExtensionContext) {
    // 注册设置API密钥命令
    context.subscriptions.push(vscode.commands.registerCommand('unreal-ai.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: '请输入DeepSeek API密钥',
            password: true,
            ignoreFocusOut: true
        });

        if (key) {
            await context.secrets.store('deepseekApiKey', key);
            vscode.window.showInformationMessage('API密钥已安全存储');
            console.log(`API密钥: ${key}`);
        }
    }));

    // 注册生成命令
    const generateCommand = vscode.commands.registerCommand('unreal-ai.generate', async () => {
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
            if (!apiKey) {return;}

            const generatedCode = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在生成虚幻引擎代码...",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "分析需求中..." });
                const code = await generateCode(selectedText, apiKey);
                progress.report({ message: "代码生成完成" });
                return code;
            });

            await editor.edit(editBuilder => {
                const position = editor.selection.end;
                editBuilder.insert(
                    position,
                    `\n// AI生成代码 - ${new Date().toLocaleString()}\n${generatedCode}\n`
                );
            });

            vscode.window.showInformationMessage('代码已生成并插入到当前位置');
        } catch (error) {
            let message = '未知错误';
            if (error instanceof Error) {
                message = error.message;
                console.error(`[Unreal AI] ${error.stack}`);
            }
            vscode.window.showErrorMessage(`代码生成失败: ${message}`);
        }
    });

    context.subscriptions.push(generateCommand);
}

export function deactivate() {}