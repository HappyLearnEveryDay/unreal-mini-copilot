// deepseek-client.ts
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
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await axios.post<Readable>(
                    'https://api.deepseek.com/v1/chat/completions',
                    this.buildRequestData(prompt),
                    this.buildRequestConfig()
                );

                yield* this.handleResponseStream(response.data as unknown as Readable);
                return;

            } catch (error) {
                if (attempt === this.maxRetries - 1) throw error;
                await this.handleRetry(error, attempt);
            }
        }
    }

    private buildRequestData(prompt: string) {
        return {
            model: "deepseek-chat",
            messages: [{
                role: "user",
                content: prompt
            }],
            temperature: 0.3,
            stream: true
        };
    }

    private buildRequestConfig() {
        return {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            responseType: 'stream' as const,
            timeout: 120000
        };
    }

    private async *handleResponseStream(stream: Readable) {
        let buffer = '';
        
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
                        console.error('流数据解析错误:', e);
                    }
                }
            }
        }
    }

    private async handleRetry(error: unknown, attempt: number) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 429) {
                const delay = this.baseDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                return;
            }
        }
        throw error;
    }
}