/**
 * Dynamic Model Capabilities and Discovery System
 * 🚀 Revolutionary model management without hardcoded limitations
 */

import * as vscode from 'vscode';

// 🎯 Dynamic Model Capabilities
export interface ModelCapabilities {
    id: string;
    family?: string;
    vendor?: string;
    version?: string;
    
    // Core capabilities
    maxInputTokens: number;
    maxOutputTokens?: number;
    contextWindow: number;
    
    // Feature support detection
    supportsVision: boolean;
    supportsTools: boolean;
    supportsFunctionCalling: boolean;
    supportsStreaming: boolean;
    supportsMultimodal: boolean;
    
    // Performance metrics
    lastTestedAt?: Date;
    responseTime?: number;
    successRate?: number;
    isHealthy: boolean;
    
    // Advanced features
    supportedImageFormats?: string[];
    maxImageSize?: number;
    maxImagesPerRequest?: number;
    
    // Raw VS Code model reference
    vsCodeModel: vscode.LanguageModelChat;
}

// 🔧 Model Selection Criteria (Dynamic)
export interface DynamicModelCriteria {
    preferredModels?: string[];
    requiredCapabilities?: (keyof ModelCapabilities)[];
    minContextTokens?: number;
    requiresVision?: boolean;
    requiresTools?: boolean;
    excludeModels?: string[];
    sortBy?: 'performance' | 'tokens' | 'capabilities' | 'health';
}

// 🎨 Enhanced Message Types for Multimodal
export interface EnhancedMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{
        type: 'text' | 'image_url';
        text?: string;
        image_url?: {
            url: string;
            detail?: 'low' | 'high' | 'auto';
        };
    }>;
    name?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

// 🛠️ Function/Tool Calling Support
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface FunctionDefinition {
    name: string;
    description?: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

// 📈 Model Performance Metrics
export interface ModelMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastUsed: Date;
    currentLoad: number;
}

// 🧠 Model Discovery Configuration
export interface ModelDiscoveryConfig {
    enableCaching: boolean;
    cacheRefreshInterval: number;
    healthCheckInterval: number;
    capabilityTestTimeout: number;
    enablePerformanceTracking: boolean;
    enableAutoFailover: boolean;
}

// 🎪 Model Pool Management
export interface ModelPool {
    primary: ModelCapabilities[];
    secondary: ModelCapabilities[];
    fallback: ModelCapabilities[];
    unhealthy: ModelCapabilities[];
    lastUpdated: Date;
}

// 📋 Request Context with Enhanced Features
export interface EnhancedRequestContext {
    requestId: string;
    model?: string;
    isStream: boolean;
    startTime: Date;
    clientIP?: string;
    userAgent?: string;
    
    // New capabilities
    hasImages: boolean;
    hasFunctions: boolean;
    requiredCapabilities: string[];
    estimatedTokens: number;
    selectedModel?: ModelCapabilities;
}

// 🎛️ Dynamic Configuration Interface
export interface DynamicModelConfig {
    // Remove all hardcoded limitations
    allowAllModels: boolean;
    
    // Intelligent model selection
    enableSmartSelection: boolean;
    enableLoadBalancing: boolean;
    enableAutoFailover: boolean;
    
    // Performance optimization
    enableModelCaching: boolean;
    enableCapabilityTesting: boolean;
    enablePerformanceMonitoring: boolean;
    
    // Feature gates
    enableVisionSupport: boolean;
    enableFunctionCalling: boolean;
    enableMultimodalRequests: boolean;
    
    // Limits (soft, not hardcoded)
    preferredMaxTokens?: number;
    emergencyFallbackModel?: string;
}

// 🚀 Model Discovery Events
export type ModelEvent = 
    | { type: 'model_discovered'; model: ModelCapabilities }
    | { type: 'model_health_changed'; modelId: string; isHealthy: boolean }
    | { type: 'capability_updated'; modelId: string; capabilities: Partial<ModelCapabilities> }
    | { type: 'pool_refreshed'; pool: ModelPool }
    | { type: 'failover_triggered'; from: string; to: string; reason: string };

// 🎯 Export all dynamic types
export {
    vscode // Re-export for convenience
};
