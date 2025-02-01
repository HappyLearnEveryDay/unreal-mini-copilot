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
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

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
}
