import * as vscode from 'vscode';
import { DeepSeekClient } from './api/deepseek-client';
import { EditorService } from './services/edior-service';

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const key = await context.secrets.get('deepseekApiKey');
    if (!key) {
        vscode.window.showErrorMessage('请先设置DeepSeek API密钥');
        return undefined;
    }
    return key;
}

export function activate(context: vscode.ExtensionContext) {
    // 注册设置API密钥命令
    context.subscriptions.push(vscode.commands.registerCommand(
        'unreal-ai.setApiKey',
        async () => {
            const key = await vscode.window.showInputBox({
                prompt: '请输入DeepSeek API密钥',
                password: true,
                ignoreFocusOut: true
            });

            if (key) {
                await context.secrets.store('deepseekApiKey', key);
                vscode.window.showInformationMessage('API密钥已安全存储');
            }
        }
    ));

    // 注册生成代码命令
    context.subscriptions.push(vscode.commands.registerCommand(
        'unreal-ai.generate',
        async () => {
            try {
                const editor = EditorService.validateEditor();
                if (!editor) return;

                const selectedText = EditorService.validateSelection(editor);
                if (!selectedText) return;

                const apiKey = await getApiKey(context);
                if (!apiKey) return;

                const client = new DeepSeekClient(apiKey);
                const stream = client.generateCodeStream(selectedText);

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "AI代码生成中...",
                    cancellable: true
                }, async (progress, token) => {
                    await EditorService.insertStreamContent(editor, stream, token);
                });

            } catch (error) {
                let message = '未知错误';
                if (error instanceof Error) message = error.message;
                vscode.window.showErrorMessage(`代码生成失败: ${message}`);
                console.error('[Unreal AI]', error);
            }
        }
    ));
}

export function deactivate() {}