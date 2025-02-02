import * as vscode from 'vscode';
import axios from 'axios';
import { Readable } from 'stream';
import { EditorService } from './services/editor-service';
import { DeepSeekClient } from './api/deepseek-client';
import { FileReplaceService } from './services/file-replace-service';


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

        try {
            // 并行处理API请求和动画
            const [selectedText, apiKey] = await Promise.all([
                EditorService.validateSelection(editor),
                getApiKey(context)
            ]);

            if (!selectedText || !apiKey) return;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "AI代码生成中...",
                cancellable: true
            }, async (_progress, token) => {
                // 创建客户端并开始请求（在动画播放时就开始）
                const client = new DeepSeekClient(apiKey);
                const promptTemplate = `你是一个专业的虚幻引擎C++开发者，根据以下需求生成高质量代码。要求：
1. 严格遵循虚幻引擎代码规范（UCLASS/UPROPERTY等宏使用）
2. 补充必要注释（包括函数功能、参数说明、注意事项）
3. 使用现代C++特性（智能指针、移动语义、Lambda表达式）
4. 完善处理边界情况（空指针、无效输入、资源释放）
5. 仅生成新增代码，禁止重复现有内容
6. 保持代码风格与上下文一致

现有上下文代码：
\`\`\`cpp
${selectedText}
\`\`\`

请生成可直接插入在文件末尾的新代码：`;

                const codeStream = client.generateCodeStream(promptTemplate);
                
                // 确保代码在动画完成后插入
                await EditorService.insertStreamContent(editor, codeStream, token);
            });

        } catch (error) {
            let message = '未知错误';
            if (error instanceof Error) message = error.message;
            vscode.window.showErrorMessage(`代码生成失败: ${message}`);
            console.error('[Unreal AI]', error);
        }
    }));
    // 修改后的optimizeFile命令
context.subscriptions.push(vscode.commands.registerCommand('unreal-ai.optimizeFile', async () => {
    const editor = EditorService.validateEditor();
    if (!editor) return;

    try {
        const [apiKey, fullContent] = await Promise.all([
            getApiKey(context),
            editor.document.getText()
        ]);

        if (!apiKey) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "全文件优化中...",
            cancellable: true
        }, async (progress, token) => {
            // 添加进度提示
            progress.report({ message: "正在连接DeepSeek API..." });
            
            const client = new DeepSeekClient(apiKey);
            const codeStream = client.processEntireFileStream(fullContent);
            
            // 初始化进度
            progress.report({ increment: 10, message: "开始重构文件内容..." });
            
            // 添加取消按钮处理
            token.onCancellationRequested(() => {
                vscode.window.showWarningMessage('用户取消了重构操作');
            });

            await FileReplaceService.replaceEntireFile(editor, codeStream, token);
            
            // 完成进度
            progress.report({ increment: 100 });
        });

        vscode.window.showInformationMessage('文件优化完成！');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        vscode.window.showErrorMessage(`文件优化失败: ${errorMessage}`);
        console.error('[Unreal AI]', error);
    }
}));
    
}

export function deactivate() {}