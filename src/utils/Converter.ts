/**
 * 🎨 增强型多模态转换器
 * OpenAI API 与 VS Code LM API 之间的革命性转换
 * ✨ 完全支持图像、函数和动态模型！
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { 
    EnhancedMessage, 
    ModelCapabilities, 
    EnhancedRequestContext,
    ToolCall,
    FunctionDefinition 
} from '../types/ModelCapabilities';
import { 
    OpenAICompletionResponse, 
    OpenAIStreamResponse, 
    OpenAIModelsResponse,
    OpenAIModel
} from '../types/OpenAI';
import { logger } from './Logger';

export class Converter {
    
    /**
     * 🎨 将增强消息转换为 VS Code LM API 格式
     * ✨ 支持图像和多模态内容！
     */
    public static async convertMessagesToVSCode(
        messages: EnhancedMessage[], 
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage[]> {
        const vsCodeMessages: vscode.LanguageModelChatMessage[] = [];
        
        for (const message of messages) {
            try {
                const vsCodeMessage = await this.convertSingleMessage(message, selectedModel);
                if (vsCodeMessage) {
                    vsCodeMessages.push(vsCodeMessage);
                }
            } catch (error) {
                logger.error(`转换消息失败：`, error as Error, { message });
                // 回退到仅文本内容
                if (typeof message.content === 'string') {
                    vsCodeMessages.push(new vscode.LanguageModelChatMessage(
                        this.mapRoleToVSCode(message.role),
                        this.formatRolePrefix(message.role) + message.content
                    ));
                }
            }
        }
        
        return vsCodeMessages;
    }
    
    /**
     * 📋 转换单个增强消息
     */
    private static async convertSingleMessage(
        message: EnhancedMessage, 
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage | null> {
        
        // 处理简单文本消息
        if (typeof message.content === 'string') {
            return new vscode.LanguageModelChatMessage(
                this.mapRoleToVSCode(message.role),
                this.formatRolePrefix(message.role) + message.content
            );
        }
        
        // 处理复杂的多模态内容
        if (Array.isArray(message.content)) {
            return await this.convertMultimodalMessage(message, selectedModel);
        }
        
        return null;
    }
    
    /**
     * 🖼️ 转换带图像的多模态消息
     */
    private static async convertMultimodalMessage(
        message: EnhancedMessage,
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage | null> {
        
        if (!Array.isArray(message.content)) {
            return null;
        }
        
    const contentParts: any[] = [];
        let textContent = this.formatRolePrefix(message.role);
        
        for (const part of message.content) {
            if (part.type === 'text' && part.text) {
                textContent += part.text;
                
            } else if (part.type === 'image_url' && part.image_url) {
                
                // 🔥 革命性：如果模型支持视觉则处理图像！
                if (selectedModel.supportsVision) {
                    try {
                        const imageContent = await this.processImageContent(part.image_url.url);
                        if (imageContent) {
                            // 如果我们有二进制数据（来自 data URI 或本地文件），则创建 LanguageModelDataPart 并加入内容
                            if (imageContent.data && imageContent.mimeType) {
                                const buffer = Buffer.from(imageContent.data, 'base64');
                                try {
                                    const DataPartCtor = (vscode as any).LanguageModelDataPart;
                                    if (DataPartCtor) {
                                        contentParts.push(new DataPartCtor(buffer, imageContent.mimeType));
                                    } else {
                                        // 如果运行时没有该构造器，退回到文本占位
                                        textContent += `\n[Image: ${imageContent.description}]\n`;
                                    }
                                } catch (e) {
                                    // 如果创建 DataPart 失败，退回到文本占位
                                    logger.warn('无法创建 LanguageModelDataPart，退回文本占位：', e as Error);
                                    textContent += `\n[Image: ${imageContent.description}]\n`;
                                }
                            } else {
                                // 无二进制数据，仅添加描述文本（例如远程 URL）
                                textContent += `\n[Image: ${imageContent.description}]\n`;
                            }
                        }
                    } catch (error) {
                        logger.warn(`处理图像失败：`, error as Error);
                        textContent += `\n[Image: ${part.image_url.url}]\n`;
                    }
                } else {
                    logger.warn(`模型 ${selectedModel.id} 不支持视觉，跳过图像`);
                    textContent += `\n[所选模型不支持图像]\n`;
                }
            }
        }
        
        // 如果仍有文本内容（或者没有直接添加 DataPart），则添加文本部分
        if (textContent && textContent.trim().length > 0) {
            contentParts.push(new vscode.LanguageModelTextPart(textContent));
        }
        
        // 使用正确的角色映射创建消息
        return new vscode.LanguageModelChatMessage(
            this.mapRoleToVSCode(message.role),
            contentParts
        );
    }
    
    /**
     * 🖼️ 处理图像内容（Base64、URL 或文件路径）
     */
    private static async processImageContent(imageUrl: string): Promise<{ description: string; data?: string; mimeType?: string } | null> {
        try {
            // 处理不同的图像源
            if (imageUrl.startsWith('data:image/')) {
                // Base64 编码图像
                const [header, data] = imageUrl.split(',');
                const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                return {
                    description: `Base64 ${mimeType} image`,
                    data: data,
                    mimeType
                };
                
            } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                // URL 图像 - 出于安全考虑，我们只记录它
                return {
                    description: `Remote image from ${new URL(imageUrl).hostname}`
                };
                
            } else if (imageUrl.startsWith('file://') || await this.fileExists(imageUrl)) {
                // 本地文件
                const filePath = imageUrl.startsWith('file://') ? imageUrl.slice(7) : imageUrl;
                const ext = path.extname(filePath).toLowerCase();
                const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                
                if (supportedFormats.includes(ext)) {
                    try {
                        const stats = await fs.promises.stat(filePath);
                        // 尝试读取为 base64，以便上层可以直接创建 DataPart
                        try {
                            const buf = await fs.promises.readFile(filePath);
                            const mimeType = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : `image/${ext.slice(1)}`);
                            return {
                                description: `Local ${ext.slice(1)} image (${(stats.size / 1024).toFixed(1)}KB)`,
                                data: buf.toString('base64'),
                                mimeType
                            };
                        } catch (readErr) {
                            return {
                                description: `Local ${ext.slice(1)} image (${(stats.size / 1024).toFixed(1)}KB)`
                            };
                        }
                    } catch (error) {
                        return {
                            description: `Local ${ext.slice(1)} image (size unknown)`
                        };
                    }
                }
            }
            
            return null;
        } catch (error) {
            logger.error('Error processing image:', error as Error);
            return null;
        }
    }
    
    /**
     * 🔄 将 OpenAI 角色映射到 VS Code 角色
     */
    private static mapRoleToVSCode(role: string): vscode.LanguageModelChatMessageRole {
        switch (role) {
            case 'system':
            case 'user':
                return vscode.LanguageModelChatMessageRole.User;
            case 'assistant':
                return vscode.LanguageModelChatMessageRole.Assistant;
            default:
                return vscode.LanguageModelChatMessageRole.User;
        }
    }
    
    /**
     * 🏷️ 为内容格式化角色前缀
     */
    private static formatRolePrefix(role: string): string {
        switch (role) {
            case 'system':
                return 'System: ';
            case 'assistant':
                return 'Assistant: ';
            case 'user':
            default:
                return '';
        }
    }
    
    /**
     * 📝 创建增强完成响应
     */
    public static createCompletionResponse(
        content: string,
        context: EnhancedRequestContext,
        selectedModel: ModelCapabilities
    ): OpenAICompletionResponse {
        const now = Math.floor(Date.now() / 1000);
        
        return {
            id: `chatcmpl-${context.requestId}`,
            object: 'chat.completion',
            created: now,
            model: context.model, // 使用请求的模型名称
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: context.estimatedTokens,
                completion_tokens: this.estimateTokens(content),
                total_tokens: context.estimatedTokens + this.estimateTokens(content)
            },
            system_fingerprint: `vs-code-${selectedModel.vendor}-${selectedModel.family}`
        };
    }
    
    /**
     * 🌊 创建增强流式响应块
     */
    public static createStreamChunk(
        content: string,
        context: EnhancedRequestContext,
        selectedModel: ModelCapabilities,
        isFirst: boolean = false,
        isLast: boolean = false
    ): OpenAIStreamResponse {
        const now = Math.floor(Date.now() / 1000);
        
        const chunk: OpenAIStreamResponse = {
            id: `chatcmpl-${context.requestId}`,
            object: 'chat.completion.chunk',
            created: now,
            model: context.model, // 使用请求的模型名称
            choices: [{
                index: 0,
                delta: {},
                finish_reason: isLast ? 'stop' : null
            }],
            system_fingerprint: `vs-code-${selectedModel.vendor}-${selectedModel.family}`
        };
        
        if (isFirst) {
            chunk.choices[0].delta.role = 'assistant';
        }
        
        if (content) {
            chunk.choices[0].delta.content = content;
        }
        
        return chunk;
    }
    
    /**
     * 📋 创建动态模型响应
     */
    public static createModelsResponse(availableModels: ModelCapabilities[]): OpenAIModelsResponse {
        const now = Math.floor(Date.now() / 1000);
        
        const models: OpenAIModel[] = availableModels.map(model => ({
            id: model.id,
            object: 'model',
            created: now,
            owned_by: model.vendor || 'vs-code',
            // 添加关于能力的自定义元数据
            permission: [{
                id: `perm-${model.id}`,
                object: 'model_permission',
                created: now,
                allow_create_engine: false,
                allow_sampling: true,
                allow_logprobs: false,
                allow_search_indices: false,
                allow_view: true,
                allow_fine_tuning: false,
                organization: model.vendor || 'vs-code',
                is_blocking: false
            }]
        }));
        
        return {
            object: 'list',
            data: models
        };
    }
    
    /**
     * 🌊 从带有增强上下文的 VS Code LM 响应流中提取内容
     */
    public static async *extractStreamContent(
        response: vscode.LanguageModelChatResponse,
        context: EnhancedRequestContext,
        selectedModel: ModelCapabilities
    ): AsyncGenerator<string> {
        let isFirst = true;
        
        try {
            for await (const chunk of response.text) {
                if (chunk) {
                    yield this.createSSEEvent('data', this.createStreamChunk(
                        chunk,
                        context,
                        selectedModel,
                        isFirst,
                        false
                    ));
                    isFirst = false;
                }
            }
            
            // 发送最终块
            yield this.createSSEEvent('data', this.createStreamChunk(
                '',
                context,
                selectedModel,
                false,
                true
            ));
            
            // 发送完成信号
            yield this.createSSEEvent('done');
            
        } catch (error) {
            logger.error('增强流提取中出错', error as Error, {}, context.requestId);
            yield this.createSSEEvent('error', {
                message: '增强流处理错误',
                type: 'api_error'
            });
        }
    }
    
    /**
     * 📝 从 VS Code LM 响应中收集所有内容
     */
    public static async collectFullResponse(
        response: vscode.LanguageModelChatResponse
    ): Promise<string> {
        let fullContent = '';
        
        try {
            for await (const chunk of response.text) {
                fullContent += chunk;
            }
        } catch (error) {
            logger.error('收集增强响应时出错', error as Error);
            throw new Error('收集响应内容失败');
        }
        
        return fullContent;
    }
    
    /**
     * 🔄 创建服务器发送事件数据
     */
    public static createSSEEvent(type: 'data' | 'done' | 'error', data?: any): string {
        switch (type) {
            case 'data':
                return `data: ${JSON.stringify(data)}\n\n`;
            case 'done':
                return 'data: [DONE]\n\n';
            case 'error':
                return `data: ${JSON.stringify({ error: data })}\n\n`;
            default:
                return '';
        }
    }
    
    /**
     * 📈 增强令牌估算
     */
    private static estimateTokens(text: string): number {
        // 更精细的令牌估算
        // 考虑不同语言和特殊令牌
        const baseTokens = Math.ceil(text.length / 4);
        const specialTokens = (text.match(/[\n\r\t]/g) || []).length;
        return baseTokens + specialTokens;
    }
    
    /**
     * 🎯 创建增强转换上下文
     */
    public static createEnhancedContext(
        requestId: string,
        modelId: string,
        isStream: boolean,
        messages: EnhancedMessage[],
        selectedModel?: ModelCapabilities,
        clientIP?: string,
        userAgent?: string
    ): EnhancedRequestContext {
        
        // 分析消息内容以获取能力
        const hasImages = messages.some(msg => 
            Array.isArray(msg.content) && 
            msg.content.some(part => part.type === 'image_url')
        );
        
        const hasFunctions = messages.some(msg => 
            msg.tool_calls && msg.tool_calls.length > 0
        );
        
        // 估算总令牌数
        const estimatedTokens = messages.reduce((total, msg) => {
            if (typeof msg.content === 'string') {
                return total + this.estimateTokens(msg.content);
            } else if (Array.isArray(msg.content)) {
                return total + msg.content.reduce((partTotal, part) => {
                    if (part.type === 'text' && part.text) {
                        return partTotal + this.estimateTokens(part.text);
                    }
                    return partTotal + 100; // 图像估算
                }, 0);
            }
            return total;
        }, 0);
        
        // 确定所需能力
        const requiredCapabilities: string[] = [];
        if (hasImages) {
            requiredCapabilities.push('supportsVision');
        }
        if (hasFunctions) {
            requiredCapabilities.push('supportsTools');
        }
        if (isStream) {
            requiredCapabilities.push('supportsStreaming');
        }
        
        return {
            requestId,
            model: modelId,
            isStream,
            startTime: new Date(),
            clientIP,
            userAgent,
            hasImages,
            hasFunctions,
            requiredCapabilities,
            estimatedTokens,
            selectedModel
        };
    }
    
    /**
     * 🧹 解析和增强请求体
     */
    public static parseEnhancedRequestBody(body: string): {
        messages: EnhancedMessage[];
        model?: string;
        stream?: boolean;
        functions?: FunctionDefinition[];
        tools?: any[];
        [key: string]: any;
    } {
        try {
            const parsed = JSON.parse(body);
            
            // 确保消息具有正确的类型
            if (parsed.messages && Array.isArray(parsed.messages)) {
                parsed.messages = parsed.messages.map((msg: any) => {
                    // 如有需要，将旧式内容转换为新的增强格式
                    if (typeof msg.content === 'string') {
                        return msg as EnhancedMessage;
                    }
                    
                    // 处理多模态内容
                    if (Array.isArray(msg.content)) {
                        return {
                            ...msg,
                            content: msg.content.map((part: any) => {
                                if (typeof part === 'string') {
                                    return { type: 'text', text: part };
                                }
                                return part;
                            })
                        } as EnhancedMessage;
                    }
                    
                    return msg as EnhancedMessage;
                });
            }
            
            return parsed;
        } catch (error) {
            throw new Error('请求体中的 JSON 无效');
        }
    }
    
    /**
     * 📊 创建带有模型信息的健康检查响应
     */
    public static createHealthResponse(serverState: any, modelPool?: any) {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            server: {
                running: serverState.isRunning,
                uptime: serverState.startTime ? Date.now() - serverState.startTime.getTime() : 0,
                requests: serverState.requestCount,
                errors: serverState.errorCount,
                activeConnections: serverState.activeConnections
            },
            models: modelPool ? {
                total: modelPool.primary.length + modelPool.secondary.length + modelPool.fallback.length,
                primary: modelPool.primary.length,
                secondary: modelPool.secondary.length,
                fallback: modelPool.fallback.length,
                unhealthy: modelPool.unhealthy.length,
                supportsVision: modelPool.primary.filter((m: any) => m.supportsVision).length,
                supportsTools: modelPool.primary.filter((m: any) => m.supportsTools).length
            } : undefined
        };
    }
    
    /**
     * 🔍 异步检查文件是否存在
     */
    private static async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 🚀 创建 OpenAI 格式的错误响应
     */
    public static createErrorResponse(
        message: string,
        type: string = 'api_error',
        code?: string,
        param?: string
    ) {
        return {
            error: {
                message,
                type,
                code,
                param
            }
        };
    }
}
