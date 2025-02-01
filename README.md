# Unreal Mini Copilot

三个文件通过以下流程进行交互，共同实现VS Code扩展的AI代码生成功能：

## 用户交互层 (extension.ts)

注册两个VS Code命令：

- `setApiKey`：通过SecretStorage安全存储API密钥
- `generate`：核心生成命令

调用EditorService进行编辑器验证

协调DeepSeekClient和EditorService的工作流

## AI服务层 (deepseek-client.ts)

DeepSeekClient类处理：

- 构建符合DeepSeek API要求的请求格式
- 实现带指数退避的重试机制（最大3次重试）
- 使用SSE(Server-Sent Events)处理流式响应
- 将API响应转换为AsyncGenerator<string>

## 编辑器服务层 (editor-service.ts)

EditorService提供：

- 编辑器状态验证（是否打开文件/选中文本）
- 流式内容插入功能
- 智能光标位置计算
- 错误状态提示（取消/错误信息插入）

## 完整工作流程

1. 用户执行`unreal-ai.generate`命令
2. EditorService验证编辑器和选中文本有效性
3. 通过VS Code的SecretStorage获取API密钥
4. DeepSeekClient发送结构化请求到DeepSeek API：

    ```json
    {
      "model": "deepseek-chat",
      "messages": [{
        "role": "user",
        "content": "专业虚幻引擎C++开发要求...${prompt}"
      }],
      "temperature": 0.3,
      "stream": true
    }
    ```

5. 处理流式响应时：

    - 按`data:`前缀解析JSON数据
    - 通过AsyncGenerator逐块yield代码内容

6. EditorService实时插入代码：

    - 初始插入生成时间注释
    - 按chunk更新编辑器内容
    - 自动计算光标位置（支持多行插入）
    - 处理取消请求时插入终止标记

## 异常处理

- 429错误自动重试（1000/2000/4000ms退避）
- 网络错误/API错误显示友好提示
- 编辑操作错误插入代码注释提示

## 关键交互点

- `extension.ts`作为中枢协调数据和状态流转
- 异步生成器(AsyncGenerator)实现流式处理
- 编辑器操作全部通过`editBuilder`原子操作保证线程安全
- 进度通知与取消令牌集成VS Code原生API