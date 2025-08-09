/**
 * 🚀 增强动态验证器
 * ✨ 无硬编码模型限制 - 支持任意模型验证！
 * 🎨 对多模态内容和函数的完整支持
 */

import { 
    EnhancedMessage, 
    ModelCapabilities, 
    FunctionDefinition 
} from '../types/ModelCapabilities';
import { ValidatedRequest } from '../types/OpenAI';
import { LIMITS, ERROR_CODES } from '../constants/Config';
import { logger } from './Logger';

export class ValidationError extends Error {
    constructor(
        message: string,
        public code: string = ERROR_CODES.INVALID_REQUEST,
        public param?: string
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class Validator {
    
    /**
     * 🚀 验证增强聊天完成请求（无模型限制！）
     */
    public static validateChatCompletionRequest(
        request: any, 
        availableModels?: ModelCapabilities[]
    ): ValidatedRequest {
        if (!request || typeof request !== 'object') {
            throw new ValidationError('Request must be a valid JSON object');
        }
        
        // 验证增强消息
        const messages = this.validateEnhancedMessages(request.messages);
        
        // 🎯 动态模型验证（无硬编码列表！）
        const model = this.validateDynamicModel(request.model, availableModels);
        const stream = this.validateStream(request.stream);
        const temperature = this.validateTemperature(request.temperature);
        const maxTokens = this.validateMaxTokens(request.max_tokens, availableModels?.find(m => m.id === model));
        const n = this.validateN(request.n);
        const topP = this.validateTopP(request.top_p);
        const stop = this.validateStop(request.stop);
        const presencePenalty = this.validatePenalty(request.presence_penalty, 'presence_penalty');
        const frequencyPenalty = this.validatePenalty(request.frequency_penalty, 'frequency_penalty');
        
        // 如果存在则验证函数
        if (request.functions) {
            this.validateFunctions(request.functions);
        }
        
        // 如果存在则验证工具
        if (request.tools) {
            this.validateTools(request.tools);
        }
        
        // 构建已验证的请求
        const validatedRequest: ValidatedRequest = {
            model,
            messages: messages as any, // Type conversion for enhanced messages
            stream,
            temperature,
        };
        
        // 添加可选参数
        if (maxTokens !== undefined) validatedRequest.max_tokens = maxTokens;
        if (n !== undefined) validatedRequest.n = n;
        if (topP !== undefined) validatedRequest.top_p = topP;
        if (stop !== undefined) validatedRequest.stop = stop;
        if (presencePenalty !== undefined) validatedRequest.presence_penalty = presencePenalty;
        if (frequencyPenalty !== undefined) validatedRequest.frequency_penalty = frequencyPenalty;
        if (request.user) validatedRequest.user = this.validateUser(request.user);
        if (request.functions) validatedRequest.functions = request.functions;
        if (request.tools) validatedRequest.tools = request.tools;
        
        return validatedRequest;
    }
    
    /**
     * 🎨 验证支持多模态的增强消息
     */
    private static validateEnhancedMessages(messages: any): EnhancedMessage[] {
        if (!Array.isArray(messages)) {
            throw new ValidationError('Messages must be an array', ERROR_CODES.INVALID_REQUEST, 'messages');
        }
        
        if (messages.length === 0) {
            throw new ValidationError('At least one message is required', ERROR_CODES.INVALID_REQUEST, 'messages');
        }
        
        if (messages.length > LIMITS.MAX_MESSAGES_PER_REQUEST) {
            throw new ValidationError(
                `Too many messages. Maximum ${LIMITS.MAX_MESSAGES_PER_REQUEST} allowed`,
                ERROR_CODES.INVALID_REQUEST,
                'messages'
            );
        }
        
        return messages.map((message, index) => this.validateEnhancedMessage(message, index));
    }
    
    /**
     * 🖼️ 验证带多模态内容的单个增强消息
     */
    private static validateEnhancedMessage(message: any, index: number): EnhancedMessage {
        if (!message || typeof message !== 'object') {
            throw new ValidationError(
                `Message at index ${index} must be an object`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${index}`
            );
        }
        
        // 验证角色
        if (!['system', 'user', 'assistant'].includes(message.role)) {
            throw new ValidationError(
                `Invalid role "${message.role}" at message ${index}. Must be 'system', 'user', or 'assistant'`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${index}.role`
            );
        }
        
        // 验证内容（可以是字符串或多模态数组）
        if (typeof message.content === 'string') {
            // 简单文本内容
            if (message.content.length === 0) {
                throw new ValidationError(
                    `Message content at index ${index} cannot be empty`,
                    ERROR_CODES.INVALID_REQUEST,
                    `messages.${index}.content`
                );
            }
            
            if (message.content.length > LIMITS.MAX_MESSAGE_LENGTH) {
                throw new ValidationError(
                    `Message content at index ${index} is too long. Maximum ${LIMITS.MAX_MESSAGE_LENGTH} characters allowed`,
                    ERROR_CODES.INVALID_REQUEST,
                    `messages.${index}.content`
                );
            }
            
        } else if (Array.isArray(message.content)) {
            // 🎨 多模态内容验证
            this.validateMultimodalContent(message.content, index);
            
        } else {
            throw new ValidationError(
                `Message content at index ${index} must be a string or array`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${index}.content`
            );
        }
        
        const validatedMessage: EnhancedMessage = {
            role: message.role,
            content: message.content
        };
        
        // 可选字段
        if (message.name && typeof message.name === 'string') {
            validatedMessage.name = message.name;
        }
        
        if (message.tool_calls && Array.isArray(message.tool_calls)) {
            validatedMessage.tool_calls = message.tool_calls;
        }
        
        if (message.tool_call_id && typeof message.tool_call_id === 'string') {
            validatedMessage.tool_call_id = message.tool_call_id;
        }
        
        return validatedMessage;
    }
    
    /**
     * 🖼️ 验证多模态内容数组
     */
    private static validateMultimodalContent(content: any[], messageIndex: number): void {
        if (content.length === 0) {
            throw new ValidationError(
                `Multimodal content array at message ${messageIndex} cannot be empty`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${messageIndex}.content`
            );
        }
        
        let imageCount = 0;
        
        for (let i = 0; i < content.length; i++) {
            const part = content[i];
            
            if (!part || typeof part !== 'object') {
                throw new ValidationError(
                    `Content part ${i} at message ${messageIndex} must be an object`,
                    ERROR_CODES.INVALID_REQUEST,
                    `messages.${messageIndex}.content.${i}`
                );
            }
            
            if (part.type === 'text') {
                if (!part.text || typeof part.text !== 'string') {
                    throw new ValidationError(
                        `Text content part ${i} at message ${messageIndex} must have a text field`,
                        ERROR_CODES.INVALID_REQUEST,
                        `messages.${messageIndex}.content.${i}.text`
                    );
                }
                
            } else if (part.type === 'image_url') {
                imageCount++;
                
                if (!part.image_url || typeof part.image_url !== 'object') {
                    throw new ValidationError(
                        `Image content part ${i} at message ${messageIndex} must have an image_url object`,
                        ERROR_CODES.INVALID_REQUEST,
                        `messages.${messageIndex}.content.${i}.image_url`
                    );
                }
                
                if (!part.image_url.url || typeof part.image_url.url !== 'string') {
                    throw new ValidationError(
                        `Image URL at message ${messageIndex}, part ${i} is required`,
                        ERROR_CODES.INVALID_REQUEST,
                        `messages.${messageIndex}.content.${i}.image_url.url`
                    );
                }
                
                // 验证图像 URL 格式
                this.validateImageUrl(part.image_url.url, messageIndex, i);
                
            } else {
                throw new ValidationError(
                    `Unknown content type "${part.type}" at message ${messageIndex}, part ${i}`,
                    ERROR_CODES.INVALID_REQUEST,
                    `messages.${messageIndex}.content.${i}.type`
                );
            }
        }
        
        // 限制每条消息的图像数量
        if (imageCount > 10) { // Reasonable limit
            throw new ValidationError(
                `Too many images in message ${messageIndex}. Maximum 10 images per message`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${messageIndex}.content`
            );
        }
    }
    
    /**
     * 🖼️ 验证图像 URL 格式
     */
    private static validateImageUrl(url: string, messageIndex: number, partIndex: number): void {
        // 支持各种图像源
        const validPatterns = [
            /^data:image\/(jpeg|jpg|png|gif|webp);base64,/, // Base64
            /^https?:\/\/.+\.(jpeg|jpg|png|gif|webp)$/i,   // HTTP URLs
            /^file:\/\/.+\.(jpeg|jpg|png|gif|webp)$/i,     // File URLs
            /^\/.+\.(jpeg|jpg|png|gif|webp)$/i,           // Absolute paths
            /^\.\/.+\.(jpeg|jpg|png|gif|webp)$/i,         // Relative paths
        ];
        
        const isValid = validPatterns.some(pattern => pattern.test(url));
        
        if (!isValid) {
            throw new ValidationError(
                `Invalid image URL format at message ${messageIndex}, part ${partIndex}. Supported: base64, HTTP URLs, file paths`,
                ERROR_CODES.INVALID_REQUEST,
                `messages.${messageIndex}.content.${partIndex}.image_url.url`
            );
        }
    }
    
    /**
     * 🎯 动态模型验证（无硬编码限制！）
     */
    private static validateDynamicModel(model: any, availableModels?: ModelCapabilities[]): string {
        if (!model) {
            // 如果未指定模型，让系统自动选择
            return 'auto-select';
        }
        
        if (typeof model !== 'string') {
            throw new ValidationError('Model must be a string', ERROR_CODES.INVALID_REQUEST, 'model');
        }
        
        // 🚀 革命性：无硬编码模型列表！
        // 如果提供了可用模型，检查模型是否存在
        if (availableModels && availableModels.length > 0) {
            const modelExists = availableModels.some(m => m.id === model);
            
            if (!modelExists && model !== 'auto-select') {
                logger.warn(`⚠️ Requested model "${model}" not found in available models. Will attempt dynamic discovery.`);
                // 不抛出错误 - 让模型发现服务处理它
            }
        }
        
        return model;
    }
    
    /**
     * 🛠️ 验证函数数组
     */
    private static validateFunctions(functions: any): FunctionDefinition[] {
        if (!Array.isArray(functions)) {
            throw new ValidationError('Functions must be an array', ERROR_CODES.INVALID_REQUEST, 'functions');
        }
        
        return functions.map((func, index) => this.validateFunction(func, index));
    }
    
    /**
     * 🛠️ 验证单个函数定义
     */
    private static validateFunction(func: any, index: number): FunctionDefinition {
        if (!func || typeof func !== 'object') {
            throw new ValidationError(
                `Function at index ${index} must be an object`,
                ERROR_CODES.INVALID_REQUEST,
                `functions.${index}`
            );
        }
        
        if (!func.name || typeof func.name !== 'string') {
            throw new ValidationError(
                `Function name at index ${index} is required`,
                ERROR_CODES.INVALID_REQUEST,
                `functions.${index}.name`
            );
        }
        
        if (func.parameters && typeof func.parameters !== 'object') {
            throw new ValidationError(
                `Function parameters at index ${index} must be an object`,
                ERROR_CODES.INVALID_REQUEST,
                `functions.${index}.parameters`
            );
        }
        
        return {
            name: func.name,
            description: func.description,
            parameters: func.parameters || { type: 'object', properties: {} }
        };
    }
    
    /**
     * 🛠️ 验证工具数组
     */
    private static validateTools(tools: any): any[] {
        if (!Array.isArray(tools)) {
            throw new ValidationError('Tools must be an array', ERROR_CODES.INVALID_REQUEST, 'tools');
        }
        
        return tools.map((tool, index) => {
            if (!tool || typeof tool !== 'object') {
                throw new ValidationError(
                    `Tool at index ${index} must be an object`,
                    ERROR_CODES.INVALID_REQUEST,
                    `tools.${index}`
                );
            }
            
            return tool;
        });
    }
    
    /**
     * 📋 用动态模型上下文验证 max_tokens
     */
    private static validateMaxTokens(maxTokens: any, selectedModel?: ModelCapabilities): number | undefined {
        if (maxTokens === undefined || maxTokens === null) {
            return undefined;
        }
        
        if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens)) {
            throw new ValidationError('max_tokens must be an integer', ERROR_CODES.INVALID_REQUEST, 'max_tokens');
        }
        
        if (maxTokens < 1) {
            throw new ValidationError('max_tokens must be at least 1', ERROR_CODES.INVALID_REQUEST, 'max_tokens');
        }
        
        // 🚀 基于选定模型的动态验证
        if (selectedModel) {
            const modelLimit = selectedModel.maxOutputTokens || selectedModel.maxInputTokens * 0.5;
            if (maxTokens > modelLimit) {
                throw new ValidationError(
                    `max_tokens cannot exceed ${Math.floor(modelLimit)} for model ${selectedModel.id}`,
                    ERROR_CODES.INVALID_REQUEST,
                    'max_tokens'
                );
            }
        }
        
        return maxTokens;
    }
    
    // 🔄 其他验证方法保持不变但带增强日志
    
    private static validateStream(stream: any): boolean {
        if (stream === undefined || stream === null) {
            return false;
        }
        
        if (typeof stream !== 'boolean') {
            throw new ValidationError('Stream must be a boolean', ERROR_CODES.INVALID_REQUEST, 'stream');
        }
        
        return stream;
    }
    
    private static validateTemperature(temperature: any): number {
        if (temperature === undefined || temperature === null) {
            return 1.0;
        }
        
        if (typeof temperature !== 'number' || isNaN(temperature)) {
            throw new ValidationError('Temperature must be a number', ERROR_CODES.INVALID_REQUEST, 'temperature');
        }
        
        if (temperature < 0 || temperature > 2) {
            throw new ValidationError('Temperature must be between 0 and 2', ERROR_CODES.INVALID_REQUEST, 'temperature');
        }
        
        return temperature;
    }
    
    private static validateN(n: any): number | undefined {
        if (n === undefined || n === null) {
            return undefined;
        }
        
        if (typeof n !== 'number' || !Number.isInteger(n)) {
            throw new ValidationError('n must be an integer', ERROR_CODES.INVALID_REQUEST, 'n');
        }
        
        if (n < 1 || n > 10) {
            throw new ValidationError('n must be between 1 and 10', ERROR_CODES.INVALID_REQUEST, 'n');
        }
        
        return n;
    }
    
    private static validateTopP(topP: any): number | undefined {
        if (topP === undefined || topP === null) {
            return undefined;
        }
        
        if (typeof topP !== 'number' || isNaN(topP)) {
            throw new ValidationError('top_p must be a number', ERROR_CODES.INVALID_REQUEST, 'top_p');
        }
        
        if (topP < 0 || topP > 1) {
            throw new ValidationError('top_p must be between 0 and 1', ERROR_CODES.INVALID_REQUEST, 'top_p');
        }
        
        return topP;
    }
    
    private static validateStop(stop: any): string | string[] | undefined {
        if (stop === undefined || stop === null) {
            return undefined;
        }
        
        if (typeof stop === 'string') {
            return stop;
        }
        
        if (Array.isArray(stop)) {
            if (stop.length > 4) {
                throw new ValidationError('stop array cannot have more than 4 elements', ERROR_CODES.INVALID_REQUEST, 'stop');
            }
            
            for (const item of stop) {
                if (typeof item !== 'string') {
                    throw new ValidationError('All stop array elements must be strings', ERROR_CODES.INVALID_REQUEST, 'stop');
                }
            }
            
            return stop;
        }
        
        throw new ValidationError('stop must be a string or array of strings', ERROR_CODES.INVALID_REQUEST, 'stop');
    }
    
    private static validatePenalty(penalty: any, paramName: string): number | undefined {
        if (penalty === undefined || penalty === null) {
            return undefined;
        }
        
        if (typeof penalty !== 'number' || isNaN(penalty)) {
            throw new ValidationError(`${paramName} must be a number`, ERROR_CODES.INVALID_REQUEST, paramName);
        }
        
        if (penalty < -2 || penalty > 2) {
            throw new ValidationError(`${paramName} must be between -2 and 2`, ERROR_CODES.INVALID_REQUEST, paramName);
        }
        
        return penalty;
    }
    
    private static validateUser(user: any): string {
        if (typeof user !== 'string') {
            throw new ValidationError('user must be a string', ERROR_CODES.INVALID_REQUEST, 'user');
        }
        
        if (user.length > 256) {
            throw new ValidationError('user string cannot exceed 256 characters', ERROR_CODES.INVALID_REQUEST, 'user');
        }
        
        return user;
    }
    
    /**
     * 🧹 增强字符串清理
     */
    public static sanitizeString(input: string): string {
        return input.trim().replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    }
    
    /**
     * 📋 验证端口号
     */
    public static validatePort(port: any): number {
        if (typeof port !== 'number' || !Number.isInteger(port)) {
            throw new ValidationError('Port must be an integer');
        }
        
        if (port < LIMITS.MIN_PORT || port > LIMITS.MAX_PORT) {
            throw new ValidationError(`Port must be between ${LIMITS.MIN_PORT} and ${LIMITS.MAX_PORT}`);
        }
        
        return port;
    }
    
    /**
     * 📋 验证主机字符串
     */
    public static validateHost(host: any): string {
        if (typeof host !== 'string') {
            throw new ValidationError('Host must be a string');
        }
        
        const sanitized = this.sanitizeString(host);
        
        if (!/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/.test(sanitized)) {
            throw new ValidationError('Only localhost addresses are allowed for security');
        }
        
        return sanitized;
    }
}
