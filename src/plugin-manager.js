const path = require('path');
const fs = require('fs');

class PluginManager {
    constructor(proxyManager, proxyAPI, baseDir) {
        this.proxyManager = proxyManager;
        this.proxyAPI = proxyAPI;
        this.BASE_DIR = baseDir;
        
        this.plugins = new Map();
        this.pluginStates = new Map();
        this.pluginEventHandlers = new Map();
    }

    /**
     * Register a plugin with the system
     * @param {Object} pluginInfo - Plugin information object
     */
    registerPlugin(pluginInfo) {
        if (pluginInfo && pluginInfo.name) {    
            const normalizedName = pluginInfo.name.toLowerCase();
            this.plugins.set(normalizedName, pluginInfo);
            this.pluginStates.set(normalizedName, true);
            this.pluginEventHandlers.set(normalizedName, new Set());
            console.log(`Registered plugin: ${pluginInfo.name} (enabled)`);
        }
    }

    /**
     * Enable or disable a plugin
     * @param {string} pluginName - Name of the plugin
     * @param {boolean} enabled - Whether to enable (true) or disable (false)
     */
    setPluginEnabled(pluginName, enabled) {
        if (!this.plugins.has(pluginName)) {
            return false;
        }
        
        this.pluginStates.set(pluginName, enabled);
        const status = enabled ? 'enabled' : 'disabled';
        console.log(`Plugin ${pluginName} ${status}`);
        return true;
    }
    
    /**
     * Check if a plugin is enabled
     * @param {string} pluginName - Name of the plugin
     * @returns {boolean} - True if enabled, false if disabled or not found
     */
    isPluginEnabled(pluginName) {
        return this.pluginStates.get(pluginName) || false;
    }
    
    /**
     * Get all plugins and their states
     * @returns {Array} - Array of {name, displayName, enabled} objects
     */
    getAllPluginStates() {
        const states = [];
        for (const [name, info] of this.plugins.entries()) {
            states.push({
                name,
                displayName: info.displayName || name,
                enabled: this.pluginStates.get(name) || false
            });
        }
        return states;
    }

    /**
     * Get loaded plugins info
     * @returns {Array} - Array of plugin info objects
     */
    getLoadedPlugins() {
        return Array.from(this.plugins.values());
    }

    /**
     * Register an event listener for a specific plugin
     * @param {string} pluginName - Name of the plugin registering the listener
     * @param {string} eventName - Name of the event
     * @param {function} listener - Event listener function
     */
    registerPluginEventListener(pluginName, eventName, listener) {
        if (!this.pluginEventHandlers.has(pluginName)) {
            this.pluginEventHandlers.set(pluginName, new Set());
        }
        
        this.pluginEventHandlers.get(pluginName).add(listener);
        this.proxyAPI.on(eventName, listener);
    }

    /**
     * Filter event listeners to only include enabled plugins
     * @param {Array} listeners - Array of event listeners
     * @returns {Array} - Filtered array of listeners from enabled plugins
     */
    filterEnabledListeners(listeners) {
        return listeners.filter(listener => {
            for (const [pluginName, handlers] of this.pluginEventHandlers.entries()) {
                if (handlers.has(listener) && !this.isPluginEnabled(pluginName)) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Add enable/disable commands for plugin management to a commander.js module.
     * @param {Object} moduleCommand - Commander.js command object
     * @param {string} moduleName - Name of the plugin module
     */
    addPluginManagementCommands(moduleCommand, moduleName) {
        const enableCommand = moduleCommand.createCommand('enable');
        enableCommand
            .description(`Enable the ${moduleName} plugin`)
            .action((client) => {
                if (this.setPluginEnabled(moduleName, true)) {
                    this.proxyManager.sendChatMessage(client, `§a${moduleName} plugin enabled.`);
                } else {
                    this.proxyManager.sendChatMessage(client, `§cFailed to enable ${moduleName} plugin.`);
                }
            });
        moduleCommand.addCommand(enableCommand);

        const disableCommand = moduleCommand.createCommand('disable');
        disableCommand
            .description(`Disable the ${moduleName} plugin`)
            .action((client) => {
                if (this.setPluginEnabled(moduleName, false)) {
                    this.proxyManager.sendChatMessage(client, `§a${moduleName} plugin disabled.`);
                } else {
                    this.proxyManager.sendChatMessage(client, `§cFailed to disable ${moduleName} plugin.`);
                }
            });
        moduleCommand.addCommand(disableCommand);
    }

    /**
     * Loads plugins from the 'scripts' directory.
     */
    loadPlugins() {
        const scriptsFolder = path.join(this.BASE_DIR, 'scripts');
        console.log(`Looking for scripts in: ${scriptsFolder}`);
        if (!fs.existsSync(scriptsFolder)) {
            console.log('Scripts folder not found. Create a "scripts" folder to add plugins.');
            return;
        }

        fs.readdirSync(scriptsFolder).forEach((file) => {
            if (file.endsWith('.js')) {
                try {
                    const pluginPath = path.join(scriptsFolder, file);
                    delete require.cache[require.resolve(pluginPath)];
                    const plugin = require(pluginPath);
                    if (typeof plugin === 'function') {
                        const pluginAPI = this.createPluginAPI(file);
                        plugin(pluginAPI);
                    }
                } catch (err) {
                    console.error(`Failed to load plugin ${file}: ${err.message}`);
                    console.error(err.stack);
                }
            }
        });
        console.log(`Loaded ${this.getLoadedPlugins().length} plugins.`);
    }

    /**
     * Creates a plugin-specific API wrapper that tracks event listeners
     * @param {string} filename - The plugin filename
     * @returns {Object} - Plugin-specific API wrapper
     */
    createPluginAPI(filename) {
        const pluginName = path.basename(filename, '.js');
        
        const pluginAPI = {
            get currentPlayer() { return this.proxyAPI.currentPlayer; },
            sendToClient: (...args) => this.proxyAPI.sendToClient(...args),
            sendToServer: (...args) => this.proxyAPI.sendToServer(...args),
            sendChatMessage: (...args) => this.proxyAPI.sendChatMessage(...args),
            registerPlugin: (...args) => this.registerPlugin(...args),
            getLoadedPlugins: (...args) => this.getLoadedPlugins(...args),
            registerCommands: (...args) => this.proxyAPI.registerCommands(...args),
            kickPlayer: (...args) => this.proxyAPI.kickPlayer(...args),
            isPluginEnabled: (...args) => this.isPluginEnabled(...args),

            on: (eventName, listener) => {
                this.registerPluginEventListener(pluginName, eventName, listener);
                return pluginAPI;
            },

            once: (eventName, listener) => {
                const onceWrapper = (...args) => {
                    const handlers = this.pluginEventHandlers.get(pluginName);
                    if (handlers) {
                        handlers.delete(onceWrapper);
                    }
                    listener(...args);
                };
                this.registerPluginEventListener(pluginName, eventName, onceWrapper);
                return pluginAPI;
            },

            off: (eventName, listener) => {
                const handlers = this.pluginEventHandlers.get(pluginName);
                if (handlers) {
                    handlers.delete(listener);
                }
                this.proxyAPI.off(eventName, listener);
                return pluginAPI;
            },

            removeListener: (eventName, listener) => {
                return pluginAPI.off(eventName, listener);
            }
        };

        Object.setPrototypeOf(pluginAPI, Object.getPrototypeOf(this.proxyAPI));
        pluginAPI.proxyAPI = this.proxyAPI;
        pluginAPI.pluginManager = this;

        return pluginAPI;
    }
}

module.exports = PluginManager; 