/**
 * Logger Utility
 * Centralized logging with context and request tracking
 */

import * as vscode from 'vscode';
import { LogEntry } from '../types/VSCode';
import { LOG_LEVELS, CONFIG_SECTION } from '../constants/Config';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private isLoggingEnabled: boolean = true;
    private logEntries: LogEntry[] = [];
    private maxLogEntries: number = 1000;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Copilot-LMAPI');
        this.updateLoggingState();
    }

    private updateLoggingState(): void {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        this.isLoggingEnabled = config.get<boolean>('enableLogging', true);
    }

    private formatMessage(level: string, message: string, context?: Record<string, any>, requestId?: string): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
        const requestIdStr = requestId ? ` | Request: ${requestId}` : '';
        
        return `[${timestamp}] [${level.toUpperCase()}]${requestIdStr} ${message}${contextStr}`;
    }

    private log(level: keyof typeof LOG_LEVELS, message: string, context?: Record<string, any>, requestId?: string): void {
        if (!this.isLoggingEnabled && level !== 'ERROR') {
            return;
        }

        const logEntry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            context,
            requestId
        };

        // Add to memory store
        this.logEntries.push(logEntry);
        if (this.logEntries.length > this.maxLogEntries) {
            this.logEntries = this.logEntries.slice(-this.maxLogEntries);
        }

        // Format and output
        const formattedMessage = this.formatMessage(level, message, context, requestId);
        
        // Always show in output channel
        this.outputChannel.appendLine(formattedMessage);

        // Show error notifications in VS Code
        if (level === 'ERROR') {
            vscode.window.showErrorMessage(`Copilot-LMAPI: ${message}`);
        }

        // Console output for development
        if (process.env.NODE_ENV === 'development') {
            console.log(formattedMessage);
        }
    }

    public debug(message: string, context?: Record<string, any>, requestId?: string): void {
        this.log('DEBUG', message, context, requestId);
    }

    public info(message: string, context?: Record<string, any>, requestId?: string): void {
        this.log('INFO', message, context, requestId);
    }

    public warn(message: string, context?: Record<string, any>, requestId?: string): void {
        this.log('WARN', message, context, requestId);
    }

    public error(message: string, error?: Error, context?: Record<string, any>, requestId?: string): void {
        const errorContext = {
            ...context,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : undefined
        };
        this.log('ERROR', message, errorContext, requestId);
    }

    public logRequest(method: string, url: string, requestId: string, body?: any): void {
        this.info(`Incoming request: ${method} ${url}`, { 
            body: body ? JSON.stringify(body).substring(0, 500) : undefined 
        }, requestId);
    }

    public logResponse(statusCode: number, requestId: string, duration: number, error?: string): void {
        const level = statusCode >= 400 ? 'ERROR' : 'INFO';
        const message = `Response: ${statusCode} (${duration}ms)`;
        this.log(level, message, { 
            statusCode, 
            duration, 
            error 
        }, requestId);
    }

    public logServerEvent(event: string, details?: Record<string, any>): void {
        this.info(`Server event: ${event}`, details);
    }

    public getRecentLogs(count: number = 100): LogEntry[] {
        return this.logEntries.slice(-count);
    }

    public clearLogs(): void {
        this.logEntries = [];
        this.outputChannel.clear();
        this.info('Log history cleared');
    }

    public show(): void {
        this.outputChannel.show();
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }

    // Create request-scoped logger
    public createRequestLogger(requestId: string) {
        return {
            debug: (message: string, context?: Record<string, any>) => 
                this.debug(message, context, requestId),
            info: (message: string, context?: Record<string, any>) => 
                this.info(message, context, requestId),
            warn: (message: string, context?: Record<string, any>) => 
                this.warn(message, context, requestId),
            error: (message: string, error?: Error, context?: Record<string, any>) => 
                this.error(message, error, context, requestId),
        };
    }
}

// Singleton instance
export const logger = new Logger();