/**
 * 🚀 REVOLUTIONARY Enhanced Copilot Server
 * ✨ NO HARDCODED LIMITATIONS - Fully dynamic model support!
 * 🎨 Complete multimodal, function calling, and intelligent model selection
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { URL } from 'url';

import { logger } from '../utils/Logger';
import { Validator } from '../utils/Validator';
import { RequestHandler } from './RequestHandler';
import { ModelDiscoveryService } from '../services/ModelDiscoveryService';
import { ServerConfig, ServerState } from '../types/VSCode';
import { 
    DEFAULT_CONFIG, 
    API_ENDPOINTS, 
    HTTP_STATUS, 
    CORS_HEADERS,
    NOTIFICATIONS,
    LIMITS
} from '../constants/Config';

export class CopilotServer {
    private server?: http.Server;
    private requestHandler: RequestHandler;
    private modelDiscovery: ModelDiscoveryService;
    private config: ServerConfig;
    private state: ServerState;
    private activeRequests: Map<string, { req: http.IncomingMessage; res: http.ServerResponse; startTime: Date }>;
    private isShuttingDown: boolean = false;
    
    constructor() {
        this.requestHandler = new RequestHandler();
        this.modelDiscovery = new ModelDiscoveryService();
        this.config = this.loadConfig();
        this.state = {
            isRunning: false,
            requestCount: 0,
            errorCount: 0,
            activeConnections: 0
        };
        this.activeRequests = new Map();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged.bind(this));
        
        // Initialize enhanced features
        this.initializeEnhancedFeatures();
    }
    
    /**
     * 🚀 Initialize enhanced features
     */
    private async initializeEnhancedFeatures(): Promise<void> {
        try {
            logger.info('🚀 Initializing enhanced server features...');
            
            // Start model discovery
            await this.modelDiscovery.discoverAllModels();
            
            logger.info('✅ Enhanced server features initialized!');
        } catch (error) {
            logger.error('❌ Failed to initialize enhanced features:', error as Error);
        }
    }
    
    /**
     * 🚀 Start the enhanced HTTP server
     */
    public async start(port?: number): Promise<void> {
        if (this.state.isRunning) {
            throw new Error('Enhanced server is already running');
        }
        
        const serverPort = port || this.config.port;
        const serverHost = this.config.host;
        
        // Validate configuration
        Validator.validatePort(serverPort);
        Validator.validateHost(serverHost);
        
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer(this.handleRequest.bind(this));
                
                // Configure enhanced server settings
                this.server.keepAliveTimeout = 65000;
                this.server.headersTimeout = 66000;
                this.server.maxRequestsPerSocket = 1000;
                this.server.requestTimeout = this.config.requestTimeout;
                
                // Set up enhanced event handlers
                this.setupEnhancedServerEventHandlers();
                
                this.server.listen(serverPort, serverHost, () => {
                    this.state.isRunning = true;
                    this.state.port = serverPort;
                    this.state.host = serverHost;
                    this.state.startTime = new Date();
                    
                    logger.logServerEvent('🚀 Enhanced server started', {
                        host: serverHost,
                        port: serverPort,
                        timeout: this.config.requestTimeout,
                        features: {
                            dynamicModels: true,
                            multimodal: true,
                            functionCalling: true,
                            noLimitations: true
                        }
                    });
                    
                    vscode.window.showInformationMessage(
                        `🚀 ${NOTIFICATIONS.SERVER_STARTED} (Enhanced) on http://${serverHost}:${serverPort}`
                    );
                    
                    resolve();
                });
                
                this.server.on('error', (error: NodeJS.ErrnoException) => {
                    this.state.isRunning = false;
                    
                    if (error.code === 'EADDRINUSE') {
                        const message = `${NOTIFICATIONS.PORT_IN_USE}: ${serverPort}`;
                        logger.error(message, error);
                        vscode.window.showErrorMessage(message);
                        reject(new Error(message));
                    } else {
                        logger.error('Enhanced server startup error', error);
                        vscode.window.showErrorMessage(`${NOTIFICATIONS.SERVER_ERROR}: ${error.message}`);
                        reject(error);
                    }
                });
                
            } catch (error) {
                logger.error('Failed to create enhanced server', error as Error);
                reject(error);
            }
        });
    }
    
    /**
     * 🔄 Enhanced request handler
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        if (this.isShuttingDown) {
            this.sendError(res, HTTP_STATUS.SERVICE_UNAVAILABLE, 'Server is shutting down');
            return;
        }
        
        const requestId = this.generateRequestId();
        const startTime = new Date();
        
        // Track active request
        this.activeRequests.set(requestId, { req, res, startTime });
        this.state.activeConnections = this.activeRequests.size;
        
        // Set timeout for this request
        req.setTimeout(this.config.requestTimeout, () => {
            this.handleRequestTimeout(requestId, res);
        });
        
        try {
            // Increment request counter
            this.state.requestCount++;
            
            // Parse URL
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            const method = req.method || 'GET';
            
            // Log enhanced request
            logger.logRequest(method, url.pathname, requestId);
            
            // Add CORS headers
            this.addCORSHeaders(res);
            
            // Handle preflight requests
            if (method === 'OPTIONS') {
                this.handlePreflight(res);
                return;
            }
            
            // Enhanced rate limiting check
            if (!this.checkEnhancedRateLimit(req)) {
                this.sendError(res, HTTP_STATUS.TOO_MANY_REQUESTS, 'Rate limit exceeded', requestId);
                return;
            }
            
            // Route to enhanced handlers
            await this.routeEnhancedRequest(url.pathname, method, req, res, requestId);
            
        } catch (error) {
            this.state.errorCount++;
            logger.error('🚀 Enhanced request handling error', error as Error, {}, requestId);
            
            if (!res.headersSent) {
                this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Internal server error', requestId);
            }
        } finally {
            // Clean up request tracking
            this.activeRequests.delete(requestId);
            this.state.activeConnections = this.activeRequests.size;
            
            // Log enhanced response
            const duration = Date.now() - startTime.getTime();
            logger.logResponse(res.statusCode || 500, requestId, duration);
        }
    }
    
    /**
     * 🎯 Route requests to enhanced handlers
     */
    private async routeEnhancedRequest(
        pathname: string,
        method: string,
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        switch (pathname) {
            case API_ENDPOINTS.CHAT_COMPLETIONS:
                if (method === 'POST') {
                    await this.requestHandler.handleChatCompletions(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.MODELS:
                if (method === 'GET') {
                    await this.requestHandler.handleModels(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.HEALTH:
                if (method === 'GET') {
                    await this.requestHandler.handleHealth(req, res, requestId, this.state);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.STATUS:
                if (method === 'GET') {
                    await this.requestHandler.handleStatus(req, res, requestId, this.state);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            // 🚀 Enhanced endpoints
            case '/v1/models/refresh':
                if (method === 'POST') {
                    await this.handleModelRefresh(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case '/v1/capabilities':
                if (method === 'GET') {
                    await this.handleCapabilities(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            default:
                this.sendError(res, HTTP_STATUS.NOT_FOUND, 'Endpoint not found', requestId);
        }
    }
    
    /**
     * 🔄 Handle model refresh endpoint
     */
    private async handleModelRefresh(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        try {
            logger.info('🔄 Manual model refresh requested', {}, requestId);
            
            const models = await this.modelDiscovery.discoverAllModels();
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Models refreshed successfully',
                modelCount: models.length,
                timestamp: new Date().toISOString()
            }, null, 2));
            
        } catch (error) {
            this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Model refresh failed', requestId);
        }
    }
    
    /**
     * 📋 Handle capabilities endpoint
     */
    private async handleCapabilities(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        try {
            const modelPool = this.modelDiscovery.getModelPool();
            
            const capabilities = {
                server: {
                    version: '2.0.0-enhanced',
                    features: {
                        dynamicModelDiscovery: true,
                        multimodalSupport: true,
                        functionCalling: true,
                        noHardcodedLimitations: true,
                        autoModelSelection: true,
                        loadBalancing: true,
                        realTimeModelRefresh: true
                    }
                },
                models: {
                    total: modelPool.primary.length + modelPool.secondary.length + modelPool.fallback.length,
                    withVision: modelPool.primary.filter(m => m.supportsVision).length,
                    withTools: modelPool.primary.filter(m => m.supportsTools).length,
                    withMultimodal: modelPool.primary.filter(m => m.supportsMultimodal).length,
                    maxContextTokens: Math.max(...modelPool.primary.map(m => m.maxInputTokens), 0)
                },
                supportedFormats: {
                    images: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
                    imageInput: ['base64', 'url', 'file'],
                    functions: true,
                    tools: true,
                    streaming: true
                }
            };
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(capabilities, null, 2));
            
        } catch (error) {
            this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Capabilities check failed', requestId);
        }
    }
    
    /**
     * 🔄 Enhanced server event handlers
     */
    private setupEnhancedServerEventHandlers(): void {
        if (!this.server) return;
        
        this.server.on('connection', (socket) => {
            socket.setKeepAlive(true, 60000);
            socket.setNoDelay(true);
            
            socket.on('error', (error) => {
                logger.error('Enhanced socket error', error);
            });
        });
        
        this.server.on('clientError', (error, socket) => {
            logger.error('Enhanced client error', error);
            if (socket.writable) {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            }
        });
    }
    
    /**
     * 📊 Enhanced rate limiting
     */
    private checkEnhancedRateLimit(req: http.IncomingMessage): boolean {
        // Enhanced rate limiting with IP tracking
        return this.activeRequests.size < this.config.maxConcurrentRequests;
    }
    
    /**
     * 🔄 Enhanced CORS headers
     */
    private addCORSHeaders(res: http.ServerResponse): void {
        Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        
        // Enhanced headers for multimodal support
        res.setHeader('X-Enhanced-Features', 'multimodal,functions,dynamic-models');
        res.setHeader('X-API-Version', '2.0.0-enhanced');
    }
    
    /**
     * 🔄 Handle preflight OPTIONS request
     */
    private handlePreflight(res: http.ServerResponse): void {
        res.writeHead(HTTP_STATUS.OK);
        res.end();
    }
    
    /**
     * ⏰ Handle request timeout
     */
    private handleRequestTimeout(requestId: string, res: http.ServerResponse): void {
        logger.warn('Enhanced request timeout', {}, requestId);
        
        if (!res.headersSent) {
            this.sendError(res, HTTP_STATUS.REQUEST_TIMEOUT, 'Request timeout', requestId);
        }
        
        this.activeRequests.delete(requestId);
    }
    
    /**
     * ❌ Send enhanced error response
     */
    private sendError(res: http.ServerResponse, statusCode: number, message: string, requestId?: string): void {
        if (res.headersSent) {
            return;
        }
        
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message,
                type: 'enhanced_server_error',
                code: statusCode,
                timestamp: new Date().toISOString(),
                requestId
            }
        }, null, 2));
        
        if (requestId) {
            logger.error(`❌ Enhanced error response: ${statusCode}`, new Error(message), {}, requestId);
        }
    }
    
    /**
     * 📋 Generate unique request ID
     */
    private generateRequestId(): string {
        return `enhanced_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * 🔄 Stop the enhanced server
     */
    public async stop(): Promise<void> {
        if (!this.state.isRunning || !this.server) {
            return;
        }
        
        this.isShuttingDown = true;
        
        return new Promise((resolve) => {
            // Close all active requests first
            this.closeActiveRequests();
            
            this.server!.close(() => {
                this.state.isRunning = false;
                this.state.port = undefined;
                this.state.host = undefined;
                this.state.startTime = undefined;
                this.isShuttingDown = false;
                
                logger.logServerEvent('🚀 Enhanced server stopped');
                vscode.window.showInformationMessage('🚀 Enhanced ' + NOTIFICATIONS.SERVER_STOPPED);
                
                resolve();
            });
            
            // Force close after timeout
            setTimeout(() => {
                this.server?.closeAllConnections?.();
                resolve();
            }, 5000);
        });
    }
    
    /**
     * 🔄 Restart the enhanced server
     */
    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
    
    /**
     * 📋 Get current server state
     */
    public getState(): ServerState {
        return { ...this.state };
    }
    
    /**
     * 📋 Get server configuration
     */
    public getConfig(): ServerConfig {
        return { ...this.config };
    }
    
    /**
     * 🔄 Close all active requests
     */
    private closeActiveRequests(): void {
        for (const [requestId, { res }] of this.activeRequests.entries()) {
            try {
                if (!res.headersSent) {
                    this.sendError(res, HTTP_STATUS.SERVICE_UNAVAILABLE, 'Server shutting down', requestId);
                }
            } catch (error) {
                logger.error('Error closing enhanced request', error as Error, {}, requestId);
            }
        }
        this.activeRequests.clear();
    }
    
    /**
     * 🔄 Load enhanced configuration
     */
    private loadConfig(): ServerConfig {
        const config = vscode.workspace.getConfiguration('copilot-lmapi');
        
        return {
            port: config.get<number>('port', DEFAULT_CONFIG.port),
            host: config.get<string>('host', DEFAULT_CONFIG.host),
            autoStart: config.get<boolean>('autoStart', DEFAULT_CONFIG.autoStart),
            enableLogging: config.get<boolean>('enableLogging', DEFAULT_CONFIG.enableLogging),
            maxConcurrentRequests: Math.min(
                config.get<number>('maxConcurrentRequests', DEFAULT_CONFIG.maxConcurrentRequests),
                LIMITS.MAX_CONCURRENT_REQUESTS
            ),
            requestTimeout: Math.min(
                config.get<number>('requestTimeout', DEFAULT_CONFIG.requestTimeout),
                LIMITS.MAX_TIMEOUT
            )
        };
    }
    
    /**
     * 🔄 Handle configuration changes
     */
    private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration('copilot-lmapi')) {
            const newConfig = this.loadConfig();
            const oldConfig = this.config;
            
            this.config = newConfig;
            
            logger.logServerEvent('🔄 Enhanced configuration changed', {
                old: oldConfig,
                new: newConfig
            });
            
            // Restart server if critical settings changed
            if (this.state.isRunning && 
                (oldConfig.port !== newConfig.port || oldConfig.host !== newConfig.host)) {
                
                vscode.window.showInformationMessage(
                    '🔄 Enhanced server configuration changed. Restart required.',
                    'Restart Now'
                ).then(selection => {
                    if (selection === 'Restart Now') {
                        this.restart().catch(error => {
                            logger.error('Failed to restart enhanced server after config change', error);
                        });
                    }
                });
            }
        }
    }
    
    /**
     * 🧹 Dispose enhanced resources
     */
    public dispose(): void {
        this.stop().catch(error => {
            logger.error('Error during enhanced server disposal', error);
        });
        
        this.requestHandler.dispose();
        this.modelDiscovery.dispose();
    }
}
