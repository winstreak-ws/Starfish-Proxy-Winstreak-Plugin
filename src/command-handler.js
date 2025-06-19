const { Command, Option } = require('commander');

// =============================================================================
// == Utility Functions
// =============================================================================
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

// =============================================================================
// == Theme & Color Palette
// =============================================================================
const THEME = {
    primary: '§6',   // Gold - Main commands, important elements
    secondary: '§e', // Yellow - Labels, secondary headings
    accent: '§b',    // Aqua - Values, highlights, clickable elements
    success: '§a',   // Green - Success messages, positive status
    error: '§c',     // Red - Error messages, negative status
    info: '§9',      // Blue - Information, descriptions
    special: '§5',   // Purple - Headers, special elements
    muted: '§8',     // Dark Gray - Less important text, separators
    text: '§7',      // Gray - Regular text content
    none: '§f'     // White - Default
};

// =============================================================================
// == ChatBuilder Utility
// =============================================================================
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
        this.commandHandler.proxyManager.sendChatMessage(this.client, message);
    }
}


// =============================================================================
// == Command Handler Core
// =============================================================================
class CommandHandler {
    constructor(proxyManager) {
        this.proxyManager = proxyManager;
        this.proxyAPI = proxyManager.proxyAPI;
        this.modules = new Map();
        this.THEME = THEME;
    }
    
    /**
     * The main entry point for plugins to register their commands.
     * Provides a fluent, feature-rich API for command creation.
     */
    register(moduleName, registrationFunction) {
        if (this.modules.has(moduleName)) {
            console.warn(`Module '${moduleName}' is being re-registered. Old commands are cleared.`);
        }

        const moduleCommand = new Command(moduleName)
            .exitOverride()
            .configureOutput({ writeOut: () => {}, writeErr: () => {} })
            .addHelpCommand(false);

        if (moduleName !== 'proxy') {
            this.proxyManager.pluginManager.addPluginManagementCommands(moduleCommand, moduleName);
        }
        
        const registry = {
            command: (name) => this._createCommandBuilder(moduleCommand, name, moduleName),
            THEME: this.THEME,
            registerConfig: (options) => {
                this._registerConfigCommand(moduleCommand, moduleName, options);
            }
        };

        registrationFunction(registry);
        
        moduleCommand.command('help [command]')
            .description('Show help for commands')
            .option('-p, --page <number>', 'Page number for command list', '1')
            .action((commandName, opts, cmd) => {
                 const page = parseInt(opts.page) || 1;
                 this._sendHelpMessage(moduleName, commandName, this._currentClient, page);
            });
            
        this.modules.set(moduleName, moduleCommand);
        console.log(`Registered commands for module: ${moduleName}`);
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
            
            argument: (argName, { type = 'string', description = '', optional = false, defaultValue = null, choices = null } = {}) => {
                let usageString = optional ? `[${argName}]` : `<${argName}>`;
                if (type === 'greedy') {
                    usageString = optional ? `[${argName}...]` : `<${argName}...>`;
                }

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
                        proxyAPI: this.proxyAPI,
                        args: parsedArgs,
                        options,
                        THEME: this.THEME,
                        send: (message) => this.proxyManager.sendChatMessage(this._currentClient, message),
                        sendSuccess: (message) => this.proxyManager.sendChatMessage(this._currentClient, `${this.THEME.success}✓ ${message}`),
                        sendError: (message) => this.proxyManager.sendChatMessage(this._currentClient, `${this.THEME.error}✗ ${message}`),
                        createChat: () => new ChatBuilder(this, this._currentClient),
                        createPaginator: (items, title, lineRenderer, pageSize = 7) => {
                            const page = parseInt(options.page) || 1;
                            return this._createPaginator(this._currentClient, items, title, lineRenderer, pageSize, page);
                        },
                        createConfig: (opts) => {
                             const page = parseInt(options.page) || 1;
                             return this._createConfig({ ...opts, client: this._currentClient, moduleName, page });
                        },
                        setProperty: setProperty,
                        getProperty: getProperty
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
            const pluginData = this.proxyManager.pluginManager.plugins.get(moduleName);
            displayName = pluginData?.info.displayName || moduleName;
        }

        if (commandName) {
            const cmd = moduleCommand.commands.find(c => c.name() === commandName);
            if (!cmd) {
                this.proxyManager.sendChatMessage(client, `${THEME.error}Unknown command: ${commandName}`);
                return;
            }
            
            chat.text(`Help: ${displayName}`, THEME.primary).text(` - `, THEME.muted)
                .text(`/${moduleName} ${cmd.name()}`, THEME.primary).newline().newline();
            
            chat.text(cmd.description() || 'No description available.', THEME.info).newline().newline();
            
            let usage = `/${moduleName} ${cmd.name()}`;
            if (cmd._metadata) {
                cmd._metadata.arguments.forEach(arg => {
                    usage += ` ${arg.usage}`;
                });
            }
            
            chat.text('Usage: ', THEME.secondary);
            chat.suggestButton(usage, usage, `${THEME.text}Click to paste this command into chat!`, THEME.primary);
            chat.newline().newline();
            
            if (cmd._metadata && cmd._metadata.arguments.length > 0) {
                chat.text('Arguments:', THEME.secondary).newline();
                cmd._metadata.arguments.forEach(arg => {
                    const argType = arg.optional ? 'Optional' : 'Required';
                    
                    chat.text('  ')
                        .text(arg.usage, THEME.primary)
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
                    chat.text('  ')
                        .text(opt.flags, THEME.primary)
                        .text(' - ', THEME.muted)
                        .text(opt.description, THEME.text)
                        .newline();
                });
                chat.newline();
            }
                
        } else {
            const baseCommands = moduleCommand.commands.filter(c => c.name() !== 'help');
            
            const helpCommand = {
                name: () => 'help',
                description: () => 'Show help for a specific command',
                _metadata: {
                    arguments: [
                        { usage: '[command]', optional: true, description: 'Command name to get help for' }
                    ]
                },
                options: []
            };
            
            const commands = [helpCommand, ...baseCommands];
            const pageSize = 5;
            const totalPages = Math.ceil(commands.length / pageSize);
            page = Math.max(1, Math.min(page, totalPages));
            
            const startIndex = (page - 1) * pageSize;
            const pageCommands = commands.slice(startIndex, startIndex + pageSize);
            
            chat.text('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', THEME.muted).newline();
            chat.text(`${displayName} Commands `, THEME.primary).text(`(Page ${page}/${totalPages})`, THEME.text).newline();
            chat.text('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', THEME.muted).newline().newline();
            
            pageCommands.forEach((cmd, index) => {
                let usage = `/${moduleName} ${cmd.name()}`;
                if (cmd._metadata) {
                    cmd._metadata.arguments.forEach(arg => {
                        usage += ` ${arg.usage}`;
                    });
                }
                
                let hoverText = `${THEME.accent}/${moduleName} ${cmd.name()}\n`;
                hoverText += `${THEME.muted}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                hoverText += `${THEME.info}${cmd.description() || 'No description available.'}\n\n`;
                hoverText += `${THEME.secondary}Usage: ${THEME.text}${usage}\n`;
                
                if (cmd._metadata && cmd._metadata.arguments.length > 0) {
                    hoverText += `\n${THEME.secondary}Arguments:\n`;
                    cmd._metadata.arguments.forEach(arg => {
                        const argType = arg.optional ? 'Optional' : 'Required';
                        hoverText += `${THEME.muted}• ${THEME.primary}${arg.usage} ${THEME.muted}(${argType})`;
                        if (arg.description) hoverText += `${THEME.muted} - ${THEME.text}${arg.description}`;
                        hoverText += '\n';
                    });
                }
                
                if (cmd.options && cmd.options.length > 0) {
                    hoverText += `\n${THEME.secondary}Options:\n`;
                    cmd.options.forEach(opt => {
                        hoverText += `${THEME.muted}• ${THEME.primary}${opt.flags} ${THEME.muted}- ${THEME.info}${opt.description}\n`;
                    });
                }
                
                hoverText += `\n${THEME.text}Click to paste command`;

                chat.suggestButton(usage, usage, hoverText, THEME.secondary);
                chat.newline();
            });

            chat.newline();
            if (totalPages > 1) {
                chat.text('Pages: ', THEME.secondary);
                
                if (page > 1) {
                    chat.runButton('[<<<]', `/${moduleName} help --page ${page - 1}`, `Go to page ${page - 1}`, THEME.text);
                    chat.text(' ', THEME.text);
                } else {
                    chat.text('[<<<] ', THEME.muted);
                }
                
                const startPage = Math.max(1, page - 2);
                const endPage = Math.min(totalPages, page + 2);
                
                for (let i = startPage; i <= endPage; i++) {
                    if (i === page) {
                        chat.text(`[${i}]`, THEME.primary);
                    } else {
                        chat.runButton(`${i}`, `/${moduleName} help --page ${i}`, `Go to page ${i}`, THEME.text);
                    }
                    if (i < endPage) chat.text(' ', THEME.text);
                }
                
                chat.text(' ', THEME.text);
                
                if (page < totalPages) {
                    chat.runButton('[>>>]', `/${moduleName} help --page ${page + 1}`, `Go to page ${page + 1}`, THEME.text);
                    chat.text(' ', THEME.text);
                } else {
                    chat.text('[>>>]', THEME.muted);
                }
                
                chat.newline();
            }

            chat.newline()
                .text('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', THEME.muted);
        }

        chat.send();
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
                const standardSettings = this.proxyManager.pluginManager.getStandardPluginSettings(moduleName);
                const schema = [standardSettings, ...baseSchema];
                
                const ctx = {
                    client: this._currentClient,
                    proxyAPI: this.proxyAPI,
                    THEME: this.THEME,
                    createChat: () => new ChatBuilder(this, this._currentClient),
                    sendSuccess: (message) => this.proxyManager.sendChatMessage(this._currentClient, `${this.THEME.success}✓ ${message}`),
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
                        if (item.label === 'Plugin Controls') return;
                        
                        for (const key in item.defaults) {
                            const setting = item.settings.find(s => s.key.endsWith(key));
                            if(!setting) continue;

                            const fullPath = setting.key;
                            const defaultValue = getProperty(item.defaults, key);

                            if (fullPath === 'enabled' || fullPath === 'debug') continue;
                            
                            setProperty(configObject, fullPath, defaultValue);
                        }
                    });
                    ctx.sendSuccess(`All ${displayName} settings have been reset to default.`);
                }
                
                if (resetSetting) {
                    const keys = resetSetting.replace(/"/g, '').split(',');
                    const allDefaults = schema.reduce((acc, item) => ({ ...acc, ...item.defaults }), {});

                    keys.forEach(key => {
                         const schemaItem = schema.find(item => item.settings.some(s => s.key === key));
                         const defaultValue = schemaItem ? getProperty(schemaItem.defaults, key.split('.').pop()) : undefined;

                         if (defaultValue !== undefined) {
                            if (key === 'enabled') {
                                this.proxyManager.pluginManager.setPluginEnabled(moduleName, defaultValue);
                            } else if (key === 'debug') {
                                this.proxyManager.pluginManager.setPluginDebug(moduleName, defaultValue);
                            } else {
                                setProperty(configObject, key, defaultValue);
                            }
                         }
                    });
                }

                if (set) {
                    const [key, valueStr] = set.split('=');
                    let value = valueStr;
                    if (valueStr === 'true') value = true;
                    else if (valueStr === 'false') value = false;
                    else if (!isNaN(Number(valueStr))) value = Number(valueStr);
                    
                    if (key === 'enabled') {
                        this.proxyManager.pluginManager.setPluginEnabled(moduleName, value);
                    } else if (key === 'debug') {
                        this.proxyManager.pluginManager.setPluginDebug(moduleName, value);
                    } else {
                        setProperty(configObject, key, value);
                    }
                }

                if (set || resetSetting || resetAllExecute) {
                    if (saveHandler) saveHandler();

                    const refreshedBaseSchema = schemaBuilder();
                    const refreshedStandardSettings = this.proxyManager.pluginManager.getStandardPluginSettings(moduleName);
                    const refreshedSchema = [refreshedStandardSettings, ...refreshedBaseSchema];
                    
                    this._createConfig({
                        client: this._currentClient,
                        config: { 
                            ...configObject, 
                            enabled: this.proxyManager.pluginManager.isPluginEnabled(moduleName),
                            debug: this.proxyManager.pluginManager.isPluginDebugEnabled(moduleName)
                        },
                        schema: refreshedSchema,
                        title: `${displayName || moduleName} Config`,
                        baseCommand: `/${moduleName} config`,
                        page: parseInt(page) || 1
                    });
                    return;
                }

                this._createConfig({
                    client: this._currentClient,
                    config: { 
                        ...configObject, 
                        enabled: this.proxyManager.pluginManager.isPluginEnabled(moduleName),
                        debug: this.proxyManager.pluginManager.isPluginDebugEnabled(moduleName)
                    },
                    schema: schema,
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

        chat.text(`------ ${THEME.primary}${title}${THEME.muted} ------`, THEME.muted);
        if (totalPages > 1) {
            chat.text(` (Page ${currentPage}/${totalPages})`, THEME.muted);
        }
        chat.newline();

        pageSchema.forEach(item => {
            const isLineEnabled = item.isEnabled ? item.isEnabled(config) : true;
            const labelColor = isLineEnabled ? THEME.secondary : THEME.muted;
            const mainColor = isLineEnabled ? THEME.text : THEME.muted;
            
            let hoverText = `${THEME.primary}${item.label}\n`;
            hoverText += `${THEME.muted}--------------------------\n`;

            if (item.defaults) {
                hoverText += `\n${THEME.secondary}Default Settings:\n`;
                item.settings.forEach(setting => {
                    const settingKeyParts = setting.key.split('.');
                    const settingName = settingKeyParts[settingKeyParts.length - 1];
                    const defaultValue = getProperty(item.defaults, settingName);

                    if (defaultValue !== undefined) {
                         let displayValue = defaultValue;
                         if (setting.type === 'soundToggle') displayValue = defaultValue ? '♪' : '✘';
                         else if (setting.type === 'toggle') {
                             const onText = setting.text ? setting.text[1] : 'ON';
                             const offText = setting.text ? setting.text[0] : 'OFF';
                             displayValue = defaultValue ? onText : offText;
                         }
                         else if (setting.type === 'cycle') {
                             const defaultDisplay = setting.values.find(v => v.value === defaultValue);
                             if (defaultDisplay) displayValue = defaultDisplay.text;
                         }
                         hoverText += `${THEME.muted}• ${THEME.accent}${settingName}: ${THEME.text}${displayValue}\n`;
                         if (setting.description) {
                            hoverText += `  ${THEME.info}${setting.description}\n`;
                         }
                    }
                });
            }
            
            let lineLabel = new ChatBuilder(this, client).text(item.label, labelColor).hover(hoverText);
            chat._components.push(...lineLabel._components);


            chat.text(' - ', mainColor);
            
            item.settings.forEach((setting, index) => {
                if (index > 0) chat.text(' | ', isLineEnabled ? THEME.muted : THEME.muted);

                const isSettingEnabled = !setting.condition || setting.condition(config);
                const finalEnabled = isLineEnabled && isSettingEnabled;
                
                let settingText = '';
                let command = '';
                let settingColor = finalEnabled ? THEME.accent : THEME.muted;

                const currentValue = getProperty(config, setting.key);

                if (setting.displayLabel) {
                    chat.text(`${setting.displayLabel}: `, finalEnabled ? THEME.text : THEME.muted);
                }

                switch (setting.type) {
                    case 'toggle':
                        const onText = setting.text ? setting.text[1] : 'ON';
                        const offText = setting.text ? setting.text[0] : 'OFF';
                        settingText = currentValue ? `[${onText}]` : `[${offText}]`;
                        settingColor = finalEnabled ? (currentValue ? THEME.success : THEME.error) : THEME.muted;
                        if (finalEnabled) command = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                        break;
                    case 'soundToggle':
                        settingText = currentValue ? '[♪]' : '[✘]';
                        settingColor = finalEnabled ? (currentValue ? THEME.special : THEME.error) : THEME.muted;
                        if (finalEnabled) command = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                        break;
                    case 'field':
                         settingText = `[${currentValue}]`;
                         if (finalEnabled) command = `${baseCommand} ${setting.command} `;
                         break;
                }
                
                if (setting.type === 'toggle' || setting.type === 'soundToggle') {
                    if (finalEnabled) {
                        chat.runButton(settingText, command, hoverText, settingColor);
                    } else {
                        chat.text(settingText, THEME.muted).hover(hoverText);
                    }
                } else if (setting.type === 'cycle') {
                    const currentIndex = setting.values.findIndex(v => v.value === currentValue);
                    const display = setting.values.find(v => v.value === currentValue) || setting.values[0];

                    if (finalEnabled) {
                        const nextIndex = (currentIndex + 1) % setting.values.length;
                        const nextValue = setting.values[nextIndex].value;
                        command = `${baseCommand} --set ${setting.key}=${nextValue} --page ${currentPage}`;
                    }

                    if (Array.isArray(display.text)) {
                        const component = {
                            text: '',
                            hoverEvent: { action: 'show_text', value: { text: hoverText } },
                            extra: []
                        };
                        if (finalEnabled) {
                            component.clickEvent = { action: 'run_command', value: command };
                        }
                        
                        const mainColor = finalEnabled ? (display.color || THEME.accent) : THEME.muted;
                        const textColor = finalEnabled ? THEME.text : THEME.muted;
                        
                        component.extra.push({ text: `${textColor}${display.text[0]}` });
                        component.extra.push({ text: `${mainColor}${display.text[1]}` });
                        component.extra.push({ text: `${textColor}${display.text[2]}` });
                        chat._components.push(component);
                    } else {
                        const color = finalEnabled ? (display.color || THEME.accent) : THEME.muted;
                        if (finalEnabled) {
                            chat.runButton(display.text, command, hoverText, color);
                        } else {
                            chat.text(display.text, color).hover(hoverText);
                        }
                    }
                } else if (setting.type === 'field') {
                     settingColor = finalEnabled ? THEME.accent : THEME.muted;
                    if (finalEnabled) {
                        chat.suggestButton(settingText, command, `Set a new value for ${item.label}`, settingColor);
                    } else {
                        chat.text(settingText, settingColor).hover(`Set a new value for ${item.label}`);
                    }
                }
            });

            const hasIndividualReset = !item.resetAll;
            const hasGlobalReset = item.resetAll;

            if (hasIndividualReset) {
                chat.text(' | ', THEME.muted);
                const settingKeysOnLine = item.settings.map(s => s.key).join(',');
                const resetCommand = `${baseCommand} --reset-setting "${settingKeysOnLine}" --page ${currentPage}`;
                const hover = `${THEME.info}Reset: ${THEME.text}${item.label}`;
                if (isLineEnabled) {
                    chat.runButton(`[R]`, resetCommand, hover, THEME.info);
                } else {
                    chat.text(`[R]`, THEME.muted).hover(hover);
                }
            }

            if (hasGlobalReset) {
                chat.text(' | ', THEME.muted);
                const resetAllCommand = `${baseCommand} --reset-all-confirm --page ${currentPage}`;
                chat.runButton(`[R]`, resetAllCommand, `${THEME.error}Reset ALL plugin settings to default`, THEME.error);
            }

            chat.newline();
        });

        if (totalPages > 1) {
             chat.text('         ', THEME.muted);
            if (currentPage > 1) {
                chat.runButton('[<<<]', `${baseCommand} --page ${currentPage - 1}`, `Go to page ${currentPage - 1}`, THEME.text);
            } else {
                chat.text('[<<<]', THEME.muted);
            }
            chat.space();

            for (let i = 1; i <= totalPages; i++) {
                if (i === currentPage) {
                    chat.text(`[${i}]`, THEME.primary);
                } else {
                     chat.runButton(`${i}`, `${baseCommand} --page ${i}`, `Go to page ${i}`, THEME.text);
                }
                chat.space();
            }

            if (currentPage < totalPages) {
                chat.runButton('[>>>]', `${baseCommand} --page ${currentPage + 1}`, `Go to page ${currentPage + 1}`, THEME.text);
            } else {
                chat.text('[>>>]', THEME.muted);
            }
            chat.newline();
        }
        chat.text('-----------------------------------', THEME.muted);
        chat.send();
    }

    _createPaginator(client, items, title, lineRenderer, pageSize = 7, page = 1) {
        const totalPages = Math.ceil(items.length / pageSize);
        page = Math.max(1, Math.min(page, totalPages));

        const startIndex = (page - 1) * pageSize;
        const pageItems = items.slice(startIndex, startIndex + pageSize);

        const chat = new ChatBuilder(this, client);
        
        chat.text(`--- ${title} `, THEME.text);
        if (totalPages > 1) {
            chat.text(`(Page ${page}/${totalPages})`, THEME.secondary);
        }
        chat.text(' ---', THEME.text).newline();

        pageItems.forEach(item => {
            lineRenderer(chat, item);
            chat.newline();
        });

        if (totalPages > 1) {
            chat.text('Pages: ', THEME.secondary);
            
            if (page > 1) {
                chat.runButton('[<<<]', `/help --page ${page - 1}`, `Go to page ${page - 1}`, THEME.text);
                chat.text(' ', THEME.text);
            } else {
                chat.text('[<<<] ', THEME.muted);
            }
            
            const startPage = Math.max(1, page - 2);
            const endPage = Math.min(totalPages, page + 2);
            
            for (let i = startPage; i <= endPage; i++) {
                if (i === page) {
                    chat.text(`[${i}]`, THEME.primary);
                } else {
                    chat.runButton(`${i}`, `/help --page ${i}`, `Go to page ${i}`, THEME.text);
                }
                if (i < endPage) chat.text(' ', THEME.text);
            }
            
            chat.text(' ', THEME.text);
            
            if (page < totalPages) {
                chat.runButton('[>>>]', `/help --page ${page + 1}`, `Go to page ${page + 1}`, THEME.text);
            } else {
                chat.text('[>>>]', THEME.muted);
            }
            
            chat.newline();
        }

        chat.text('-----------------------------------', THEME.muted).newline();
        chat.send();
    }

    /**
     * Handle incoming chat messages and dispatch commands.
     */
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
            const configOptions = [];
            Object.entries(moduleCommand.opts()).forEach(([key, value]) => {
                if(args.includes(`--${key}`)) {
                    configOptions.push(`--${key}`, value);
                }
            });

            moduleCommand.parse([...argv, ...configOptions]);
            
        } catch (error) {
            if (error.code === 'commander.unknownCommand') {
                this.proxyManager.sendChatMessage(client, `${THEME.error}Unknown command. Use '/${moduleName} help'`);
            } else {
                console.error('Command error:', error);
                this.proxyManager.sendChatMessage(client, `${THEME.error}An internal error occurred.`);
            }
        }
        return true;
    }
}

module.exports = CommandHandler;
