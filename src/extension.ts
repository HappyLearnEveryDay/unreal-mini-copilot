// extension.ts
import * as vscode from 'vscode';
import axios from 'axios';
import { Readable } from 'stream';
import { EditorService } from './services/editor-service';
import { DeepSeekClient } from './api/deepseek-client';

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
        const editor = EditorService.validateEditor();
        if (!editor) return;

        const selectedText = await EditorService.validateSelection(editor);
        if (!selectedText) return;

        try {
            const apiKey = await getApiKey(context);
            if (!apiKey) return;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "AI代码生成中...",
                cancellable: true
            }, async (_progress, token) => {
                const promptTemplate = `你是一个专业的虚幻引擎C++开发者，根据以下需求生成高质量代码。要求：
1. 严格遵循虚幻引擎代码规范
2. 补充必要注释（特别是UE特有的宏和反射声明）
3. 使用现代C++特性（智能指针、移动语义等）
4. 完善处理边界情况
5. 仅生成新增代码，禁止重复现有内容
6. 代码需直接插入在以下上下文末尾，保持连贯性

现有上下文代码：
\`\`\`
${selectedText}
\`\`\`

请生成可直接插入到上述代码末尾的新代码：`;

                const client = new DeepSeekClient(apiKey);
                const codeStream = client.generateCodeStream(promptTemplate);

                await EditorService.insertStreamContent(editor, codeStream, token);
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