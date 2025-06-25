const THEME = require('./theme');
const ChatBuilder = require('./chat-builder');
const { getProperty, setProperty, createPaginator } = require('./utils');

function createAutoConfig({ commandHandler, moduleName, options, client }) {
    const { set, page, resetSetting, resetAllConfirm, resetAllExecute } = options;
    
    const pluginAPI = commandHandler.proxy.pluginAPI;
    const loadedPlugin = pluginAPI.loadedPlugins.find(p => p.name === moduleName);
    
    if (!loadedPlugin) {
        commandHandler.proxy.sendMessage(client, `${THEME.error}Plugin ${moduleName} not found`);
        return;
    }
    
    const pluginWrapper = pluginAPI.createPluginWrapper(loadedPlugin.metadata);
    const configObject = pluginWrapper.getConfig();
    
    const configSchema = loadedPlugin.metadata.configSchema;
    
    const schema = buildAutoSchema(moduleName, configSchema);
    
    const ctx = {
        client,
        THEME,
        createChat: () => new ChatBuilder(commandHandler, client),
        sendSuccess: (message) => commandHandler.proxy.sendMessage(client, `${THEME.success}✓ ${message}`),
        sendError: (message) => commandHandler.proxy.sendMessage(client, `${THEME.error}✗ ${message}`)
    };

    if (resetAllConfirm) {
        const chat = ctx.createChat();
        chat.text(`Reset all ${moduleName} settings to default?`, THEME.error).newline()
            .runButton('[Yes, Reset All]', `/${moduleName} config --reset-all-execute --page ${page}`, 'This cannot be undone!', THEME.error).space()
            .runButton('[Cancel]', `/${moduleName} config --page ${page}`, 'Cancel reset', THEME.success)
            .send();
        return;
    }

    if (resetAllExecute) {
        schema.forEach(item => {
            if (!item.defaults) return;
            
            for (const key in item.defaults) {
                const setting = item.settings.find(s => s.key === key || s.key.endsWith(key));
                if (!setting) continue;

                const fullPath = setting.key;
                const defaultValue = getProperty(item.defaults, key);
                setProperty(configObject, fullPath, defaultValue);
            }
        });
        
        pluginWrapper.saveCurrentConfig();
        ctx.sendSuccess(`All ${moduleName} settings have been reset to default.`);
        return;
    }
    
    if (resetSetting) {
        const keys = resetSetting.replace(/"/g, '').split(',');

        keys.forEach(key => {
            const schemaItem = schema.find(item => item.settings.some(s => s.key === key));
            if (!schemaItem || !schemaItem.defaults) return;

            const setting = schemaItem.settings.find(s => s.key === key);
            if (!setting) return;
            
            const baseKey = setting.key.split('.').pop();
            const defaultValue = schemaItem.defaults[baseKey];
            
            if (defaultValue !== undefined) {
                setProperty(configObject, key, defaultValue);
            }
        });
        
        pluginWrapper.saveCurrentConfig();
        ctx.sendSuccess(`Reset settings for ${moduleName}.`);
        return;
    }

    if (set) {
        const [key, valueStr] = set.split('=');
        let value = valueStr;
        if (valueStr === 'true') value = true;
        else if (valueStr === 'false') value = false;
        else if (!isNaN(Number(valueStr)) && valueStr.trim() !== '') value = Number(valueStr);
        
        setProperty(configObject, key, value);
        pluginWrapper.saveCurrentConfig();
        
        for (const schemaItem of schema) {
            const setting = schemaItem.settings.find(s => s.key === key);
            if (setting && setting.onChange) {
                try {
                    setting.onChange(value);
                } catch (error) {
                    console.error(`Error in onChange callback for ${key}:`, error);
                }
                break;
            }
        }
        
        if (key === 'enabled') {
            commandHandler.proxy.pluginAPI.setPluginEnabled(moduleName, value);
            ctx.sendSuccess(`${value ? 'Enabled' : 'Disabled'} ${moduleName} plugin`);
        } else {
            ctx.sendSuccess(`Updated ${key} to ${value}`);
        }
    }

    const configWithDefaults = {
        enabled: true,
        debug: false,
        ...configObject
    };

    showConfigMenu({
        commandHandler,
        client,
        moduleName,
        config: configWithDefaults,
        schema,
        page: parseInt(page) || 1
    });
}

function buildAutoSchema(moduleName, configSchema) {
    const displayName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    
    const defaultSettings = {
        label: `${displayName} Plugin`,
        description: 'General plugin control settings',
        settings: [
            {
                key: 'enabled',
                type: 'toggle',
                description: 'Enable or disable this plugin'
            },
            {
                key: 'debug',
                type: 'toggle',
                description: 'Enable debug mode for detailed logging'
            }
        ],
        defaults: {
            enabled: true,
            debug: false
        },
        hasResetAll: true
    };
    
    const schema = [defaultSettings];
    
    if (configSchema && Array.isArray(configSchema)) {
        schema.push(...configSchema);
    }
    
    return schema;
}

function showConfigMenu({ commandHandler, client, moduleName, config, schema, page = 1 }) {
    const pageSize = 5;
    const totalPages = Math.ceil(schema.length / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * pageSize;
    const pageSchema = schema.slice(startIndex, startIndex + pageSize);

    const displayName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    const baseCommand = `/${moduleName} config`;
    
    const chat = new ChatBuilder(commandHandler, client);

    chat.text('§m-----------------------------------------------------§r', THEME.muted).newline();
    chat.text(`${displayName} Config`, THEME.primary).newline();

    pageSchema.forEach((item, index) => {
        const mainToggleSetting = item.settings.find(s => s.type === 'toggle' && s.key === 'enabled') ||
                                 item.settings.find(s => s.type === 'toggle');
        const otherSettings = item.settings.filter(s => s !== mainToggleSetting);

        const isLineFeatureEnabled = mainToggleSetting ? getProperty(config, mainToggleSetting.key) : true;
        const isPluginGloballyEnabled = getProperty(config, 'enabled');
        const shouldShowAsDark = !isPluginGloballyEnabled || !isLineFeatureEnabled;
        
        const toggleText = isLineFeatureEnabled ? '[+]' : '[-]';
        const toggleColor = shouldShowAsDark ? THEME.muted : (isLineFeatureEnabled ? THEME.success : THEME.error);

        if (mainToggleSetting) {
            const command = `${baseCommand} --set ${mainToggleSetting.key}=${!isLineFeatureEnabled} --page ${currentPage}`;
            const hoverText = `Click to ${isLineFeatureEnabled ? 'disable' : 'enable'} ${item.label}`;
            chat.runButton(toggleText, command, hoverText, toggleColor);
        } else {
            chat.text(toggleText, toggleColor);
        }
        chat.space();

        const hoverComponents = [
            { text: `${THEME.accent}${item.label}\n` },
            { text: `${THEME.muted}§m-------------------------------------§r\n` }
        ];
        
        if (item.description) {
            hoverComponents.push({ text: `${THEME.info}${item.description}\n\n` });
        }
        
        hoverComponents.push({ text: `${THEME.secondary}Settings:\n` });

        item.settings.forEach(setting => {
            const currentValue = getProperty(config, setting.key);
            let valueDisplay = currentValue;
            
            if (setting.type === 'toggle' || setting.type === 'soundToggle') {
                valueDisplay = currentValue ? 'ENABLED' : 'OFF';
            } else if (setting.type === 'cycle' && setting.values) {
                const matchingValue = setting.values.find(v => v.value === currentValue);
                valueDisplay = matchingValue ? matchingValue.text : currentValue;
            }
            
            const settingName = setting.key.split('.').pop();
            hoverComponents.push({ text: `${THEME.muted}• ${THEME.primary}${settingName} ${THEME.muted}- ${THEME.text}${valueDisplay}\n` });
            hoverComponents.push({ text: `  ${THEME.muted}${setting.description}\n` });
        });
        
        hoverComponents.push({ text: `\n${THEME.text}Click settings in the chat menu to modify them` });

        const lineLabel = new ChatBuilder(commandHandler, client).text(item.label, shouldShowAsDark ? THEME.muted : THEME.secondary);
        lineLabel._current().hoverEvent = {
            action: 'show_text',
            value: { text: '', extra: hoverComponents }
        };
        chat._components.push(...lineLabel._components);
        
        let displayableSettings = 0;
        otherSettings.forEach((setting) => {
            if (['toggle', 'soundToggle', 'cycle'].includes(setting.type)) {
                displayableSettings++;
            }
        });
        
        if (displayableSettings > 0) {
            chat.text(' -', THEME.muted).space();
        }

        let settingIndex = 0;
        otherSettings.forEach((setting) => {
            const currentValue = getProperty(config, setting.key);

            switch (setting.type) {
                case 'toggle':
                    if (setting.key === 'debug') {
                        if (settingIndex > 0) chat.text(' | ', THEME.muted);
                        const command = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                        const debugActiveColor = shouldShowAsDark ? THEME.muted : (currentValue ? THEME.success : THEME.error);
                        
                        chat.text('(Debug: ', shouldShowAsDark ? THEME.muted : THEME.text);
                        chat.runButton(currentValue ? 'ON' : 'OFF', command, setting.description, debugActiveColor);
                        chat.text(')', shouldShowAsDark ? THEME.muted : THEME.text);
                        settingIndex++;
                    }
                    break;
                case 'soundToggle':
                    if (settingIndex > 0) chat.text(' | ', THEME.muted);
                    const soundCommand = `${baseCommand} --set ${setting.key}=${!currentValue} --page ${currentPage}`;
                    const soundActiveColor = shouldShowAsDark ? THEME.muted : (currentValue ? THEME.special : THEME.muted);
                    
                    chat.runButton('[♪]', soundCommand, setting.description, soundActiveColor);
                    settingIndex++;
                    break;
                case 'cycle':
                    if (settingIndex > 0) chat.text(' | ', THEME.muted);
                    const currentIndex = setting.values.findIndex(v => v.value === currentValue);
                    const nextValue = setting.values[(currentIndex + 1) % setting.values.length].value;
                    const command = `${baseCommand} --set ${setting.key}=${nextValue} --page ${currentPage}`;
                    const display = setting.values[currentIndex] || setting.values[0];
                    const cycleActiveColor = shouldShowAsDark ? THEME.muted : THEME.accent;
                    
                    chat.text('(', shouldShowAsDark ? THEME.muted : THEME.text);
                    if (setting.displayLabel) {
                        chat.text(`${setting.displayLabel}: `, shouldShowAsDark ? THEME.muted : THEME.text);
                    }
                    chat.runButton(display.text, command, setting.description, cycleActiveColor);
                    chat.text(')', shouldShowAsDark ? THEME.muted : THEME.text);
                    settingIndex++;
                    break;
            }
        });

        if (displayableSettings > 0) {
            chat.text(' | ', THEME.muted);
        } else {
            chat.text(' - ', THEME.muted);
        }
        
        if (item.hasResetAll) {
            const resetAllCommand = `${baseCommand} --reset-all-confirm --page ${currentPage}`;
            const resetColor = shouldShowAsDark ? THEME.muted : THEME.danger;
            const resetHoverText = shouldShowAsDark ? 'Enable plugin to reset settings' : `${THEME.error}Reset ALL plugin settings to default`;
            chat.runButton('[R]', resetAllCommand, resetHoverText, resetColor);
        } else {
            const settingKeysOnLine = item.settings.map(s => s.key).join(',');
            const resetCommand = `${baseCommand} --reset-setting "${settingKeysOnLine}" --page ${currentPage}`;
            const resetColor = shouldShowAsDark ? THEME.muted : THEME.info;
            const resetHoverText = shouldShowAsDark ? 'Enable plugin to reset settings' : `Reset ${item.label} settings`;
            chat.runButton('[R]', resetCommand, resetHoverText, resetColor);
        }

        chat.newline();
    });

    createPaginator(commandHandler, chat, currentPage, totalPages, baseCommand);

    chat.text('§m-----------------------------------------------------§r', THEME.muted);
    chat.send();
}

module.exports = { createAutoConfig}; 