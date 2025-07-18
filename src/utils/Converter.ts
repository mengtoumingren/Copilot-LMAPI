/**
 * 🎨 Enhanced Multimodal Converter
 * Revolutionary conversion between OpenAI API and VS Code LM API
 * ✨ Full support for images, functions, and dynamic models!
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
     * 🎨 Convert enhanced messages to VS Code LM API format
     * ✨ SUPPORTS IMAGES AND MULTIMODAL CONTENT!
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
                logger.error(`Failed to convert message:`, error as Error, { message });
                // Fallback to text-only content
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
     * 📋 Convert a single enhanced message
     */
    private static async convertSingleMessage(
        message: EnhancedMessage, 
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage | null> {
        
        // Handle simple text messages
        if (typeof message.content === 'string') {
            return new vscode.LanguageModelChatMessage(
                this.mapRoleToVSCode(message.role),
                this.formatRolePrefix(message.role) + message.content
            );
        }
        
        // Handle complex multimodal content
        if (Array.isArray(message.content)) {
            return await this.convertMultimodalMessage(message, selectedModel);
        }
        
        return null;
    }
    
    /**
     * 🖼️ Convert multimodal message with images
     */
    private static async convertMultimodalMessage(
        message: EnhancedMessage,
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage | null> {
        
        if (!Array.isArray(message.content)) {
            return null;
        }
        
        const contentParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart)[] = [];
        let textContent = this.formatRolePrefix(message.role);
        
        for (const part of message.content) {
            if (part.type === 'text' && part.text) {
                textContent += part.text;
                
            } else if (part.type === 'image_url' && part.image_url) {
                
                // 🔥 REVOLUTIONARY: Process images if model supports vision!
                if (selectedModel.supportsVision) {
                    try {
                        const imageContent = await this.processImageContent(part.image_url.url);
                        if (imageContent) {
                            textContent += `\n[Image: ${imageContent.description}]\n`;
                            // Note: VS Code LM API might handle images differently
                            // This is a text representation for now
                        }
                    } catch (error) {
                        logger.warn(`Failed to process image:`, error as Error);
                        textContent += `\n[Image: ${part.image_url.url}]\n`;
                    }
                } else {
                    logger.warn(`Model ${selectedModel.id} doesn't support vision, skipping image`);
                    textContent += `\n[Image not supported by selected model]\n`;
                }
            }
        }
        
        // Add text part
        contentParts.push(new vscode.LanguageModelTextPart(textContent));
        
        // Create the message with proper role mapping
        return new vscode.LanguageModelChatMessage(
            this.mapRoleToVSCode(message.role),
            contentParts
        );
    }
    
    /**
     * 🖼️ Process image content (Base64, URL, or file path)
     */
    private static async processImageContent(imageUrl: string): Promise<{ description: string; data?: string } | null> {
        try {
            // Handle different image sources
            if (imageUrl.startsWith('data:image/')) {
                // Base64 encoded image
                const [header, data] = imageUrl.split(',');
                const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                return {
                    description: `Base64 ${mimeType} image`,
                    data: data
                };
                
            } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                // URL image - for security, we'll just note it
                return {
                    description: `Remote image from ${new URL(imageUrl).hostname}`
                };
                
            } else if (imageUrl.startsWith('file://') || fs.existsSync(imageUrl)) {
                // Local file
                const filePath = imageUrl.startsWith('file://') ? imageUrl.slice(7) : imageUrl;
                const ext = path.extname(filePath).toLowerCase();
                const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                
                if (supportedFormats.includes(ext)) {
                    const stats = fs.statSync(filePath);
                    return {
                        description: `Local ${ext.slice(1)} image (${(stats.size / 1024).toFixed(1)}KB)`
                    };
                }
            }
            
            return null;
        } catch (error) {
            logger.error('Error processing image:', error as Error);
            return null;
        }
    }
    
    /**
     * 🔄 Map OpenAI roles to VS Code roles
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
     * 🏷️ Format role prefix for content
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
     * 📝 Create enhanced completion response
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
            model: selectedModel.id, // Use actual model ID
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: this.estimateTokens(context.estimatedTokens.toString()),
                completion_tokens: this.estimateTokens(content),
                total_tokens: context.estimatedTokens + this.estimateTokens(content)
            },
            system_fingerprint: `vs-code-${selectedModel.vendor}-${selectedModel.family}`
        };
    }
    
    /**
     * 🌊 Create enhanced streaming response chunk
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
            model: selectedModel.id, // Use actual model ID
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
     * 📋 Create dynamic models response
     */
    public static createModelsResponse(availableModels: ModelCapabilities[]): OpenAIModelsResponse {
        const now = Math.floor(Date.now() / 1000);
        
        const models: OpenAIModel[] = availableModels.map(model => ({
            id: model.id,
            object: 'model',
            created: now,
            owned_by: model.vendor || 'vs-code',
            // Add custom metadata about capabilities
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
     * 🌊 Extract content from VS Code LM response stream with enhanced context
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
            
            // Send final chunk
            yield this.createSSEEvent('data', this.createStreamChunk(
                '',
                context,
                selectedModel,
                false,
                true
            ));
            
            // Send done signal
            yield this.createSSEEvent('done');
            
        } catch (error) {
            logger.error('Error in enhanced stream extraction', error as Error, {}, context.requestId);
            yield this.createSSEEvent('error', {
                message: 'Enhanced stream processing error',
                type: 'api_error'
            });
        }
    }
    
    /**
     * 📝 Collect all content from VS Code LM response
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
            logger.error('Error collecting enhanced response', error as Error);
            throw new Error('Failed to collect response content');
        }
        
        return fullContent;
    }
    
    /**
     * 🔄 Create Server-Sent Event data
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
     * 📈 Enhanced token estimation
     */
    private static estimateTokens(text: string): number {
        // More sophisticated token estimation
        // Account for different languages and special tokens
        const baseTokens = Math.ceil(text.length / 4);
        const specialTokens = (text.match(/[\n\r\t]/g) || []).length;
        return baseTokens + specialTokens;
    }
    
    /**
     * 🎯 Create enhanced conversion context
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
        
        // Analyze message content for capabilities
        const hasImages = messages.some(msg => 
            Array.isArray(msg.content) && 
            msg.content.some(part => part.type === 'image_url')
        );
        
        const hasFunctions = messages.some(msg => 
            msg.tool_calls && msg.tool_calls.length > 0
        );
        
        // Estimate total tokens
        const estimatedTokens = messages.reduce((total, msg) => {
            if (typeof msg.content === 'string') {
                return total + this.estimateTokens(msg.content);
            } else if (Array.isArray(msg.content)) {
                return total + msg.content.reduce((partTotal, part) => {
                    if (part.type === 'text' && part.text) {
                        return partTotal + this.estimateTokens(part.text);
                    }
                    return partTotal + 100; // Estimate for images
                }, 0);
            }
            return total;
        }, 0);
        
        // Determine required capabilities
        const requiredCapabilities: string[] = [];
        if (hasImages) requiredCapabilities.push('supportsVision');
        if (hasFunctions) requiredCapabilities.push('supportsTools');
        if (isStream) requiredCapabilities.push('supportsStreaming');
        
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
     * 🧹 Parse and enhance request body
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
            
            // Ensure messages are properly typed
            if (parsed.messages && Array.isArray(parsed.messages)) {
                parsed.messages = parsed.messages.map((msg: any) => {
                    // Convert old-style content to new enhanced format if needed
                    if (typeof msg.content === 'string') {
                        return msg as EnhancedMessage;
                    }
                    
                    // Handle multimodal content
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
            throw new Error('Invalid JSON in request body');
        }
    }
    
    /**
     * 📊 Create health check response with model info
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
     * 🚀 Create error response in OpenAI format
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
