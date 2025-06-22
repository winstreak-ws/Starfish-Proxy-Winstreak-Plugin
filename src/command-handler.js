const { Command, Option } = require('commander');

function getProperty(obj, path) {
    if (obj === undefined || obj === null) return undefined;
    return path.split('.').reduce((o, i) => (o === undefined || o === null) ? o : o[i], obj);
}

function setProperty(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((o, i) => (o[i] = o[i] || {}), obj);
    if (target) {
        target[lastKey] = value;
    }
}

// theme
const THEME = {
    primary: '§6',   // Gold - Main commands, important elements
    secondary: '§e', // Yellow - Labels, secondary headings
    accent: '§b',    // Aqua - Values, highlights, clickable elements
    success: '§a',   // Green - Success messages, positive status
    error: '§c',     // Red - Error messages, negative status
    danger: '§4',    // Dark Red - Destructive actions, reset
    info: '§9',      // Blue - Information, descriptions
    special: '§5',   // Purple - Headers, special elements
    muted: '§8',     // Dark Gray - Less important text, separators
    text: '§7',      // Gray - Regular text content
    none: '§f'     // White - Default
};


class ChatBuilder {
    constructor(commandHandler, client) {
        this.commandHandler = commandHandler;
        this.client = client;
        this._components = [{ text: '' }];
    }

    _current() {
        return this._components[this._components.length - 1];
    }

    text(text, color = THEME.text, style = null) {
        const component = { text: `${color}${text}` };
        if (style) {
            component[style] = true;
        }
        this._components.push(component);
        return this;
    }

    button(text, command, hoverText = null, action = 'suggest_command', color = THEME.text) {
        const component = {
            text: `${color}${text}`,
            clickEvent: {
                action: action,
                value: command
            }
        };
        if (hoverText) {
            component.hoverEvent = {
                action: 'show_text',
                value: { text: `${THEME.muted}${hoverText}` }
            };
        }
        this._components.push(component);
        return this;
    }

    suggestButton(text, command, hoverText = null, color = THEME.accent) {
        return this.button(text, command, hoverText, 'suggest_command', color);
    }

    runButton(text, command, hoverText = null, color = THEME.accent) {
        return this.button(text, command, hoverText, 'run_command', color);
    }
    
    hover(text) {
        if (!this._current().hoverEvent) {
             this._current().hoverEvent = { action: 'show_text', value: { text: '' } };
        }
        this._current().hoverEvent.value.text += text;
        return this;
    }

    newline() {
        return this.text('\n');
    }

    space() {
        return this.text(' ');
    }
    
    send() {
        const message = JSON.stringify({
            text: '',
            extra: this._components
        });
        this.commandHandler.proxy.sendMessage(this.client, message);
    }
}



class CommandHandler {
    constructor(proxy) {
        this.proxy = proxy;
        this.modules = new Map();
        this.THEME = THEME;
    }
    

    register(moduleName, registrationFunction) {
        const normalizedModuleName = moduleName.toLowerCase();
        const moduleCommand = new Command(normalizedModuleName)
            .exitOverride()
            .configureOutput({ writeOut: () => {}, writeErr: () => {} })
            .addHelpCommand(false);

        if (normalizedModuleName !== 'proxy') {
            this.addToggleCommand(moduleCommand, normalizedModuleName);
        }
        
        const registry = {
            command: (name) => this._createCommandBuilder(moduleCommand, name, normalizedModuleName),
            THEME: this.THEME,
            registerConfig: (options) => {
                this._registerConfigCommand(moduleCommand, normalizedModuleName, options);
            }
        };

        registrationFunction(registry);
        
        moduleCommand.command('help [command]')
            .description('Show help for commands')
            .option('-p, --page <number>', 'Page number for command list', '1')
            .action((commandName, opts, cmd) => {
                 const page = parseInt(opts.page) || 1;
                 this._sendHelpMessage(normalizedModuleName, commandName, this._currentClient, page);
            });
            
        this.modules.set(normalizedModuleName, moduleCommand);
    }
    
    _getStandardPluginSettings(moduleName) {
        const plugin = this.proxy.pluginAPI.plugins.get(moduleName);
        if (!plugin) return null;

        const displayName = plugin.metadata.displayName || moduleName;

        return {
            label: `${displayName} Plugin`,
            resetAll: true,
            settings: [
                { key: 'enabled', type: 'toggle' },
                { key: 'debug', type: 'toggle', condition: (config) => config.enabled }
            ],
            defaults: {
                enabled: plugin.metadata.defaultEnabled === undefined ? true : plugin.metadata.defaultEnabled,
                debug: false
            }
        };
    }

    addToggleCommand(moduleCommand, moduleName) {
        moduleCommand.command('toggle')
            .description(`Toggle the ${moduleName} plugin on/off`)
            .action(() => {
                const currentState = this.proxy.pluginAPI.isPluginEnabled(moduleName);
                const newState = !currentState;
                
                if (this.proxy.pluginAPI.setPluginEnabled(moduleName, newState)) {
                    const plugin = this.proxy.pluginAPI.plugins.get(moduleName);
                    const displayName = plugin?.metadata.displayName || moduleName;
                    const status = newState ? '§aenabled' : '§cdisabled';
                    this.proxy.sendMessage(this._currentClient, `§8[§6Proxy§8] §7${displayName} is now ${status}§7.`);
                } else {
                    const dependents = this.proxy.pluginAPI.getPluginDependents(moduleName);
                    if (dependents.length > 0) {
                        this.proxy.sendMessage(this._currentClient, `§cCannot disable ${moduleName} because these plugins depend on it: ${dependents.join(', ')}`);
                    } else {
                        this.proxy.sendMessage(this._currentClient, `§cFailed to toggle ${moduleName} plugin.`);
                    }
                }
            });
    }
    
    _createCommandBuilder(moduleCommand, name, moduleName) {
        const cmd = moduleCommand.command(name);
        const commandMetadata = {
            name,
            description: '',
            arguments: []
        };
        
        cmd._metadata = commandMetadata;

        const builder = {
            description: (desc) => {
                cmd.description(desc);
                commandMetadata.description = desc;
                return builder;
            },
            
            argument: (argName, options = {}) => {
                const { type = 'string', description = '', optional = false, defaultValue = null, choices = null } = options;
                let usageString = optional ? `[${argName}]` : `<${argName}>`;
                
                const argMeta = { name: argName, type, description, optional, defaultValue, choices, usage: usageString };
                commandMetadata.arguments.push(argMeta);
                
                if (optional) {
                    cmd.argument(usageString, description, defaultValue);
                } else {
                    cmd.argument(usageString, description);
                }
                
                if (choices) {
                    cmd.choices(choices);
                }
                
                return builder;
            },
            
            option: (flags, description, defaultValue) => {
                 cmd.option(flags, description, defaultValue);
                 return builder;
            },
            
            handler: (handlerFn) => {
                cmd.action((...args) => {
                    const commandObj = args.pop();
                    const options = commandObj.opts();
                    const rawArgs = args;
                    
                    const parsedArgs = {};
                    commandMetadata.arguments.forEach((argMeta, i) => {
                        parsedArgs[argMeta.name] = rawArgs[i];
                    });
                    
                    const ctx = {
                        client: this._currentClient,
                        args: parsedArgs,
                        options,
                        THEME: this.THEME,
                        send: (message) => this.proxy.sendMessage(this._currentClient, message),
                        sendSuccess: (message) => this.proxy.sendMessage(this._currentClient, `${this.THEME.success}✓ ${message}`),
                        sendError: (message) => this.proxy.sendMessage(this._currentClient, `${this.THEME.error}✗ ${message}`),
                        createChat: () => new ChatBuilder(this, this._currentClient)
                    };
                    
                    handlerFn(ctx);
                });
                return builder;
            }
        };
        return builder;
    }
    
    _sendHelpMessage(moduleName, commandName, client, page = 1) {
        const moduleCommand = this.modules.get(moduleName);
        const chat = new ChatBuilder(this, client);
        
        let displayName;
        if (moduleName === 'proxy') {
            displayName = 'Proxy';
        } else {
            const plugin = this.proxy.pluginAPI.plugins.get(moduleName);
            displayName = plugin?.metadata.displayName || moduleName;
        }

        if (commandName) {
            const cmd = moduleCommand.commands.find(c => c.name() === commandName);
            if (!cmd) {
                this.proxy.sendMessage(client, `${THEME.error}Unknown command: ${commandName}`);
                return;
            }
            
            chat.text('§m-----------------------------------------------------§r', THEME.muted).newline();
            chat.text(`Help: ${displayName}`, THEME.primary).text(` - `, THEME.muted)
                .text(`/${moduleName} ${cmd.name()}`, THEME.primary).newline().newline();
            
            chat.text(cmd.description() || 'No description available.', THEME.info).newline().newline();
            
            let usage = `/${moduleName} ${cmd.name()}`;
            if (cmd._metadata) {
                cmd._metadata.arguments.forEach(arg => {
                    usage += ` ${arg.usage}`;
                });
            }
            
            let hoverText = `${THEME.accent}/${moduleName} ${cmd.name()}\\n`;
            hoverText += `${THEME.muted}§m--------------------------§r\\n`;
            hoverText += `${THEME.info}${cmd.description() || 'No description available.'}\\n\\n`;
            hoverText += `${THEME.secondary}Usage: ${THEME.text}${usage}\\n`;
            
            if (cmd._metadata && cmd._metadata.arguments.length > 0) {
                hoverText += `\\n${THEME.secondary}Arguments:\\n`;
                cmd._metadata.arguments.forEach(arg => {
                    const argType = arg.optional ? 'Optional' : 'Required';
                    hoverText += `${THEME.muted}• ${THEME.primary}${arg.usage} ${THEME.muted}(${argType})`;
                    if (arg.description) hoverText += `${THEME.muted} - ${THEME.text}${arg.description}`;
                    hoverText += '\\n';
                });
            }
            
            if (cmd.options && cmd.options.length > 0) {
                hoverText += `\\n${THEME.secondary}Options:\\n`;
                cmd.options.forEach(opt => {
                    hoverText += `${THEME.muted}• ${THEME.primary}${opt.flags} ${THEME.muted}- ${THEME.info}${opt.description}\\n`;
                });
            }
            
            chat.text('Usage: ', THEME.secondary);
            chat.suggestButton(usage, usage, hoverText, THEME.primary);
            chat.newline().newline();
            
            if (cmd._metadata && cmd._metadata.arguments.length > 0) {
                chat.text('Arguments:', THEME.secondary).newline();
                cmd._metadata.arguments.forEach(arg => {
                    const argType = arg.optional ? 'Optional' : 'Required';
                    
                    chat.text(arg.usage, THEME.primary)
                        .text(` (${argType})`, THEME.info);
                    
                    if (arg.description) {
                        chat.text(' - ', THEME.muted).text(arg.description, THEME.text);
                    }
                    
                    chat.newline();
                });
                chat.newline();
            }
            
            if (cmd.options.length > 0) {
                chat.text('Options:', THEME.secondary).newline();
                cmd.options.forEach(opt => {
                    chat.text(opt.flags, THEME.primary)
                        .text(' - ', THEME.muted)
                        .text(opt.description, THEME.text)
                        .newline();
                });
                chat.newline();
            }
                
        } else {
            const baseCommands = moduleCommand.commands.filter(c => c.name() !== 'help');
            
            const commands = baseCommands;
            const pageSize = 5;
            const totalPages = Math.ceil(commands.length / pageSize);
            page = Math.max(1, Math.min(page, totalPages));
            
            const startIndex = (page - 1) * pageSize;
            const pageCommands = commands.slice(startIndex, startIndex + pageSize);
            
            chat.text('§m-----------------------------------------------------§r', THEME.muted).newline();
            chat.text(`${displayName} Commands`, THEME.primary).newline();
            
            pageCommands.forEach((cmd) => {
                let usage = `/${moduleName} ${cmd.name()}`;
                let argsText = '';
                if (cmd._metadata) {
                    cmd._metadata.arguments.forEach(arg => {
                        usage += ` ${arg.usage}`;
                        if (argsText) argsText += ' ';
                        argsText += arg.usage;
                    });
                }
                
                let hoverText = `${THEME.accent}/${moduleName} ${cmd.name()}\\n`;
                hoverText += `${THEME.muted}§m--------------------------§r\\n`;
                hoverText += `${THEME.info}${cmd.description() || 'No description available.'}\\n\\n`;
                hoverText += `${THEME.secondary}Usage: ${THEME.text}${usage}\\n`;
                
                if (cmd._metadata && cmd._metadata.arguments.length > 0) {
                    hoverText += `\\n${THEME.secondary}Arguments:\\n`;
                    cmd._metadata.arguments.forEach(arg => {
                        const argType = arg.optional ? 'Optional' : 'Required';
                        hoverText += `${THEME.muted}• ${THEME.primary}${arg.usage} ${THEME.muted}(${argType})`;
                        if (arg.description) hoverText += `${THEME.muted} - ${THEME.text}${arg.description}`;
                        hoverText += '\\n';
                    });
                }
                
                if (cmd.options && cmd.options.length > 0) {
                    hoverText += `\\n${THEME.secondary}Options:\\n`;
                    cmd.options.forEach(opt => {
                        hoverText += `${THEME.muted}• ${THEME.primary}${opt.flags} ${THEME.muted}- ${THEME.info}${opt.description}\\n`;
                    });
                }
                
                hoverText += `\\n${THEME.text}Click to paste command`;

                if (argsText) {
                    chat.suggestButton(`/${moduleName} ${cmd.name()}`, usage, hoverText, THEME.secondary);
                    chat.space().text(argsText, THEME.text);
                } else {
                    chat.suggestButton(`/${moduleName} ${cmd.name()}`, usage, hoverText, THEME.secondary);
                }
                chat.newline();
            });

            this._createPaginator(chat, page, totalPages, `/${moduleName} help`);
        }

        chat.text('§m-----------------------------------------------------§r', THEME.muted);
        chat.send();
    }

    _createPaginator(chat, page, totalPages, baseCommand) {
        if (totalPages <= 1) return;

        chat.text('[', this.THEME.text);
        if (page > 1) {
            chat.runButton('«', `${baseCommand} --page 1`, 'Go to first page', this.THEME.primary);
        } else {
            chat.text('«', this.THEME.muted);
        }
        chat.text('] [', this.THEME.text);
        
        if (page > 1) {
            chat.runButton('<', `${baseCommand} --page ${page - 1}`, `Go to page ${page - 1}`, this.THEME.primary);
        } else {
            chat.text('<', this.THEME.muted);
        }
        
        chat.text('] ', this.THEME.text);
        chat.text(`Page ${page}/${totalPages}`, this.THEME.secondary);
        chat.text(' [', this.THEME.text);
        
        if (page < totalPages) {
            chat.runButton('>', `${baseCommand} --page ${page + 1}`, `Go to page ${page + 1}`, this.THEME.primary);
        } else {
            chat.text('>', this.THEME.muted);
        }
        
        chat.text('] [', this.THEME.text);
        if (page < totalPages) {
            chat.runButton('»', `${baseCommand} --page ${totalPages}`, 'Go to last page', this.THEME.primary);
        } else {
            chat.text('»', this.THEME.muted);
        }
        chat.text(']', this.THEME.text);
        chat.newline();
    }

    _registerConfigCommand(moduleCommand, moduleName, pluginOptions) {
        const {
            displayName,
            configObject,
            schemaBuilder,
            saveHandler,
        } = pluginOptions;

        moduleCommand.command('config')
            .description(`Opens the interactive ${displayName || moduleName} configuration menu.`)
            .addOption(new Option('-p, --page <number>', 'Page number for the config list').default('1').hideHelp())
            .addOption(new Option('--set <key=value>', 'Set a configuration value').hideHelp())
            .addOption(new Option('--reset-setting <key>', 'Reset a specific setting to default').hideHelp())
            .addOption(new Option('--reset-all-confirm', 'Confirm resetting all settings').hideHelp())
            .addOption(new Option('--reset-all-execute', 'Execute resetting all settings').hideHelp())
            .action((options, cmd) => {
                const { set, page, resetSetting, resetAllConfirm, resetAllExecute } = cmd.opts();
                
                const baseSchema = schemaBuilder();
                const standardSettings = this._getStandardPluginSettings(moduleName);
                
                const schema = standardSettings ? [standardSettings, ...baseSchema] : baseSchema;
                
                const ctx = {
                    client: this._currentClient,
                    THEME: this.THEME,
                    createChat: () => new ChatBuilder(this, this._currentClient),
                    sendSuccess: (message) => this.proxy.sendMessage(this._currentClient, `${this.THEME.success}✓ ${message}`),
                };

                if (resetAllConfirm) {
                    const chat = ctx.createChat();
                    chat.text(`Reset all ${displayName} settings to default?`, this.THEME.error).newline()
                        .runButton('[Yes, Reset All]', `/${moduleName} config --reset-all-execute --page ${page}`, 'This cannot be undone!', this.THEME.error).space()
                        .runButton('[Cancel]', `/${moduleName} config --page ${page}`, 'Cancel reset', this.THEME.success)
                        .send();
                    return;
                }

                if (resetAllExecute) {
                    schema.forEach(item => {
                        if (!item.defaults) return;
                        if (item.resetAll) return;
                        
                        for (const key in item.defaults) {
                            const setting = item.settings.find(s => s.key.endsWith(key));
                            if(!setting) continue;

                            const fullPath = setting.key;
                            const defaultValue = getProperty(item.defaults, key);

                            if (fullPath === 'enabled') {
                                this.proxy.pluginAPI.setPluginEnabled(moduleName, defaultValue);
                            } else if (fullPath === 'debug') {
                                this.proxy.pluginAPI.setPluginDebugEnabled(moduleName, defaultValue);
                            } else {
                                setProperty(configObject, fullPath, defaultValue);
                            }
                        }
                    });
                    ctx.sendSuccess(`All ${displayName} settings have been reset to default.`);
                }
                
                if (resetSetting) {
                    const keys = resetSetting.replace(/"/g, '').split(',');

                    keys.forEach(key => {
                        const schemaItem = schema.find(item => item.settings.some(s => s.key === key));
                        if (!schemaItem || !schemaItem.defaults) return;

                        const defaultPrefix = Object.keys(schemaItem.defaults).find(prefix => key.startsWith(prefix));
                        if (!defaultPrefix) return;

                        const fullDefaultObject = schemaItem.defaults[defaultPrefix];
                        const propertyPathInDefault = key.substring(defaultPrefix.length + 1);
                        const defaultValue = getProperty(fullDefaultObject, propertyPathInDefault);

                         if (defaultValue !== undefined) {
                            if (key === 'enabled') {
                                this.proxy.pluginAPI.setPluginEnabled(moduleName, defaultValue);
                            } else if (key === 'debug') {
                                this.proxy.pluginAPI.setPluginDebugEnabled(moduleName, defaultValue);
                            } else {
                                setProperty(configObject, key, defaultValue);
                            }
                         }
                    });
                    
                    if (saveHandler) saveHandler();
                }

                if (set) {
                    const [key, valueStr] = set.split('=');
                    let value = valueStr;
                    if (valueStr === 'true') value = true;
                    else if (valueStr === 'false') value = false;
                    else if (!isNaN(Number(valueStr)) && valueStr.trim() !== '') value = Number(valueStr);
                    
                    if (key === 'enabled') {
                        this.proxy.pluginAPI.setPluginEnabled(moduleName, value);
                    } else if (key === 'debug') {
                        this.proxy.pluginAPI.setPluginDebugEnabled(moduleName, value);
                    } else {
                        setProperty(configObject, key, value);
                }

                    if (saveHandler) saveHandler();
                }

                this._createConfig({
                    client: this._currentClient,
                    moduleName,
                    config: { 
                        ...configObject, 
                        enabled: this.proxy.pluginAPI.isPluginEnabled(moduleName),
                        debug: this.proxy.pluginAPI.isPluginDebugEnabled(moduleName)
                    },
                    schema,
                    title: `${displayName || moduleName} Config`,
                    baseCommand: `/${moduleName} config`,
                    page: parseInt(page) || 1
                });
            });
    }

    _createConfig(options) {
        const { client, moduleName, page = 1, config, schema, title, baseCommand, pageSize = 5 } = options;

        const totalPages = Math.ceil(schema.length / pageSize);
        const currentPage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (currentPage - 1) * pageSize;
        const pageSchema = schema.slice(startIndex, startIndex + pageSize);

        const chat = new ChatBuilder(this, client);

        chat.text('§m-----------------------------------------------------§r', THEME.muted).newline();
        chat.text(title, THEME.primary).newline();

        pageSchema.forEach((item, index) => {
            const mainToggleSetting = item.settings.find(s => s.type === 'toggle' && s.key.endsWith('enabled'));
            const otherSettings = mainToggleSetting ? item.settings.filter(s => s.key !== mainToggleSetting.key) : item.settings;

            const isPluginEnabled = this.proxy.pluginAPI.isPluginEnabled(moduleName);
            const isLineFeatureEnabled = mainToggleSetting ? getProperty(config, mainToggleSetting.key) : (item.isEnabled ? item.isEnabled(config) : true);
            
            const toggleText = isLineFeatureEnabled ? '[+]' : '[-]';
            const toggleColor = isLineFeatureEnabled ? THEME.success : THEME.error;

            if (mainToggleSetting) {
                const command = `${baseCommand} --set ${mainToggleSetting.key}=${!isLineFeatureEnabled} --page ${currentPage}`;
                chat.runButton(toggleText, command, `Click to ${isLineFeatureEnabled ? 'disable' : 'enable'}`, toggleColor);
            } else {
                chat.text(toggleText, isLineFeatureEnabled ? toggleColor : THEME.muted);
            }
            chat.space();

            let hoverText = `${THEME.accent}${item.label}\\n${THEME.muted}§m--------------------------§r\\n`;
            if (item.description) hoverText += `${THEME.info}${item.description}\\n\\n`;

            const lineLabel = new ChatBuilder(this, client).text(item.label, (isLineFeatureEnabled && isPluginEnabled) ? THEME.secondary : THEME.muted);
            if(item.description) lineLabel.hover(hoverText);
            chat._components.push(...lineLabel._components);
            
            chat.text(' -', THEME.muted).space();

            otherSettings.forEach((setting, index) => {
                if (index > 0) chat.text(' | ', THEME.muted);

                const currentValue = getProperty(config, setting.key);

                switch (setting.type) {
                    case 'toggle':
                        if (setting.key.endsWith('debug')) {
                            const command = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                            const debugActiveColor = currentValue ? THEME.success : THEME.error;
                            
                            chat.text('(Debug: ', THEME.text);
                            chat.runButton(currentValue ? 'ON' : 'OFF', command, 'Toggle Debug Mode', debugActiveColor);
                            chat.text(')', THEME.text);
                        }
                        break;
                    case 'soundToggle':
                        const soundCommand = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                        const soundActiveColor = currentValue ? THEME.special : THEME.muted;
                        
                        chat.runButton('[♪]', soundCommand, 'Toggle sound notification', soundActiveColor);
                        break;
                    case 'cycle':
                        const currentIndex = setting.values.findIndex(v => v.value === currentValue);
                        const nextValue = setting.values[(currentIndex + 1) % setting.values.length].value;
                        const command = `${baseCommand} --set ${setting.key}=${nextValue} --page ${currentPage}`;
                        const display = setting.values[currentIndex] || setting.values[0];
                        const cycleActiveColor = THEME.accent;
                        
                        chat.text('(', THEME.text);
                        if (setting.displayLabel) {
                            chat.text(`${setting.displayLabel}: `, THEME.text);
                        }
                        chat.runButton(display.text, command, `Change ${setting.displayLabel || 'value'}`, cycleActiveColor);
                        chat.text(')', THEME.text);
                        break;
                }
            });

            if (otherSettings.length > 0) {
                chat.text(' | ', THEME.muted);
            }
            
            if (!item.resetAll) {
                const settingKeysOnLine = item.settings.map(s => s.key).join(',');
                const resetCommand = `${baseCommand} --reset-setting "${settingKeysOnLine}" --page ${currentPage}`;
                const resetColor = THEME.info;
                chat.runButton('[R]', resetCommand, `Reset ${item.label} settings`, resetColor);
            }

            if (item.resetAll) {
                const resetAllCommand = `${baseCommand} --reset-all-confirm --page ${currentPage}`;
                chat.runButton('[R]', resetAllCommand, `${THEME.error}Reset ALL plugin settings to default`, THEME.danger);
            }

            chat.newline();
        });

        this._createPaginator(chat, currentPage, totalPages, baseCommand);

        chat.text('§m-----------------------------------------------------§r', THEME.muted);
        chat.send();
    }


    handleCommand(message, client) {
        if (!message.startsWith('/')) return false;
        
        const parts = message.slice(1).split(' ').filter(Boolean);
        const moduleName = parts.shift()?.toLowerCase();
        const args = parts;

        const moduleCommand = this.modules.get(moduleName);
        if (!moduleCommand) return false;

        if (args.length === 0) {
            this._sendHelpMessage(moduleName, null, client);
            return true;
        }

        try {
            this._currentClient = client;
            const argv = [process.execPath, __filename, ...args];
            moduleCommand.parse(argv);
        } catch (error) {
            if (error.code === 'commander.unknownCommand') {
                this.proxy.sendMessage(client, `${THEME.error}Unknown command. Use '/${moduleName} help'`);
            } else {
                console.error('Command error:', error);
                this.proxy.sendMessage(client, `${THEME.error}An error occurred while processing the command.`);
            }
        }
        
        return true;
    }
}

module.exports = { CommandHandler }; 