/**
 * 🚀 REVOLUTIONARY Request Handler
 * ✨ Complete rewrite with NO HARDCODED LIMITATIONS!
 * 🎨 Full multimodal, function calling, and dynamic model support
 */

import * as http from 'http';
import * as vscode from 'vscode';

import { logger } from '../utils/Logger';
import { Converter } from '../utils/Converter';
import { ModelDiscoveryService } from '../services/ModelDiscoveryService';
import { FunctionCallService } from '../services/FunctionCallService';

import {
    ModelCapabilities,
    DynamicModelCriteria,
    EnhancedMessage,
    EnhancedRequestContext,
    FunctionDefinition,
    ToolCall
} from '../types/ModelCapabilities';

import { ServerState } from '../types/VSCode';
import { 
    HTTP_STATUS, 
    CONTENT_TYPES, 
    SSE_HEADERS,
    ERROR_CODES,
    NOTIFICATIONS
} from '../constants/Config';

export class RequestHandler {
    private modelDiscovery: ModelDiscoveryService;
    private functionService: FunctionCallService;
    private requestMetrics: Map<string, { startTime: Date; model?: string }> = new Map();
    private isInitialized: boolean = false;
    
    constructor() {
        this.modelDiscovery = new ModelDiscoveryService();
        this.functionService = new FunctionCallService();
        
        // Initialize asynchronously
        this.initialize();
    }
    
    /**
     * 🚀 Initialize the handler
     */
    private async initialize(): Promise<void> {
        try {
            logger.info('🚀 Initializing Enhanced Request Handler...');
            
            // Discover all available models
            await this.modelDiscovery.discoverAllModels();
            
            this.isInitialized = true;
            logger.info('✅ Enhanced Request Handler initialized successfully!');
            
        } catch (error) {
            logger.error('❌ Failed to initialize Enhanced Request Handler:', error as Error);
        }
    }
    
    /**
     * 🎨 Handle chat completions with FULL MULTIMODAL SUPPORT
     */
    public async handleChatCompletions(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        const startTime = Date.now();
        
        try {
            // Ensure we're initialized
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            requestLogger.info('🚀 Processing enhanced chat completion request');
            
            // Read and parse request body with enhanced format support
            const body = await this.readRequestBody(req);
            const requestData = Converter.parseEnhancedRequestBody(body);
            
            // Extract enhanced messages and request parameters
            const messages: EnhancedMessage[] = requestData.messages;
            const requestedModel = requestData.model || 'auto-select';
            const isStream = requestData.stream || false;
            const functions: FunctionDefinition[] = requestData.functions || [];
            const tools = requestData.tools || [];
            
            requestLogger.info('📋 Request analysis:', {
                model: requestedModel,
                stream: isStream,
                messageCount: messages.length,
                hasImages: messages.some(m => Array.isArray(m.content) && 
                    m.content.some(p => p.type === 'image_url')),
                hasFunctions: functions.length > 0 || tools.length > 0
            });
            
            // Create enhanced context
            const context = Converter.createEnhancedContext(
                requestId,
                requestedModel,
                isStream,
                messages,
                undefined, // Will be set after model selection
                this.getClientIP(req),
                req.headers['user-agent']
            );
            
            // 🎯 INTELLIGENT MODEL SELECTION (No hardcoded limits!)
            const selectionCriteria: DynamicModelCriteria = {
                preferredModels: requestedModel !== 'auto-select' ? [requestedModel] : undefined,
                requiredCapabilities: context.requiredCapabilities as any,
                requiresVision: context.hasImages,
                requiresTools: context.hasFunctions || functions.length > 0,
                minContextTokens: context.estimatedTokens,
                sortBy: 'capabilities'
            };
            
            const selectedModel = await this.modelDiscovery.selectOptimalModel(selectionCriteria);
            
            if (!selectedModel) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.SERVICE_UNAVAILABLE,
                    `No suitable model available for request requirements`,
                    ERROR_CODES.API_ERROR,
                    requestId
                );
                return;
            }
            
            // Update context with selected model
            context.selectedModel = selectedModel;
            
            requestLogger.info('✅ Model selected:', {
                modelId: selectedModel.id,
                vendor: selectedModel.vendor,
                family: selectedModel.family,
                maxTokens: selectedModel.maxInputTokens,
                supportsVision: selectedModel.supportsVision,
                supportsTools: selectedModel.supportsTools
            });
            
            // Check Copilot access
            const hasAccess = await this.checkCopilotAccess();
            if (!hasAccess) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.UNAUTHORIZED,
                    NOTIFICATIONS.NO_COPILOT_ACCESS,
                    ERROR_CODES.AUTHENTICATION_ERROR,
                    requestId
                );
                return;
            }
            
            // Validate context window limits (dynamic!)
            if (context.estimatedTokens > selectedModel.maxInputTokens) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.BAD_REQUEST,
                    `Request exceeds model context limit (${context.estimatedTokens} > ${selectedModel.maxInputTokens} tokens)`,
                    ERROR_CODES.INVALID_REQUEST,
                    requestId
                );
                return;
            }
            
            // Convert messages to VS Code format
            const vsCodeMessages = await Converter.convertMessagesToVSCode(
                messages, 
                selectedModel
            );
            
            // Prepare tools if supported
            let vsCodeTools: any[] = [];
            if (selectedModel.supportsTools && (functions.length > 0 || tools.length > 0)) {
                try {
                    vsCodeTools = this.functionService.convertFunctionsToTools(functions);
                    requestLogger.info(`🛠️ Prepared ${vsCodeTools.length} tools for execution`);
                } catch (error) {
                    requestLogger.warn('Failed to prepare tools:', { error: String(error) });
                }
            }
            
            // 🚀 SEND REQUEST TO VS CODE LM API
            try {
                requestLogger.info('📨 Sending request to VS Code LM API...');
                
                const requestOptions: any = {
                    tools: vsCodeTools.length > 0 ? vsCodeTools : undefined
                };
                
                const response = await selectedModel.vsCodeModel.sendRequest(
                    vsCodeMessages,
                    requestOptions,
                    new vscode.CancellationTokenSource().token
                );
                
                // 🌊 Handle streaming vs non-streaming response
                if (isStream) {
                    await this.handleStreamingResponse(response, res, context, requestLogger);
                } else {
                    await this.handleNonStreamingResponse(response, res, context, requestLogger);
                }
                
            } catch (lmError) {
                requestLogger.error('❌ VS Code LM API error:', lmError as Error);
                
                // Handle specific LM API errors with enhanced error mapping
                if (lmError instanceof vscode.LanguageModelError) {
                    this.handleLanguageModelError(lmError, res, requestId);
                } else {
                    this.sendErrorResponse(
                        res,
                        HTTP_STATUS.BAD_GATEWAY,
                        `Language model request failed: ${lmError}`,
                        ERROR_CODES.API_ERROR,
                        requestId
                    );
                }
            }
            
        } catch (error) {
            const duration = Date.now() - startTime;
            requestLogger.error(`❌ Request failed after ${duration}ms:`, error as Error);
            
            if (!res.headersSent) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    'Enhanced request processing failed',
                    ERROR_CODES.API_ERROR,
                    requestId
                );
            }
        }
    }
    
    /**
     * 📋 Handle enhanced models endpoint
     */
    public async handleModels(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('📋 Fetching all available models (no limitations!)...');
            
            // Ensure we're initialized
            if (!this.isInitialized) {
                await this.initialize();
            }
            
            // Get ALL available models
            const allModels = this.modelDiscovery.getAllModels();
            
            requestLogger.info(`📊 Found ${allModels.length} total models:`);
            
            // Log model capabilities for transparency
            allModels.forEach(model => {
                requestLogger.info(`  ✨ ${model.id}: tokens=${model.maxInputTokens}, vision=${model.supportsVision}, tools=${model.supportsTools}`);
            });
            
            const modelsResponse = Converter.createModelsResponse(allModels);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(modelsResponse, null, 2));
            
            requestLogger.info(`✅ Models response sent with ${modelsResponse.data.length} models`);
            
        } catch (error) {
            requestLogger.error('❌ Error handling models request:', error as Error);
            this.sendErrorResponse(
                res,
                HTTP_STATUS.INTERNAL_SERVER_ERROR,
                'Failed to retrieve models',
                ERROR_CODES.API_ERROR,
                requestId
            );
        }
    }
    
    /**
     * 👩‍⚕️ Enhanced health check
     */
    public async handleHealth(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string,
        serverState: ServerState
    ): Promise<void> {
        try {
            const modelPool = this.modelDiscovery.getModelPool();
            const healthResponse = Converter.createHealthResponse(serverState, modelPool);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(healthResponse, null, 2));
            
        } catch (error) {
            this.sendErrorResponse(
                res,
                HTTP_STATUS.INTERNAL_SERVER_ERROR,
                'Health check failed',
                ERROR_CODES.API_ERROR,
                requestId
            );
        }
    }
    
    /**
     * 📋 Enhanced status endpoint
     */
    public async handleStatus(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string,
        serverState: ServerState
    ): Promise<void> {
        try {
            const modelPool = this.modelDiscovery.getModelPool();
            const toolStats = this.functionService.getToolStats();
            
            const status = {
                server: serverState,
                models: {
                    total: modelPool.primary.length + modelPool.secondary.length + modelPool.fallback.length,
                    primary: modelPool.primary.length,
                    secondary: modelPool.secondary.length,
                    fallback: modelPool.fallback.length,
                    unhealthy: modelPool.unhealthy.length,
                    lastUpdated: modelPool.lastUpdated.toISOString(),
                    capabilities: {
                        vision: modelPool.primary.filter(m => m.supportsVision).length,
                        tools: modelPool.primary.filter(m => m.supportsTools).length,
                        multimodal: modelPool.primary.filter(m => m.supportsMultimodal).length
                    }
                },
                tools: {
                    available: Object.keys(toolStats).length,
                    stats: toolStats
                },
                features: {
                    dynamicModelDiscovery: true,
                    multimodalSupport: true,
                    functionCalling: true,
                    noHardcodedLimitations: true,
                    autoModelSelection: true,
                    loadBalancing: true
                },
                copilot: {
                    available: await this.checkCopilotAccess(),
                    models: await this.getModelCount()
                },
                timestamp: new Date().toISOString()
            };
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(status, null, 2));
            
        } catch (error) {
            this.sendErrorResponse(
                res,
                HTTP_STATUS.INTERNAL_SERVER_ERROR,
                'Status check failed',
                ERROR_CODES.API_ERROR,
                requestId
            );
        }
    }
    
    /**
     * 🌊 Handle enhanced streaming response
     */
    private async handleStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        context: EnhancedRequestContext,
        requestLogger: any
    ): Promise<void> {
        res.writeHead(HTTP_STATUS.OK, SSE_HEADERS);
        
        try {
            requestLogger.info('🌊 Starting enhanced streaming response...');
            
            let chunkCount = 0;
            
            for await (const chunk of Converter.extractStreamContent(
                response, 
                context, 
                context.selectedModel!
            )) {
                res.write(chunk);
                chunkCount++;
            }
            
            requestLogger.info(`✅ Enhanced streaming completed: ${chunkCount} chunks sent`);
            
        } catch (error) {
            requestLogger.error('❌ Enhanced streaming error:', error);
            
            const errorEvent = Converter.createSSEEvent('error', {
                message: 'Enhanced stream processing error',
                type: ERROR_CODES.API_ERROR
            });
            res.write(errorEvent);
        } finally {
            res.end();
        }
    }
    
    /**
     * 📋 Handle enhanced non-streaming response
     */
    private async handleNonStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        context: EnhancedRequestContext,
        requestLogger: any
    ): Promise<void> {
        try {
            requestLogger.info('📋 Collecting enhanced full response...');
            
            const fullContent = await Converter.collectFullResponse(response);
            
            const completionResponse = Converter.createCompletionResponse(
                fullContent, 
                context,
                context.selectedModel!
            );
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(completionResponse, null, 2));
            
            requestLogger.info('✅ Enhanced response sent:', {
                contentLength: fullContent.length,
                tokens: completionResponse.usage.total_tokens,
                model: context.selectedModel!.id
            });
            
        } catch (error) {
            requestLogger.error('❌ Error collecting enhanced response:', error as Error);
            throw error;
        }
    }
    
    /**
     * 🔮 Check Copilot access
     */
    private async checkCopilotAccess(): Promise<boolean> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            return models.length > 0;
        } catch (error) {
            logger.warn('Copilot access check failed:', { error: String(error) });
            return false;
        }
    }
    
    /**
     * 📋 Get total model count
     */
    private async getModelCount(): Promise<number> {
        try {
            const models = await vscode.lm.selectChatModels();
            return models.length;
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * ❌ Handle VS Code Language Model specific errors
     */
    private handleLanguageModelError(
        error: vscode.LanguageModelError,
        res: http.ServerResponse,
        requestId: string
    ): void {
        let statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
        let errorCode: string = ERROR_CODES.API_ERROR;
        let message = error.message;
        
        // Enhanced error mapping
        switch (error.code) {
            case 'NoPermissions':
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorCode = ERROR_CODES.PERMISSION_ERROR;
                message = 'Permission denied for language model access';
                break;
            case 'Blocked':
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorCode = ERROR_CODES.PERMISSION_ERROR;
                message = 'Request blocked by content filter';
                break;
            case 'NotFound':
                statusCode = HTTP_STATUS.NOT_FOUND;
                errorCode = ERROR_CODES.NOT_FOUND_ERROR;
                message = 'Language model not found';
                break;
            case 'ContextLengthExceeded':
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorCode = ERROR_CODES.INVALID_REQUEST;
                message = 'Request exceeds context length limit';
                break;
            default:
                statusCode = HTTP_STATUS.BAD_GATEWAY;
                errorCode = ERROR_CODES.API_ERROR;
                message = `Language model error: ${error.message}`;
        }
        
        this.sendErrorResponse(res, statusCode, message, errorCode, requestId);
    }
    
    /**
     * ❌ Send enhanced error response
     */
    private sendErrorResponse(
        res: http.ServerResponse,
        statusCode: number,
        message: string,
        type: string,
        requestId: string,
        param?: string
    ): void {
        if (res.headersSent) {
            return;
        }
        
        const errorResponse = Converter.createErrorResponse(message, type, undefined, param);
        
        res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPES.JSON });
        res.end(JSON.stringify(errorResponse, null, 2));
        
        logger.error(`❌ Enhanced error response: ${statusCode}`, new Error(message), { type, param }, requestId);
    }
    
    /**
     * 📋 Read request body
     */
    private async readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk;
                
                // Increased limit for multimodal content
                if (body.length > 50 * 1024 * 1024) { // 50MB limit for images
                    reject(new Error('Request body too large'));
                    return;
                }
            });
            
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }
    
    /**
     * 📍 Get client IP address
     */
    private getClientIP(req: http.IncomingMessage): string {
        return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
               req.connection.remoteAddress ||
               '127.0.0.1';
    }
    
    /**
     * 🧹 Cleanup resources
     */
    public dispose(): void {
        this.modelDiscovery.dispose();
        this.functionService.dispose();
        this.requestMetrics.clear();
    }
}
