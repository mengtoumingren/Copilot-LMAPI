/**
 * 🛠️ Revolutionary Function Calling Service
 * ✨ Bridges OpenAI function calling with VS Code Language Model Tool API
 * 🚀 Full support for dynamic tool discovery and execution!
 */

import * as vscode from 'vscode';
import { 
    FunctionDefinition, 
    ToolCall, 
    EnhancedMessage,
    ModelCapabilities 
} from '../types/ModelCapabilities';
import { logger } from '../utils/Logger';

// 🛠️ Enhanced Tool Definition
export interface EnhancedTool {
    definition: FunctionDefinition;
    handler: (parameters: any, context: ToolExecutionContext) => Promise<any>;
    metadata: {
        category: string;
        description: string;
        version: string;
        author: string;
        requiresAuth?: boolean;
        rateLimited?: boolean;
    };
}

// 🎯 Tool Execution Context
export interface ToolExecutionContext {
    requestId: string;
    modelId: string;
    userId?: string;
    sessionId?: string;
    environment: 'development' | 'production';
    permissions: string[];
}

// 📋 Tool Registry Entry
export interface ToolRegistryEntry {
    id: string;
    tool: EnhancedTool;
    isEnabled: boolean;
    usageCount: number;
    lastUsed?: Date;
    errorCount: number;
}

export class FunctionCallService {
    private toolRegistry: Map<string, ToolRegistryEntry>;
    private eventEmitter: vscode.EventEmitter<{ type: string; data: any }>;
    private builtInTools: Map<string, EnhancedTool>;
    
    constructor() {
        this.toolRegistry = new Map();
        this.eventEmitter = new vscode.EventEmitter();
        this.builtInTools = new Map();
        
        this.initializeBuiltInTools();
    }
    
    /**
     * 🚀 Initialize built-in tools
     */
    private initializeBuiltInTools(): void {
        // 📊 Calculator Tool
        this.registerTool('calculator', {
            definition: {
                name: 'calculator',
                description: 'Perform mathematical calculations',
                parameters: {
                    type: 'object',
                    properties: {
                        expression: {
                            type: 'string',
                            description: 'Mathematical expression to evaluate'
                        }
                    },
                    required: ['expression']
                }
            },
            handler: this.calculatorHandler.bind(this),
            metadata: {
                category: 'math',
                description: 'Built-in calculator for mathematical operations',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        // 📅 Date/Time Tool
        this.registerTool('datetime', {
            definition: {
                name: 'datetime',
                description: 'Get current date and time information',
                parameters: {
                    type: 'object',
                    properties: {
                        format: {
                            type: 'string',
                            description: 'Date format (iso, locale, timestamp)',
                            enum: ['iso', 'locale', 'timestamp']
                        },
                        timezone: {
                            type: 'string',
                            description: 'Timezone (optional)'
                        }
                    },
                    required: []
                }
            },
            handler: this.datetimeHandler.bind(this),
            metadata: {
                category: 'utility',
                description: 'Get current date and time in various formats',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        // 📁 File System Tool (Read-Only)
        this.registerTool('file_info', {
            definition: {
                name: 'file_info',
                description: 'Get information about files and directories (read-only)',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'File or directory path'
                        },
                        operation: {
                            type: 'string',
                            description: 'Operation type',
                            enum: ['stat', 'list', 'exists']
                        }
                    },
                    required: ['path', 'operation']
                }
            },
            handler: this.fileInfoHandler.bind(this),
            metadata: {
                category: 'filesystem',
                description: 'Read-only file system operations',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        logger.info(`🛠️ Initialized ${this.builtInTools.size} built-in tools`);
    }
    
    /**
     * 📝 Register a new tool
     */
    public registerTool(id: string, tool: EnhancedTool): void {
        const entry: ToolRegistryEntry = {
            id,
            tool,
            isEnabled: true,
            usageCount: 0,
            errorCount: 0
        };
        
        this.toolRegistry.set(id, entry);
        this.builtInTools.set(id, tool);
        
        logger.info(`✅ Registered tool: ${id}`);
        
        this.eventEmitter.fire({
            type: 'tool_registered',
            data: { id, tool: tool.definition }
        });
    }
    
    /**
     * 🚀 Convert OpenAI functions to VS Code tools format
     */
    public convertFunctionsToTools(functions: FunctionDefinition[]): any[] {
        const tools: any[] = [];
        
        for (const func of functions) {
            try {
                // Check if we have a handler for this function
                const registryEntry = this.toolRegistry.get(func.name);
                
                if (registryEntry && registryEntry.isEnabled) {
                    // Create VS Code tool - using basic object for compatibility
                    const tool = {
                        name: func.name,
                        description: func.description || '',
                        parametersSchema: func.parameters
                    };
                    
                    tools.push(tool);
                } else {
                    logger.warn(`⚠️ Function ${func.name} not found in registry or disabled`);
                }
            } catch (error) {
                logger.error(`Failed to convert function ${func.name}:`, error as Error);
            }
        }
        
        return tools;
    }
    
    /**
     * 🎯 Execute a tool call
     */
    public async executeToolCall(
        toolCall: ToolCall, 
        context: ToolExecutionContext
    ): Promise<{ success: boolean; result?: any; error?: string }> {
        
        const startTime = Date.now();
        const toolName = toolCall.function.name;
        
        try {
            // Get tool from registry
            const registryEntry = this.toolRegistry.get(toolName);
            
            if (!registryEntry) {
                throw new Error(`Tool ${toolName} not found`);
            }
            
            if (!registryEntry.isEnabled) {
                throw new Error(`Tool ${toolName} is disabled`);
            }
            
            // Parse arguments
            let parameters: any;
            try {
                parameters = JSON.parse(toolCall.function.arguments);
            } catch (error) {
                throw new Error(`Invalid JSON arguments: ${error}`);
            }
            
            // Validate parameters against schema
            const validationResult = this.validateParameters(
                parameters, 
                registryEntry.tool.definition.parameters
            );
            
            if (!validationResult.isValid) {
                throw new Error(`Parameter validation failed: ${validationResult.error}`);
            }
            
            // Execute the tool
            logger.info(`🛠️ Executing tool: ${toolName}`, { parameters, requestId: context.requestId });
            
            const result = await Promise.race([
                registryEntry.tool.handler(parameters, context),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
                )
            ]);
            
            // Update metrics
            registryEntry.usageCount++;
            registryEntry.lastUsed = new Date();
            
            const executionTime = Date.now() - startTime;
            logger.info(`✅ Tool executed successfully: ${toolName} (${executionTime}ms)`);
            
            this.eventEmitter.fire({
                type: 'tool_executed',
                data: { toolName, success: true, executionTime, requestId: context.requestId }
            });
            
            return { success: true, result };
            
        } catch (error) {
            // Update error metrics
            const registryEntry = this.toolRegistry.get(toolName);
            if (registryEntry) {
                registryEntry.errorCount++;
            }
            
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            logger.error(`❌ Tool execution failed: ${toolName} (${executionTime}ms)`, error as Error, {
                requestId: context.requestId
            });
            
            this.eventEmitter.fire({
                type: 'tool_error',
                data: { toolName, error: errorMessage, executionTime, requestId: context.requestId }
            });
            
            return { success: false, error: errorMessage };
        }
    }
    
    /**
     * 📋 Validate parameters against schema
     */
    private validateParameters(parameters: any, schema: any): { isValid: boolean; error?: string } {
        try {
            // Basic validation - in production, use a proper JSON schema validator
            if (schema.required) {
                for (const required of schema.required) {
                    if (!(required in parameters)) {
                        return { isValid: false, error: `Missing required parameter: ${required}` };
                    }
                }
            }
            
            return { isValid: true };
        } catch (error) {
            return { isValid: false, error: String(error) };
        }
    }
    
    /**
     * 📊 Calculator tool handler
     */
    private async calculatorHandler(parameters: any, context: ToolExecutionContext): Promise<any> {
        const { expression } = parameters;
        
        // Safe expression evaluation (basic operations only)
        const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
        
        try {
            // Use Function constructor for safe evaluation
            const result = new Function('return ' + safeExpression)();
            
            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Invalid calculation result');
            }
            
            return {
                expression: safeExpression,
                result: result,
                type: 'calculation'
            };
        } catch (error) {
            throw new Error(`Calculation error: ${error}`);
        }
    }
    
    /**
     * 📅 Date/time tool handler
     */
    private async datetimeHandler(parameters: any, context: ToolExecutionContext): Promise<any> {
        const { format = 'iso', timezone } = parameters;
        const now = new Date();
        
        let result: string;
        
        switch (format) {
            case 'iso':
                result = now.toISOString();
                break;
            case 'locale':
                result = now.toLocaleString();
                break;
            case 'timestamp':
                result = now.getTime().toString();
                break;
            default:
                result = now.toISOString();
        }
        
        return {
            datetime: result,
            format: format,
            timezone: timezone || 'local',
            timestamp: now.getTime()
        };
    }
    
    /**
     * 📁 File info tool handler
     */
    private async fileInfoHandler(parameters: any, context: ToolExecutionContext): Promise<any> {
        const { path, operation } = parameters;
        const fs = require('fs').promises;
        
        try {
            switch (operation) {
                case 'exists':
                    try {
                        await fs.access(path);
                        return { exists: true, path };
                    } catch {
                        return { exists: false, path };
                    }
                
                case 'stat':
                    const stat = await fs.stat(path);
                    return {
                        path,
                        size: stat.size,
                        isFile: stat.isFile(),
                        isDirectory: stat.isDirectory(),
                        created: stat.birthtime.toISOString(),
                        modified: stat.mtime.toISOString()
                    };
                
                case 'list':
                    const entries = await fs.readdir(path);
                    return {
                        path,
                        entries: entries.slice(0, 100), // Limit results
                        total: entries.length
                    };
                
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        } catch (error) {
            throw new Error(`File operation failed: ${error}`);
        }
    }
    
    /**
     * 📋 Get available tools for model
     */
    public getAvailableTools(modelCapabilities: ModelCapabilities): FunctionDefinition[] {
        const tools: FunctionDefinition[] = [];
        
        if (!modelCapabilities.supportsTools) {
            return tools;
        }
        
        for (const [id, entry] of this.toolRegistry) {
            if (entry.isEnabled) {
                tools.push(entry.tool.definition);
            }
        }
        
        return tools;
    }
    
    /**
     * 📋 Get tool usage statistics
     */
    public getToolStats(): { [toolId: string]: { usageCount: number; errorCount: number; lastUsed?: Date } } {
        const stats: { [toolId: string]: { usageCount: number; errorCount: number; lastUsed?: Date } } = {};
        
        for (const [id, entry] of this.toolRegistry) {
            stats[id] = {
                usageCount: entry.usageCount,
                errorCount: entry.errorCount,
                lastUsed: entry.lastUsed
            };
        }
        
        return stats;
    }
    
    /**
     * 🔄 Enable/disable a tool
     */
    public setToolEnabled(toolId: string, enabled: boolean): boolean {
        const entry = this.toolRegistry.get(toolId);
        if (entry) {
            entry.isEnabled = enabled;
            logger.info(`Tool ${toolId} ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        }
        return false;
    }
    
    /**
     * 🧹 Cleanup resources
     */
    public dispose(): void {
        this.eventEmitter.dispose();
        this.toolRegistry.clear();
        this.builtInTools.clear();
    }
}
