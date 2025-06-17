const { Command } = require('commander');

/**
 * Modern command handler using commander.js for robust argument parsing and validation.
 * Maintains a simple plugin registration API while providing industrial-strength features.
 */
class CommandHandler {
    constructor(proxyManager, baseDir) {
        this.proxyManager = proxyManager;
        this.proxyAPI = proxyManager.proxyAPI;
        this.BASE_DIR = baseDir;
        this.modules = new Map();
    }

    /**
     * Register commands for a plugin/module using commander.js under the hood.
     * 
     * @param {string} moduleName - Name of the module (e.g., 'proxy', 'anticheat')
     * @param {Object} commands - Commands object where keys are command names
     * 
     * Examples:
     * 
     * // Simple function handlers
     * register('mymodule', {
     *   hello: (client, args) => api.sendChatMessage('Hello!')
     * });
     * 
     * // With descriptions and commander.js features
     * register('mymodule', {
     *   teleport: {
     *     description: 'Teleport to coordinates',
     *     usage: '<x> <y> <z>',
     *     handler: (client, args) => {
     *       const [x, y, z] = args.map(Number);
     *       // teleport logic
     *     }
     *   },
     *   
     *   // Advanced: comma-separated lists
     *   give: {
     *     description: 'Give items to player',
     *     usage: '<items>',
     *     transform: (value) => value.split(','), // Auto-split comma lists
     *     handler: (client, args) => {
     *       const [items] = args; // items is now an array
     *     }
     *   },
     *   
     *   // Advanced: regex validation
     *   setrank: {
     *     description: 'Set player rank',
     *     usage: '<player> <rank>',
     *     validate: {
     *       player: /^[a-zA-Z0-9_]+$/, // Username validation
     *       rank: ['admin', 'mod', 'user'] // Choice validation
     *     },
     *     handler: (client, args) => {
     *       const [player, rank] = args; // Already validated
     *     }
     *   }
     * });
     */
    register(moduleName, commands) {
        if (this.modules.has(moduleName)) {
            console.warn(`Module '${moduleName}' already registered. Overwriting.`);
        }

        const moduleCommand = new Command(moduleName);
        moduleCommand
            .description(`Commands for ${moduleName} module`)
            .exitOverride()
            .configureOutput({
                writeOut: () => {},
                writeErr: () => {}
            });

        if (moduleName !== 'proxy') {
            this.proxyManager.pluginManager.addPluginManagementCommands(moduleCommand, moduleName);
        }

        for (const [name, command] of Object.entries(commands)) {
            this._addCommand(moduleCommand, name, command);
        }

        const helpCommand = moduleCommand.createCommand('help');
        helpCommand
            .description(`Show help for ${moduleName} commands`)
            .action(() => {
                throw new Error('Help requested');
            });
        moduleCommand.addCommand(helpCommand);

        this.modules.set(moduleName, moduleCommand);
        console.log(`Registered ${moduleCommand.commands.length} commands for module: ${moduleName}`);
    }

    /**
     * Add a single command to a commander.js module.
     * @private
     */
    _addCommand(moduleCommand, name, command) {
        const cmd = moduleCommand.createCommand(name);
        
        if (typeof command === 'function') {
            cmd
                .description(`${name} command`)
                .action((...args) => {
                    const client = args.pop();
                    command.call(this.proxyManager, client, args);
                });
        } else {
            cmd.description(command.description || `${name} command`);
            
            if (command.usage) {
                this._parseUsageString(cmd, command.usage, command);
            }
            
            cmd.action((...args) => {
                const commandObj = args.pop();
                const processedArgs = this._processArguments(args, command);
                command.handler.call(this.proxyManager, this._currentClient, processedArgs);
            });
        }
        
        moduleCommand.addCommand(cmd);
    }

    /**
     * Parse usage string and add arguments to commander.js command.
     * @private
     */
    _parseUsageString(cmd, usage, command) {
        const args = usage.trim().split(/\s+/);
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            let argName, isRequired, isVariadic;
            
            if (arg.startsWith('<') && arg.endsWith('>')) {
                argName = arg.slice(1, -1);
                isRequired = true;
            } else if (arg.startsWith('[') && arg.endsWith(']')) {
                argName = arg.slice(1, -1);
                isRequired = false;
            } else {
                continue;
            }
            
            if (argName.endsWith('...')) {
                argName = argName.slice(0, -3);
                isVariadic = true;
            }
            
            if (isRequired) {
                cmd.argument(`<${argName}${isVariadic ? '...' : ''}>`, argName);
            } else {
                cmd.argument(`[${argName}${isVariadic ? '...' : ''}]`, argName);
            }
        }
    }

    /**
     * Process arguments through validation and transformation.
     * @private
     */
    _processArguments(args, command) {
        if (!command.transform && !command.validate) {
            return args;
        }
        
        const processed = [...args];
        
        if (command.transform) {
            for (let i = 0; i < processed.length; i++) {
                if (typeof command.transform === 'function') {
                    processed[i] = command.transform(processed[i]);
                }
            }
        }
        
        if (command.validate) {
            for (let i = 0; i < processed.length; i++) {
                const value = processed[i];
                const validation = Array.isArray(command.validate) ? command.validate[i] : command.validate;
                
                if (validation instanceof RegExp && !validation.test(value)) {
                    throw new Error(`Invalid argument: ${value} doesn't match required pattern`);
                } else if (Array.isArray(validation) && !validation.includes(value)) {
                    throw new Error(`Invalid argument: ${value}. Must be one of: ${validation.join(', ')}`);
                }
            }
        }
        
        return processed;
    }

    /**
     * Inject client parameter into all command actions.
     * @private
     */
    _injectClientIntoActions(command, client) {
        if (command._actionHandler) {
            const originalAction = command._actionHandler;
            command._actionHandler = (...args) => {
                args.push(client);
                return originalAction(...args);
            };
        }
        
        for (const subcommand of command.commands) {
            this._injectClientIntoActions(subcommand, client);
        }
    }

    /**
     * Send help message for a module.
     * @private
     */
    _sendHelpMessage(moduleName, moduleCommand, client) {
        let message = `§6=== /${moduleName} Commands ===\n`;
        
        const commands = moduleCommand.commands
            .filter(cmd => cmd.name() !== 'help');

        for (const cmd of commands) {
            let usage = '';
            if (cmd._usage) {
                usage = cmd._usage;
            } else {
                const args = cmd.registeredArguments.map(arg => {
                    const name = arg.name();
                    const variadic = arg.variadic ? '...' : '';
                    return arg.required ? `<${name}${variadic}>` : `[${name}${variadic}]`;
                });
                usage = args.join(' ');
            }
            
            message += `§e/${moduleName} ${cmd.name()} ${usage} §7- ${cmd.description()}\n`;
        }

        message += `§e/${moduleName} help §7- Show this help message`;

        this.proxyManager.sendChatMessage(client, message);
    }

    /**
     * Send error message to client.
     * @private
     */
    _sendError(client, message) {
        this.proxyManager.sendChatMessage(client, `§c${message}`);
    }

    /**
     * Send success message to client.
     * @private
     */
    _sendSuccess(client, message) {
        this.proxyManager.sendChatMessage(client, `§a${message}`);
    }

    /**
     * Get all registered modules (for debugging).
     */
    getModules() {
        return Array.from(this.modules.keys());
    }

    /**
     * Get commands for a specific module (for debugging).
     */
    getModuleCommands(moduleName) {
        const module = this.modules.get(moduleName);
        return module ? module.commands.map(cmd => cmd.name()) : [];
    }

    /**
     * Handle incoming chat message and execute command if applicable.
     * @param {string} message - The chat message
     * @param {Object} client - The minecraft client
     * @returns {boolean} - True if message was handled as a command
     */
    handleCommand(message, client) {
        if (!message.startsWith('/')) return false;

        const parts = message.slice(1).split(' ');
        const moduleName = parts.shift()?.toLowerCase();
        const args = parts;

        const moduleCommand = this.modules.get(moduleName);
        if (!moduleCommand) return false;

        if (moduleName !== 'proxy') {
            const isEnabled = this.proxyManager.pluginManager.isPluginEnabled(moduleName);
            const isManagementCommand = ['enable', 'disable', 'help'].includes(args[0]);
            
            if (!isEnabled && !isManagementCommand) {
                this._sendError(client, `Plugin '${moduleName}' is disabled. Use '/${moduleName} enable' to enable it.`);
                return true;
            }
        }

        try {
            this._currentClient = client;
            const argv = ['node', 'script', ...args];
            moduleCommand.parse(argv);
            
        } catch (error) {
            if (error.code === 'commander.help' || error.message === 'Help requested') {
                this._sendHelpMessage(moduleName, moduleCommand, client);
                return true;
            } else if (error.code === 'commander.unknownCommand') {
                this._sendError(client, `Unknown command. Use '/${moduleName} help' for available commands.`);
            } else if (error.code === 'commander.invalidArgument') {
                this._sendError(client, error.message);
            } else if (error.code === 'commander.missingArgument') {
                this._sendError(client, error.message);
            } else {
                console.error(`Error executing /${moduleName} ${args.join(' ')}:`, error);
                this._sendError(client, 'An error occurred while executing the command.');
            }
        }

        return true;
    }
}

module.exports = CommandHandler;
