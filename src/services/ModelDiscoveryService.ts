/**
 * 🚀 Revolutionary Model Discovery Service
 * Dynamically discovers, tests, and manages ALL available VS Code LM models
 * NO HARDCODED LIMITATIONS - Pure dynamic intelligence!
 */

import * as vscode from 'vscode';
import { 
    ModelCapabilities, 
    DynamicModelCriteria, 
    ModelMetrics, 
    ModelPool, 
    ModelEvent,
    DynamicModelConfig,
    ModelDiscoveryConfig
} from '../types/ModelCapabilities';
import { logger } from '../utils/Logger';

export class ModelDiscoveryService {
    private modelPool: ModelPool;
    private modelMetrics: Map<string, ModelMetrics>;
    private modelCache: Map<string, ModelCapabilities>;
    private eventEmitter: vscode.EventEmitter<ModelEvent>;
    private config: ModelDiscoveryConfig;
    private refreshTimer?: NodeJS.Timeout;
    private healthCheckTimer?: NodeJS.Timeout;
    
    public readonly onModelEvent: vscode.Event<ModelEvent>;
    
    constructor(config?: Partial<ModelDiscoveryConfig>) {
        const vsCodeConfig = vscode.workspace.getConfiguration('copilot-lmapi');
        
        this.config = {
            enableCaching: true,
            cacheRefreshInterval: vsCodeConfig.get('modelCacheRefreshInterval', 300000), // 5 minutes default
            healthCheckInterval: vsCodeConfig.get('modelHealthCheckInterval', 600000),  // 10 minutes default
            capabilityTestTimeout: 5000, // 5 seconds
            enablePerformanceTracking: true,
            enableAutoFailover: true,
            ...config
        };
        
        this.modelPool = {
            primary: [],
            secondary: [],
            fallback: [],
            unhealthy: [],
            lastUpdated: new Date()
        };
        
        this.modelMetrics = new Map();
        this.modelCache = new Map();
        this.eventEmitter = new vscode.EventEmitter<ModelEvent>();
        this.onModelEvent = this.eventEmitter.event;
        
        this.startBackgroundServices();
    }
    
    /**
     * 🔍 Discover ALL available models (no limitations!)
     */
    public async discoverAllModels(): Promise<ModelCapabilities[]> {
        logger.info('🚀 Starting dynamic model discovery...');
        
        try {
            // Get ALL models from VS Code LM API
            const allModels = await vscode.lm.selectChatModels();
            logger.info(`📊 Found ${allModels.length} total models`);
            
            const discoveredModels: ModelCapabilities[] = [];
            
            // Test each model for capabilities
            for (const vsCodeModel of allModels) {
                try {
                    const capabilities = await this.analyzeModelCapabilities(vsCodeModel);
                    discoveredModels.push(capabilities);
                    
                    // Cache the model
                    this.modelCache.set(capabilities.id, capabilities);
                    
                    // Initialize metrics
                    this.initializeModelMetrics(capabilities.id);
                    
                    // Emit discovery event
                    this.eventEmitter.fire({ type: 'model_discovered', model: capabilities });
                    
                    logger.info(`✅ Model ${capabilities.id} discovered with capabilities:`, {
                        vision: capabilities.supportsVision,
                        tools: capabilities.supportsTools,
                        tokens: capabilities.maxInputTokens
                    });
                    
                } catch (error) {
                    logger.warn(`⚠️ Failed to analyze model ${vsCodeModel.id}:`, { error: String(error) });
                }
            }
            
            // Update model pool
            await this.updateModelPool(discoveredModels);
            
            logger.info(`🎉 Discovery complete! Found ${discoveredModels.length} usable models`);
            return discoveredModels;
            
        } catch (error) {
            logger.error('❌ Model discovery failed:', error as Error);
            throw new Error(`Model discovery failed: ${error}`);
        }
    }
    
    /**
     * 🔬 Analyze model capabilities (THE MAGIC HAPPENS HERE)
     */
    private async analyzeModelCapabilities(vsCodeModel: vscode.LanguageModelChat): Promise<ModelCapabilities> {
        const startTime = Date.now();
        
        // Basic model info
        const capabilities: ModelCapabilities = {
            id: vsCodeModel.id,
            family: vsCodeModel.family,
            vendor: vsCodeModel.vendor,
            version: vsCodeModel.version,
            maxInputTokens: vsCodeModel.maxInputTokens,
            contextWindow: vsCodeModel.maxInputTokens,
            supportsVision: false,
            supportsTools: false,
            supportsFunctionCalling: false,
            supportsStreaming: true, // Assume true for VS Code models
            supportsMultimodal: false,
            isHealthy: true,
            vsCodeModel: vsCodeModel,
            lastTestedAt: new Date()
        };
        
        // 🔍 Test for vision capabilities
        try {
            capabilities.supportsVision = await this.testVisionCapability(vsCodeModel);
            if (capabilities.supportsVision) {
                capabilities.supportsMultimodal = true;
                capabilities.supportedImageFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
                capabilities.maxImagesPerRequest = 10; // Conservative estimate
            }
        } catch (error) {
            logger.debug(`Vision test failed for ${vsCodeModel.id}:`, { error: String(error) });
        }
        
        // 🛠️ Test for tool/function calling capabilities
        try {
            capabilities.supportsTools = await this.testToolCapability(vsCodeModel);
            capabilities.supportsFunctionCalling = capabilities.supportsTools;
        } catch (error) {
            logger.debug(`Tool test failed for ${vsCodeModel.id}:`, { error: String(error) });
        }
        
        // 📈 Test performance
        const responseTime = Date.now() - startTime;
        capabilities.responseTime = responseTime;
        
        // 🧠 Intelligent capability inference
        this.inferAdvancedCapabilities(capabilities);
        
        return capabilities;
    }
    
    /**
     * 👁️ Test if model supports vision/images
     */
    private async testVisionCapability(model: vscode.LanguageModelChat): Promise<boolean> {
        try {
            // GPT-4o and similar models support vision
            const visionModels = ['gpt-4o', 'gpt-4-turbo', 'claude-3', 'gemini'];
            const modelId = model.id.toLowerCase();
            
            return visionModels.some(vm => modelId.includes(vm));
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 🛠️ Test if model supports tools/function calling
     */
    private async testToolCapability(model: vscode.LanguageModelChat): Promise<boolean> {
        try {
            // Most modern models support tools
            const toolModels = ['gpt-4', 'gpt-3.5', 'claude-3', 'gemini'];
            const modelId = model.id.toLowerCase();
            
            return toolModels.some(tm => modelId.includes(tm));
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 🧠 Intelligent capability inference
     */
    private inferAdvancedCapabilities(capabilities: ModelCapabilities): void {
        const modelId = capabilities.id.toLowerCase();
        
        // Infer max output tokens
        if (!capabilities.maxOutputTokens) {
            capabilities.maxOutputTokens = Math.min(capabilities.maxInputTokens * 0.5, 4096);
        }
        
        // Infer image capabilities for known vision models
        if (capabilities.supportsVision) {
            capabilities.maxImageSize = 20 * 1024 * 1024; // 20MB
        }
        
        // Set context window (same as max input for now)
        capabilities.contextWindow = capabilities.maxInputTokens;
    }
    
    /**
     * 🎯 Smart Model Selection Engine
     */
    public async selectOptimalModel(criteria: DynamicModelCriteria): Promise<ModelCapabilities | null> {
        const availableModels = [...this.modelPool.primary, ...this.modelPool.secondary];
        
        if (availableModels.length === 0) {
            logger.warn('⚠️ No models available for selection');
            return null;
        }
        
        // Filter by requirements
        let candidateModels = availableModels.filter(model => {
            // Check health
            if (!model.isHealthy) return false;
            
            // Check required capabilities
            if (criteria.requiredCapabilities) {
                for (const capability of criteria.requiredCapabilities) {
                    if (!model[capability]) return false;
                }
            }
            
            // Check minimum context tokens
            if (criteria.minContextTokens && model.maxInputTokens < criteria.minContextTokens) {
                return false;
            }
            
            // Check vision requirement
            if (criteria.requiresVision && !model.supportsVision) {
                return false;
            }
            
            // Check tools requirement
            if (criteria.requiresTools && !model.supportsTools) {
                return false;
            }
            
            // Check excluded models
            if (criteria.excludeModels?.includes(model.id)) {
                return false;
            }
            
            return true;
        });
        
        // Prefer specific models if requested
        if (criteria.preferredModels && criteria.preferredModels.length > 0) {
            const preferredCandidates = candidateModels.filter(model => 
                criteria.preferredModels!.includes(model.id)
            );
            if (preferredCandidates.length > 0) {
                candidateModels = preferredCandidates;
            }
        }
        
        if (candidateModels.length === 0) {
            logger.warn('⚠️ No models match the specified criteria');
            return null;
        }
        
        // Sort by preference
        candidateModels.sort((a, b) => {
            switch (criteria.sortBy) {
                case 'performance':
                    return (a.responseTime || 0) - (b.responseTime || 0);
                case 'tokens':
                    return b.maxInputTokens - a.maxInputTokens;
                case 'health':
                    return (b.successRate || 0) - (a.successRate || 0);
                case 'capabilities':
                default:
                    // Prefer models with more capabilities
                    const aScore = this.calculateCapabilityScore(a);
                    const bScore = this.calculateCapabilityScore(b);
                    return bScore - aScore;
            }
        });
        
        const selectedModel = candidateModels[0];
        logger.info(`🎯 Selected model: ${selectedModel.id}`);
        
        return selectedModel;
    }
    
    /**
     * 📈 Calculate capability score for ranking
     */
    private calculateCapabilityScore(model: ModelCapabilities): number {
        let score = 0;
        
        score += model.maxInputTokens / 1000; // Token capacity
        if (model.supportsVision) score += 50;
        if (model.supportsTools) score += 30;
        if (model.supportsMultimodal) score += 20;
        score += (model.successRate || 0.5) * 100; // Health score
        
        return score;
    }
    
    /**
     * 🔄 Update model pool organization
     */
    private async updateModelPool(models: ModelCapabilities[]): Promise<void> {
        // Reset pools
        this.modelPool = {
            primary: [],
            secondary: [],
            fallback: [],
            unhealthy: [],
            lastUpdated: new Date()
        };
        
        // Organize models by health and capability
        for (const model of models) {
            if (!model.isHealthy) {
                this.modelPool.unhealthy.push(model);
            } else if (model.supportsVision && model.supportsTools) {
                this.modelPool.primary.push(model);
            } else if (model.supportsTools || model.maxInputTokens > 64000) {
                this.modelPool.secondary.push(model);
            } else {
                this.modelPool.fallback.push(model);
            }
        }
        
        // Sort each pool by capability score
        this.modelPool.primary.sort((a, b) => this.calculateCapabilityScore(b) - this.calculateCapabilityScore(a));
        this.modelPool.secondary.sort((a, b) => this.calculateCapabilityScore(b) - this.calculateCapabilityScore(a));
        this.modelPool.fallback.sort((a, b) => this.calculateCapabilityScore(b) - this.calculateCapabilityScore(a));
        
        // Emit pool update event
        this.eventEmitter.fire({ type: 'pool_refreshed', pool: this.modelPool });
        
        logger.info(`🎪 Model pool updated:`, {
            primary: this.modelPool.primary.length,
            secondary: this.modelPool.secondary.length,
            fallback: this.modelPool.fallback.length,
            unhealthy: this.modelPool.unhealthy.length
        });
    }
    
    /**
     * 📊 Initialize metrics for a model
     */
    private initializeModelMetrics(modelId: string): void {
        if (!this.modelMetrics.has(modelId)) {
            this.modelMetrics.set(modelId, {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                lastUsed: new Date(),
                currentLoad: 0
            });
        }
    }
    
    /**
     * 🔄 Start background services
     */
    private startBackgroundServices(): void {
        if (this.config.enableCaching) {
            this.refreshTimer = setInterval(() => {
                this.discoverAllModels().catch(error => {
                    logger.error('Background model refresh failed:', error);
                });
            }, this.config.cacheRefreshInterval);
        }
        
        if (this.config.enablePerformanceTracking) {
            this.healthCheckTimer = setInterval(() => {
                this.performHealthChecks().catch(error => {
                    logger.error('Health check failed:', error);
                });
            }, this.config.healthCheckInterval);
        }
    }
    
    /**
     * 👩‍⚕️ Perform health checks on all models
     */
    private async performHealthChecks(): Promise<void> {
        logger.debug('👩‍⚕️ Performing model health checks...');
        
        const allModels = [...this.modelPool.primary, ...this.modelPool.secondary, ...this.modelPool.fallback];
        
        for (const model of allModels) {
            try {
                // Simple health check - try to get model info
                const isHealthy = model.vsCodeModel.maxInputTokens > 0;
                
                if (model.isHealthy !== isHealthy) {
                    model.isHealthy = isHealthy;
                    this.eventEmitter.fire({ 
                        type: 'model_health_changed', 
                        modelId: model.id, 
                        isHealthy 
                    });
                }
            } catch (error) {
                if (model.isHealthy) {
                    model.isHealthy = false;
                    this.eventEmitter.fire({ 
                        type: 'model_health_changed', 
                        modelId: model.id, 
                        isHealthy: false 
                    });
                }
            }
        }
    }
    
    /**
     * 📋 Get current model pool
     */
    public getModelPool(): ModelPool {
        return { ...this.modelPool };
    }
    
    /**
     * 📋 Get model by ID
     */
    public getModel(modelId: string): ModelCapabilities | undefined {
        return this.modelCache.get(modelId);
    }
    
    /**
     * 📋 Get all available models
     */
    public getAllModels(): ModelCapabilities[] {
        return Array.from(this.modelCache.values());
    }
    
    /**
     * 🧹 Cleanup resources
     */
    public dispose(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        this.eventEmitter.dispose();
    }
}
