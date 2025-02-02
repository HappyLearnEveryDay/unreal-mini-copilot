# Unreal Mini Copilot

VSCode扩展，基于DeepSeek API为虚幻引擎C++开发提供智能代码生成功能。

## 功能特点

- 💡 智能代码生成：基于上下文生成符合虚幻引擎规范的C++代码
- 🔄 文件优化：一键优化整个文件的代码结构和质量
- 🌊 流式响应：实时展示生成过程
- 🎨 动画效果：优雅的代码选择和生成动画
- ⚡ 快捷键支持：多个快捷操作方式

## 快捷键

- `Ctrl+Alt+G`: 生成代码
- `Ctrl+Alt+O`: 优化当前文件

## 核心文件结构

```
src/
├── api/
│   └── deepseek-client.ts   # DeepSeek API 客户端
├── services/
│   ├── editor-service.ts    # 编辑器服务
│   └── file-replace-service.ts # 文件替换服务
└── extension.ts             # 扩展入口
```

### 文件说明

#### extension.ts
- 扩展主入口
- 注册命令：`unreal-ai.generate` 和 `unreal-ai.setApiKey`
- 协调API调用和编辑器操作
- 处理API密钥的安全存储

#### api/deepseek-client.ts
- DeepSeek API的封装
- 支持流式响应
- 实现指数退避重试机制
- 错误处理和响应解析

#### services/editor-service.ts
- 编辑器操作封装
- 文本选择和动画效果
- 代码插入和格式化
- 光标位置管理

## 使用方法

1. 安装扩展后，首先设置DeepSeek API密钥：
   - 命令面板中输入 "Set DeepSeek API Key"
   - 输入并保存API密钥

2. 生成代码：
   - 选中需要补充代码的上下文
   - 按下 `Ctrl+Alt+G` 或使用命令面板执行 "Generate Code"
   - 等待代码生成完成

3. 优化文件：
   - 打开要优化的文件
   - 按下 `Ctrl+Alt+O` 或使用命令面板执行 "Optimize Current File"
   - 等待优化完成，过程中可以看到实时更新

## 代码生成规范

生成的代码将遵循以下规范：
- 严格符合虚幻引擎代码规范
- 包含UE特有的宏和反射声明
- 使用现代C++特性
- 包含必要的注释
- 处理边界情况
- 保持与上下文代码风格一致

## 开发说明

### 环境要求
- Node.js
- VS Code
- TypeScript

### 本地开发
```bash
git clone <repository-url>
cd unreal-mini-copilot
npm install
code .
```

按F5启动调试即可。

### 构建扩展
```bash
npm run compile
vsce package
```

## 注意事项

- 需要有效的DeepSeek API密钥
- 建议在生成大量代码时使用流式响应
- 可以随时通过ESC键取消代码生成

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