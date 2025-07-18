/**
 * VS Code Extension Entry Point
 * Copilot-LMAPI Extension
 */

import * as vscode from 'vscode';
import { CopilotServer } from './server/CopilotServer';
import { logger } from './utils/Logger';
import { COMMANDS, NOTIFICATIONS, STATUS_BAR_PRIORITIES } from './constants/Config';

let server: CopilotServer;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    logger.info('Copilot-LMAPI extension activating');

    // Initialize server
    server = new CopilotServer();

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        STATUS_BAR_PRIORITIES.SERVER_STATUS
    );
    statusBarItem.command = COMMANDS.STATUS;
    context.subscriptions.push(statusBarItem);

    // Register commands
    registerCommands(context);

    // Auto-start if configured
    const config = vscode.workspace.getConfiguration('copilot-lmapi');
    if (config.get<boolean>('autoStart', false)) {
        vscode.commands.executeCommand(COMMANDS.START);
    }

    // Update status bar
    updateStatusBar();

    logger.info('Copilot-LMAPI extension activated');
}

/**
 * Extension deactivation
 */
export function deactivate() {
    logger.info('Copilot-LMAPI extension deactivating');

    if (server) {
        server.dispose();
    }

    if (statusBarItem) {
        statusBarItem.dispose();
    }

    logger.dispose();
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Start server command
    const startCommand = vscode.commands.registerCommand(COMMANDS.START, async () => {
        try {
            if (server.getState().isRunning) {
                vscode.window.showWarningMessage('Server is already running');
                return;
            }

            await server.start();
            updateStatusBar();
            
        } catch (error) {
            const errorMessage = `Failed to start server: ${(error as Error).message}`;
            logger.error(errorMessage, error as Error);
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    // Stop server command
    const stopCommand = vscode.commands.registerCommand(COMMANDS.STOP, async () => {
        try {
            if (!server.getState().isRunning) {
                vscode.window.showWarningMessage('Server is not running');
                return;
            }

            await server.stop();
            updateStatusBar();
            
        } catch (error) {
            const errorMessage = `Failed to stop server: ${(error as Error).message}`;
            logger.error(errorMessage, error as Error);
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    // Restart server command
    const restartCommand = vscode.commands.registerCommand(COMMANDS.RESTART, async () => {
        try {
            await server.restart();
            updateStatusBar();
            vscode.window.showInformationMessage('Server restarted successfully');
            
        } catch (error) {
            const errorMessage = `Failed to restart server: ${(error as Error).message}`;
            logger.error(errorMessage, error as Error);
            vscode.window.showErrorMessage(errorMessage);
        }
    });

    // Status command
    const statusCommand = vscode.commands.registerCommand(COMMANDS.STATUS, async () => {
        showServerStatus();
    });

    // Register all commands
    context.subscriptions.push(
        startCommand,
        stopCommand,
        restartCommand,
        statusCommand
    );

    // Register server disposal
    context.subscriptions.push({
        dispose: () => {
            if (server) {
                server.dispose();
            }
        }
    });
}

/**
 * Update status bar display
 */
function updateStatusBar() {
    const state = server.getState();
    const config = server.getConfig();

    if (state.isRunning) {
        statusBarItem.text = `$(server) LM API :${state.port}`;
        statusBarItem.tooltip = `LM API Server running on http://${state.host}:${state.port}\nClick for details`;
        statusBarItem.backgroundColor = undefined; // Default (green-ish)
    } else {
        statusBarItem.text = `$(server) LM API (stopped)`;
        statusBarItem.tooltip = 'LM API Server is stopped\nClick to start';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    statusBarItem.show();
}

/**
 * Show detailed server status
 */
async function showServerStatus() {
    const state = server.getState();
    const config = server.getConfig();

    if (state.isRunning) {
        const uptime = state.startTime ? Math.floor((Date.now() - state.startTime.getTime()) / 1000) : 0;
        const uptimeStr = formatUptime(uptime);

        const items = [
            {
                label: 'Stop Server',
                description: 'Stop the OpenAI API server',
                action: 'stop'
            },
            {
                label: 'Restart Server',
                description: 'Restart the OpenAI API server',
                action: 'restart'
            },
            {
                label: 'Show Logs',
                description: 'Open the extension logs',
                action: 'logs'
            },
            {
                label: 'Copy API URL',
                description: `http://${state.host}:${state.port}`,
                action: 'copy-url'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'LM API Server Status',
            placeHolder: `Running on http://${state.host}:${state.port} | Uptime: ${uptimeStr} | Requests: ${state.requestCount}`
        });

        if (selected) {
            await handleStatusAction(selected.action, state, config);
        }
    } else {
        const items = [
            {
                label: 'Start Server',
                description: `Start on http://${config.host}:${config.port}`,
                action: 'start'
            },
            {
                label: 'Configure',
                description: 'Open extension settings',
                action: 'configure'
            },
            {
                label: 'Show Logs',
                description: 'Open the extension logs',
                action: 'logs'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'LM API Server Status',
            placeHolder: 'Server is stopped'
        });

        if (selected) {
            await handleStatusAction(selected.action, state, config);
        }
    }
}

/**
 * Handle status panel actions
 */
async function handleStatusAction(action: string, state: any, config: any) {
    switch (action) {
        case 'start':
            await vscode.commands.executeCommand(COMMANDS.START);
            break;
        case 'stop':
            await vscode.commands.executeCommand(COMMANDS.STOP);
            break;
        case 'restart':
            await vscode.commands.executeCommand(COMMANDS.RESTART);
            break;
        case 'logs':
            logger.show();
            break;
        case 'configure':
            await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-lmapi');
            break;
        case 'copy-url':
            const url = `http://${state.host}:${state.port}`;
            await vscode.env.clipboard.writeText(url);
            vscode.window.showInformationMessage(`Copied ${url} to clipboard`);
            break;
    }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${remainingSeconds}s`;
    }
}

/**
 * Health check for Copilot availability
 */
async function checkCopilotHealth(): Promise<boolean> {
    try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        return models.length > 0;
    } catch (error) {
        logger.warn('Copilot health check failed', { error: (error as Error).message });
        return false;
    }
}

/**
 * Show Copilot setup instructions if needed
 */
async function showCopilotSetupIfNeeded() {
    const hasCopilot = await checkCopilotHealth();
    
    if (!hasCopilot) {
        const action = await vscode.window.showWarningMessage(
            'GitHub Copilot is not available. The extension requires an active Copilot subscription.',
            'Learn More',
            'Dismiss'
        );

        if (action === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/features/copilot'));
        }
    }
}

// Periodic health checks
setInterval(async () => {
    const hasCopilot = await checkCopilotHealth();
    if (!hasCopilot && server.getState().isRunning) {
        logger.warn('Copilot access lost while server is running');
    }
}, 60000); // Check every minute