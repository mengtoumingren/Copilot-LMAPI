/**
 * 🛠️ 革命性函数调用服务
 * ✨ 连接 OpenAI 函数调用和 VS Code 语言模型工具 API
 * 🚀 完全支持动态工具发现和执行！
 */

import * as vscode from 'vscode';
import { 
    FunctionDefinition, 
    ToolCall, 
    EnhancedMessage,
    ModelCapabilities 
} from '../types/ModelCapabilities';
import { logger } from '../utils/Logger';

// 🛠️ 增强型工具定义
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

// 🎯 工具执行上下文
export interface ToolExecutionContext {
    requestId: string;
    modelId: string;
    userId?: string;
    sessionId?: string;
    environment: 'development' | 'production';
    permissions: string[];
}

// 📋 工具注册表条目
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
     * 🚀 初始化内置工具
     */
    private initializeBuiltInTools(): void {
        // 📊 计算器工具
        this.registerTool('calculator', {
            definition: {
                name: 'calculator',
                description: '执行数学计算',
                parameters: {
                    type: 'object',
                    properties: {
                        expression: {
                            type: 'string',
                            description: '要评估的数学表达式'
                        }
                    },
                    required: ['expression']
                }
            },
            handler: this.calculatorHandler.bind(this),
            metadata: {
                category: 'math',
                description: '用于数学运算的内置计算器',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        // 📅 日期/时间工具
        this.registerTool('datetime', {
            definition: {
                name: 'datetime',
                description: '获取当前日期和时间信息',
                parameters: {
                    type: 'object',
                    properties: {
                        format: {
                            type: 'string',
                            description: '日期格式 (iso, locale, timestamp)'
                            enum: ['iso', 'locale', 'timestamp']
                        },
                        timezone: {
                            type: 'string',
                            description: '时区（可选）'
                        }
                    },
                    required: []
                }
            },
            handler: this.datetimeHandler.bind(this),
            metadata: {
                category: 'utility',
                description: '以各种格式获取当前日期和时间',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        // 📁 文件系统工具（只读）
        this.registerTool('file_info', {
            definition: {
                name: 'file_info',
                description: '获取文件和目录信息（只读）',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: '文件或目录路径'
                        },
                        operation: {
                            type: 'string',
                            description: '操作类型',
                            enum: ['stat', 'list', 'exists']
                        }
                    },
                    required: ['path', 'operation']
                }
            },
            handler: this.fileInfoHandler.bind(this),
            metadata: {
                category: 'filesystem',
                description: '只读文件系统操作',
                version: '1.0.0',
                author: 'copilot-lmapi'
            }
        });
        
        logger.info(`🛠️ 初始化了 ${this.builtInTools.size} 个内置工具`);
    }
    
    /**
     * 📝 注册新工具
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
        
        logger.info(`✅ 已注册工具： ${id}`);
        
        this.eventEmitter.fire({
            type: 'tool_registered',
            data: { id, tool: tool.definition }
        });
    }
    
    /**
     * 🚀 将 OpenAI 函数转换为 VS Code 工具格式
     */
    public convertFunctionsToTools(functions: FunctionDefinition[]): any[] {
        const tools: any[] = [];
        
        for (const func of functions) {
            try {
                // 检查是否有此函数的处理程序
                const registryEntry = this.toolRegistry.get(func.name);
                
                if (registryEntry && registryEntry.isEnabled) {
                    // 创建 VS Code 工具 - 为兼容性使用基本对象
                    const tool = {
                        name: func.name,
                        description: func.description || '',
                        parametersSchema: func.parameters
                    };
                    
                    tools.push(tool);
                } else {
                    logger.warn(`⚠️ 函数 ${func.name} 在注册表中未找到或已禁用`);
                }
            } catch (error) {
                logger.error(`转换函数 ${func.name} 失败：`, error as Error);
            }
        }
        
        return tools;
    }
    
    /**
     * 🎯 执行工具调用
     */
    public async executeToolCall(
        toolCall: ToolCall, 
        context: ToolExecutionContext
    ): Promise<{ success: boolean; result?: any; error?: string }> {
        
        const startTime = Date.now();
        const toolName = toolCall.function.name;
        
        try {
            // 从注册表获取工具
            const registryEntry = this.toolRegistry.get(toolName);
            
            if (!registryEntry) {
                throw new Error(`工具 ${toolName} 未找到`);
            }
            
            if (!registryEntry.isEnabled) {
                throw new Error(`工具 ${toolName} 已禁用`);
            }
            
            // 解析参数
            let parameters: any;
            try {
                parameters = JSON.parse(toolCall.function.arguments);
            } catch (error) {
                throw new Error(`无效的 JSON 参数： ${error}`);
            }
            
            // 根据模式验证参数
            const validationResult = this.validateParameters(
                parameters, 
                registryEntry.tool.definition.parameters
            );
            
            if (!validationResult.isValid) {
                throw new Error(`参数验证失败： ${validationResult.error}`);
            }
            
            // 执行工具
            logger.info(`🛠️ 正在执行工具： ${toolName}`, { parameters, requestId: context.requestId });
            
            const result = await Promise.race([
                registryEntry.tool.handler(parameters, context),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('工具执行超时')), 30000)
                )
            ]);
            
            // 更新指标
            registryEntry.usageCount++;
            registryEntry.lastUsed = new Date();
            
            const executionTime = Date.now() - startTime;
            logger.info(`✅ 工具执行成功： ${toolName} (${executionTime}ms)`);
            
            this.eventEmitter.fire({
                type: 'tool_executed',
                data: { toolName, success: true, executionTime, requestId: context.requestId }
            });
            
            return { success: true, result };
            
        } catch (error) {
            // 更新错误指标
            const registryEntry = this.toolRegistry.get(toolName);
            if (registryEntry) {
                registryEntry.errorCount++;
            }
            
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            logger.error(`❌ 工具执行失败： ${toolName} (${executionTime}ms)`, error as Error, {
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
     * 📋 根据模式验证参数
     */
    private validateParameters(parameters: any, schema: any): { isValid: boolean; error?: string } {
        try {
            // 基本验证 - 在生产中使用适当的 JSON 模式验证器
            if (schema.required) {
                for (const required of schema.required) {
                    if (!(required in parameters)) {
                        return { isValid: false, error: `缺少必需参数： ${required}` };
                    }
                }
            }
            
            return { isValid: true };
        } catch (error) {
            return { isValid: false, error: String(error) };
        }
    }
    
    /**
     * 📊 计算器工具处理程序
     */
    private async calculatorHandler(parameters: any, context: ToolExecutionContext): Promise<any> {
        const { expression } = parameters;
        
        // 安全表达式评估（仅基本操作）
        const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
        
        try {
            // 使用 Function 构造函数进行安全评估
            const result = new Function('return ' + safeExpression)();
            
            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('无效的计算结果');
            }
            
            return {
                expression: safeExpression,
                result: result,
                type: 'calculation'
            };
        } catch (error) {
            throw new Error(`计算错误： ${error}`);
        }
    }
    
    /**
     * 📅 日期/时间工具处理程序
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
     * 📁 文件信息工具处理程序
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
                        entries: entries.slice(0, 100), // 限制结果
                        total: entries.length
                    };
                
                default:
                    throw new Error(`未知操作： ${operation}`);
            }
        } catch (error) {
            throw new Error(`文件操作失败： ${error}`);
        }
    }
    
    /**
     * 📋 获取模型可用的工具
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
     * 📋 获取工具使用统计信息
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
     * 🔄 启用/禁用工具
     */
    public setToolEnabled(toolId: string, enabled: boolean): boolean {
        const entry = this.toolRegistry.get(toolId);
        if (entry) {
            entry.isEnabled = enabled;
            logger.info(`工具 ${toolId} ${enabled ? '已启用' : '已禁用'}`);
            return true;
        }
        return false;
    }
    
    /**
     * 🧹 清理资源
     */
    public dispose(): void {
        this.eventEmitter.dispose();
        this.toolRegistry.clear();
        this.builtInTools.clear();
    }
}
