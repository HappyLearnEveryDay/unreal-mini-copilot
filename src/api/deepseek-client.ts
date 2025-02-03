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

export class DeepSeekClient {
    private readonly maxRetries = 3;
    private readonly baseDelay = 1000;

    constructor(private apiKey: string) {}

    async *generateCodeStream(prompt: string): AsyncGenerator<string> {
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
                            content: prompt
                        }],
                        temperature: 0.3,
                        stream: true
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
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

    async *processEntireFileStream(fileContent: string): AsyncGenerator<string> {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await axios.post<Readable>(
                    'https://api.deepseek.com/v1/chat/completions',
                    {
                        model: "deepseek-chat",
                        messages: [{
                            role: "user",
                            content: `请重构并优化以下完整代码文件，保持代码风格一致，严格遵循以下要求：
1. 保持原有文件结构和导入语句
2. 优化代码逻辑和性能
3. 补充注释
4. 保持现有API兼容性
5. 返回完整的文件内容（包含所有已有代码）
6.识别文件中的指令

当前文件内容：
\`\`\`
${fileContent}
\`\`\`

请直接返回重构后的完整文件内容：`
                        }],
                        temperature: 0.2,
                        stream: true
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
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
                                if (data.error) throw new Error(data.error.message);
                                if (data.choices[0].delta.content) {
                                    yield data.choices[0].delta.content;
                                }
                            } catch (e) {
                                console.error('流解析错误:', e);
                            }
                        }
                    }
                }
                return;

            } catch (error) {
                if (attempt === this.maxRetries - 1) throw error;
                if (axios.isAxiosError(error) && error.response?.status === 429) {
                    const delay = this.baseDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
    }
}