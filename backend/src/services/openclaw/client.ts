import axios from 'axios';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface OpenClawStatus {
    enabled: boolean;
    configured: boolean;
    baseUrl: string;
    model: string;
    hasAuthToken: boolean;
    transport: string;
}

export interface OpenClawRunResult {
    raw: any;
    text: string;
}

export interface OpenClawProbeResult {
    ok: boolean;
    endpoint: string;
    detail: string;
    transport: string;
}

function getBaseUrl(): string {
    return (process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:4010').replace(/\/+$/, '');
}

function getModel(): string {
    return process.env.OPENCLAW_MODEL || 'openclaw';
}

function getTransport(): string {
    return (process.env.OPENCLAW_TRANSPORT || 'http').trim().toLowerCase();
}

function getOllamaBaseUrl(): string {
    return (process.env.OPENCLAW_OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

function getOllamaModel(): string {
    return process.env.OPENCLAW_OLLAMA_MODEL || 'gemma4:e4b';
}

function getOpenRouterBaseUrl(): string {
    return (process.env.OPENCLAW_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function getOpenRouterModel(): string {
    return process.env.OPENCLAW_OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
}

function getOpenAIBaseUrl(): string {
    return (process.env.OPENCLAW_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function getOpenAIModel(): string {
    return process.env.OPENCLAW_OPENAI_MODEL || 'gpt-4.1-mini';
}

function getGeminiModel(): string {
    return process.env.OPENCLAW_GEMINI_MODEL || 'gemini-2.0-flash';
}

function shouldFallback(error: unknown): boolean {
    return error instanceof Error;
}

export function getOpenClawStatus(): OpenClawStatus {
    const enabled = (process.env.OPENCLAW_ENABLED || 'false').toLowerCase() === 'true';
    const baseUrl = getBaseUrl();
    const model = getModel();
    const hasAuthToken = Boolean(process.env.OPENCLAW_AUTH_TOKEN);
    const transport = getTransport();

    return {
        enabled,
        configured: enabled && Boolean(baseUrl),
        baseUrl,
        model,
        hasAuthToken,
        transport
    };
}

function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (process.env.OPENCLAW_AUTH_TOKEN) {
        headers.Authorization = `Bearer ${process.env.OPENCLAW_AUTH_TOKEN}`;
    }

    return headers;
}

function describeAxiosError(error: any, fallbackMessage: string): string {
    if (error?.code === 'ECONNABORTED') {
        return `${fallbackMessage} timed out while waiting for OpenClaw.`;
    }

    if (error?.response?.status) {
        const status = error.response.status;
        const detail = typeof error.response.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response.data);
        return `${fallbackMessage} returned HTTP ${status}: ${detail}`;
    }

    if (typeof error?.message === 'string' && error.message.trim()) {
        return `${fallbackMessage} failed: ${error.message.trim()}`;
    }

    return fallbackMessage;
}

function extractTextFromResponse(payload: any): string {
    if (!payload) return '';

    if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    if (Array.isArray(payload.output)) {
        const textParts = payload.output.flatMap((item: any) => {
            if (Array.isArray(item?.content)) {
                return item.content
                    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
                    .filter(Boolean);
            }
            return [];
        });

        if (textParts.length > 0) {
            return textParts.join('\n').trim();
        }
    }

    if (typeof payload.response === 'string') {
        return payload.response.trim();
    }

    return '';
}

export async function probeOpenClaw(): Promise<OpenClawProbeResult> {
    const status = getOpenClawStatus();

    if (!status.enabled) {
        return {
            ok: false,
            endpoint: `${status.baseUrl}/v1/models`,
            detail: 'OpenClaw integration is disabled.',
            transport: status.transport
        };
    }

    if (status.transport === 'ollama-direct') {
        try {
            await axios.get(`${getOllamaBaseUrl()}/api/tags`, { timeout: 10000 });
            return {
                ok: true,
                endpoint: `${getOllamaBaseUrl()}/api/tags`,
                detail: `Direct Ollama fallback is reachable for model ${getOllamaModel()}.`,
                transport: status.transport
            };
        } catch (error: any) {
            return {
                ok: false,
                endpoint: `${getOllamaBaseUrl()}/api/tags`,
                detail: describeAxiosError(error, 'Direct Ollama fallback'),
                transport: status.transport
            };
        }
    }

    if (status.transport === 'openrouter-direct') {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return {
                ok: false,
                endpoint: `${getOpenRouterBaseUrl()}/models`,
                detail: 'OPENROUTER_API_KEY is missing for openrouter-direct transport.',
                transport: status.transport
            };
        }

        try {
            await axios.get(`${getOpenRouterBaseUrl()}/models`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            return {
                ok: true,
                endpoint: `${getOpenRouterBaseUrl()}/models`,
                detail: `OpenRouter direct transport is reachable for model ${getOpenRouterModel()}.`,
                transport: status.transport
            };
        } catch (error: any) {
            return {
                ok: false,
                endpoint: `${getOpenRouterBaseUrl()}/models`,
                detail: describeAxiosError(error, 'OpenRouter direct transport'),
                transport: status.transport
            };
        }
    }

    if (status.transport === 'openai-direct') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return {
                ok: false,
                endpoint: `${getOpenAIBaseUrl()}/models`,
                detail: 'OPENAI_API_KEY is missing for openai-direct transport.',
                transport: status.transport
            };
        }

        try {
            await axios.get(`${getOpenAIBaseUrl()}/models`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            return {
                ok: true,
                endpoint: `${getOpenAIBaseUrl()}/models`,
                detail: `OpenAI direct transport is reachable for model ${getOpenAIModel()}.`,
                transport: status.transport
            };
        } catch (error: any) {
            return {
                ok: false,
                endpoint: `${getOpenAIBaseUrl()}/models`,
                detail: describeAxiosError(error, 'OpenAI direct transport'),
                transport: status.transport
            };
        }
    }

    if (status.transport === 'gemini-direct') {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return {
                ok: false,
                endpoint: 'google-generative-ai',
                detail: 'No Gemini API key is configured for gemini-direct transport.',
                transport: status.transport
            };
        }

        return {
            ok: true,
            endpoint: `google-generative-ai:${getGeminiModel()}`,
            detail: `Gemini direct transport is configured for model ${getGeminiModel()}.`,
            transport: status.transport
        };
    }

    if (status.transport === 'auto-direct') {
        if (process.env.OPENAI_API_KEY) {
            return {
                ok: true,
                endpoint: `${getOpenAIBaseUrl()}/models`,
                detail: `Auto direct transport will try OpenAI (${getOpenAIModel()}) first, then OpenRouter (${getOpenRouterModel()}), then Gemini (${getGeminiModel()}), then Ollama (${getOllamaModel()}).`,
                transport: status.transport
            };
        }

        if (process.env.OPENROUTER_API_KEY) {
            return {
                ok: true,
                endpoint: `${getOpenRouterBaseUrl()}/models`,
                detail: `Auto direct transport will try OpenRouter (${getOpenRouterModel()}) first, then Gemini (${getGeminiModel()}), then Ollama (${getOllamaModel()}).`,
                transport: status.transport
            };
        }

        if (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY) {
            return {
                ok: true,
                endpoint: `google-generative-ai:${getGeminiModel()}`,
                detail: `Auto direct transport will try Gemini (${getGeminiModel()}) first, then Ollama (${getOllamaModel()}).`,
                transport: status.transport
            };
        }

        return {
            ok: true,
            endpoint: `${getOllamaBaseUrl()}/api/tags`,
            detail: `Auto direct transport will use Ollama fallback model ${getOllamaModel()}.`,
            transport: status.transport
        };
    }

    if (status.transport !== 'http') {
        return {
            ok: false,
            endpoint: 'local-cli',
            detail: `OpenClaw transport is set to "${status.transport}", so HTTP probing is skipped.`,
            transport: status.transport
        };
    }

    try {
        await axios.get(`${status.baseUrl}/v1/models`, {
            headers: buildHeaders(),
            timeout: 10000
        });

        return {
            ok: true,
            endpoint: `${status.baseUrl}/v1/models`,
            detail: 'OpenClaw HTTP compatibility endpoint is reachable.',
            transport: status.transport
        };
    } catch (error: any) {
        return {
            ok: false,
            endpoint: `${status.baseUrl}/v1/models`,
            detail: describeAxiosError(error, 'OpenClaw HTTP compatibility endpoint'),
            transport: status.transport
        };
    }
}

async function runDirectOllama(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<OpenClawRunResult> {
    const systemInstructions = messages
        .filter(message => message.role === 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const userPrompt = messages
        .filter(message => message.role !== 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const prompt = [
        systemInstructions ? `System Instructions:\n${systemInstructions}` : '',
        userPrompt ? `User Request:\n${userPrompt}` : ''
    ].filter(Boolean).join('\n\n');

    try {
        const response = await axios.post(
            `${getOllamaBaseUrl()}/api/generate`,
            {
                model: getOllamaModel(),
                prompt,
                stream: false,
                format: 'json',
                options: {
                    num_predict: 512,
                    temperature: 0.1
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            }
        );

        return {
            raw: response.data,
            text: typeof response.data?.response === 'string' ? response.data.response.trim() : ''
        };
    } catch (error: any) {
        throw new Error(describeAxiosError(error, 'Direct Ollama fallback request'));
    }
}

async function runDirectOpenRouter(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<OpenClawRunResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is missing for openrouter-direct transport.');
    }

    const client = new OpenAI({
        apiKey,
        baseURL: getOpenRouterBaseUrl(),
        timeout: 180000,
        defaultHeaders: {
            'HTTP-Referer': 'http://127.0.0.1:3003',
            'X-Title': 'Talent Operations Console'
        }
    });

    try {
        const response = await client.chat.completions.create({
            model: getOpenRouterModel(),
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: messages.map(message => ({
                role: message.role,
                content: message.content
            }))
        });

        return {
            raw: response,
            text: response.choices?.[0]?.message?.content?.trim() || ''
        };
    } catch (error: any) {
        throw new Error(describeAxiosError(error, 'OpenRouter direct request'));
    }
}

async function runDirectOpenAI(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<OpenClawRunResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing for openai-direct transport.');
    }

    const client = new OpenAI({
        apiKey,
        baseURL: getOpenAIBaseUrl(),
        timeout: 180000
    });

    try {
        const response = await client.chat.completions.create({
            model: getOpenAIModel(),
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: messages.map(message => ({
                role: message.role,
                content: message.content
            }))
        });

        return {
            raw: response,
            text: response.choices?.[0]?.message?.content?.trim() || ''
        };
    } catch (error: any) {
        throw new Error(describeAxiosError(error, 'OpenAI direct request'));
    }
}

async function runDirectGemini(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<OpenClawRunResult> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('No Gemini API key is configured for gemini-direct transport.');
    }

    const systemInstructions = messages
        .filter(message => message.role === 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const userPrompt = messages
        .filter(message => message.role !== 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 1024
        }
    });

    const prompt = [
        systemInstructions ? `System Instructions:\n${systemInstructions}` : '',
        userPrompt ? `User Request:\n${userPrompt}` : ''
    ].filter(Boolean).join('\n\n');

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        return {
            raw: result.response,
            text
        };
    } catch (error: any) {
        throw new Error(describeAxiosError(error, 'Gemini direct request'));
    }
}

async function runAutoDirect(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<OpenClawRunResult> {
    const failures: string[] = [];

    if (process.env.OPENAI_API_KEY) {
        try {
            return await runDirectOpenAI(messages);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push(`OpenAI: ${detail}`);
            if (!shouldFallback(error)) throw error;
        }
    }

    if (process.env.OPENROUTER_API_KEY) {
        try {
            return await runDirectOpenRouter(messages);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push(`OpenRouter: ${detail}`);
            if (!shouldFallback(error)) throw error;
        }
    }

    if (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY) {
        try {
            return await runDirectGemini(messages);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push(`Gemini: ${detail}`);
            if (!shouldFallback(error)) throw error;
        }
    }

    try {
        return await runDirectOllama(messages);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`Ollama: ${detail}`);
        throw new Error(`All direct transports failed. ${failures.join(' | ')}`);
    }
}

export async function runOpenClawResponse(messages: Array<{ role: 'system' | 'user'; content: string }>, metadata?: Record<string, string>): Promise<OpenClawRunResult> {
    const status = getOpenClawStatus();

    if (!status.enabled) {
        throw new Error('OpenClaw integration is disabled. Set OPENCLAW_ENABLED=true in backend/.env.');
    }

    if (status.transport === 'ollama-direct') {
        return runDirectOllama(messages);
    }

    if (status.transport === 'openrouter-direct') {
        return runDirectOpenRouter(messages);
    }

    if (status.transport === 'openai-direct') {
        return runDirectOpenAI(messages);
    }

    if (status.transport === 'gemini-direct') {
        return runDirectGemini(messages);
    }

    if (status.transport === 'auto-direct') {
        return runAutoDirect(messages);
    }

    if (status.transport !== 'http') {
        throw new Error(`OpenClaw transport "${status.transport}" is not implemented in the backend yet. Use OPENCLAW_TRANSPORT=http, ollama-direct, openai-direct, openrouter-direct, gemini-direct, or auto-direct.`);
    }

    const systemInstructions = messages
        .filter(message => message.role === 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    const input = messages
        .filter(message => message.role !== 'system')
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n');

    let response;
    try {
        response = await axios.post(
            `${status.baseUrl}/v1/responses`,
            {
                model: status.model,
                input,
                instructions: systemInstructions || undefined,
                metadata: metadata || {},
                reasoning: { effort: 'medium' }
            },
            {
                headers: {
                    ...buildHeaders(),
                    'x-openclaw-agent-id': 'main'
                },
                timeout: 180000
            }
        );
    } catch (error: any) {
        throw new Error(describeAxiosError(error, 'OpenClaw response request'));
    }

    return {
        raw: response.data,
        text: extractTextFromResponse(response.data)
    };
}
