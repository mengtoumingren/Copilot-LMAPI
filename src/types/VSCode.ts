/**
 * VS Code 语言模型 API 类型扩展
 * VS Code LM API 集成的扩展类型定义
 */

import * as vscode from 'vscode';

export interface ExtendedLanguageModelChatMessage extends vscode.LanguageModelChatMessage {
    role: vscode.LanguageModelChatMessageRole;
    content: (vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart | vscode.LanguageModelToolCallPart)[];
}

export interface ModelSelectionCriteria {
    vendor?: string;
    family?: string;
    version?: string;
    id?: string;
}

export interface CopilotModelInfo {
    id: string;
    family: string;
    vendor: string;
    maxInputTokens: number;
    available: boolean;
}

export interface ServerConfig {
    port: number;
    host: string;
    autoStart: boolean;
    enableLogging: boolean;
    maxConcurrentRequests: number;
    requestTimeout: number;
}

export interface ServerState {
    isRunning: boolean;
    port?: number;
    host?: string;
    startTime?: Date;
    requestCount: number;
    errorCount: number;
    activeConnections: number;
}

export interface RequestMetrics {
    id: string;
    method: string;
    url: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    statusCode?: number;
    error?: string;
    tokens?: {
        input: number;
        output: number;
    };
}

export interface LogEntry {
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    timestamp: Date;
    context?: Record<string, any>;
    requestId?: string;
}

// OpenAI 到 VS Code 兼容性的模型映射
export const MODEL_MAPPING: Record<string, ModelSelectionCriteria> = {
    'gpt-4o': { vendor: 'copilot', family: 'gpt-4o' },
    'gpt-4o-mini': { vendor: 'copilot', family: 'gpt-4o-mini' },
    'gpt-4': { vendor: 'copilot', family: 'gpt-4' },
    'gpt-4-turbo': { vendor: 'copilot', family: 'gpt-4-turbo' },
    'gpt-3.5-turbo': { vendor: 'copilot', family: 'gpt-3.5-turbo' },
    'claude-3.5-sonnet': { vendor: 'copilot', family: 'claude-3.5-sonnet' },
    'claude-3-haiku': { vendor: 'copilot', family: 'claude-3-haiku' },
    'claude-3-sonnet': { vendor: 'copilot', family: 'claude-3-sonnet' },
    'claude-3-opus': { vendor: 'copilot', family: 'claude-3-opus' }
};

// VS Code LM API 失败时可用的默认模型
export const DEFAULT_MODELS: CopilotModelInfo[] = [
    {
        id: 'gpt-4o',
        family: 'gpt-4o',
        vendor: 'copilot',
        maxInputTokens: 128000,
        available: true
    },
    {
        id: 'gpt-4o-mini',
        family: 'gpt-4o-mini',
        vendor: 'copilot',
        maxInputTokens: 128000,
        available: true
    },
    {
        id: 'claude-3.5-sonnet',
        family: 'claude-3.5-sonnet',
        vendor: 'copilot',
        maxInputTokens: 200000,
        available: true
    }
];

export interface VSCodeLMResponse {
    text: AsyncIterable<string>;
    stream?: AsyncIterable<string>;
}

export interface ConversionContext {
    requestId: string;
    model: string;
    isStream: boolean;
    startTime: Date;
    clientIP?: string;
    userAgent?: string;
}