const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

class PluginAPI extends EventEmitter {
    constructor(proxy) {
        super();
        this.proxy = proxy;
        this.plugins = new Map();
        this.pluginStates = new Map();
        this.pluginDependencies = new Map();
        this.pluginEventHandlers = new Map();
        this.eventChains = new Map();
        this.customDisplayNames = new Map();
        
        this.scriptsDir = path.join(proxy.getBaseDir(), 'scripts');
    }
    
    loadPlugins() {
        if (!fs.existsSync(this.scriptsDir)) {
            fs.mkdirSync(this.scriptsDir, { recursive: true });
            console.log('Created scripts directory');
            return;
        }
        
        const pluginFiles = fs.readdirSync(this.scriptsDir)
            .filter(file => file.endsWith('.js'));
        
        for (const file of pluginFiles) {
            this.loadPlugin(file);
        }
        
        this.resolveDependencyOrder();
        console.log(`Loaded ${this.plugins.size} plugins`);
    }
    
    loadPlugin(filename) {
        const filepath = path.join(this.scriptsDir, filename);
        
        try {
            delete require.cache[require.resolve(filepath)];
            const pluginModule = require(filepath);
            
            if (typeof pluginModule === 'function') {
                const api = this.createPluginAPI(filename);
                pluginModule(api);
            }
        } catch (err) {
            console.error(`Failed to load plugin ${filename}:`, err.message);
            const pluginName = path.basename(filename, '.js');
            this.plugins.delete(pluginName);
        }
    }
    
    createPluginAPI(filename) {
        const pluginNameFromFile = path.basename(filename, '.js');
        let moduleName = pluginNameFromFile;
        const self = this;

        const api = {
            metadata: (info) => {
                const normalizedInfo = {
                    name: info.name || pluginNameFromFile,
                    displayName: info.displayName || info.name || pluginNameFromFile,
                    version: info.version || '1.0.0',
                    author: info.author || 'Unknown',
                    description: info.description || '',
                    dependencies: info.dependencies || [],
                    prefix: info.prefix,
                    official: self.isOfficialPlugin(filename, info)
                };
                
                moduleName = normalizedInfo.name;
                self.registerPlugin(normalizedInfo);
                return api;
            },
            
            initializeConfig: (schema) => {
                const plugin = self.plugins.get(moduleName.toLowerCase());
                if (plugin) {
                    plugin.config = self.proxy.storage.loadPluginConfig(moduleName.toLowerCase());

                    if (plugin.config.debug === undefined) {
                        plugin.config.debug = false;
                    }
                    
                    schema.forEach(section => {
                        if (section.defaults) {
                            for (const key in section.defaults) {
                                if (getProperty(plugin.config, key) === undefined) {
                                    setProperty(plugin.config, key, section.defaults[key]);
                                }
                            }
                        }
                    });
                    
                    self.savePluginConfig(moduleName.toLowerCase());
                }
                return api;
            },
            
            commands: (registrar) => {
                self.proxy.commandHandler.register(moduleName, registrar);
                return api;
            },
            
            on: (event, handler, options = {}) => {
                self.registerEventHandler(moduleName.toLowerCase(), event, handler, options);
                return api;
            },
            
            store: () => {
                return self.proxy.storage.getPluginStore(moduleName.toLowerCase());
            },
            
            get player() {
                return self.proxy.currentPlayer;
            },
            
            get gameState() {
                return self.proxy.currentPlayer?.gameState;
            },
            
            getPlayers: () => {
                if (!self.proxy.currentPlayer?.gameState) return [];
                const players = [];
                for (const [uuid, info] of self.proxy.currentPlayer.gameState.playerInfo) {
                    players.push({
                        uuid,
                        ...info
                    });
                }
                return players;
            },

            getTeams: () => {
                return self.proxy.currentPlayer?.gameState?.teams || new Map();
            },
            
            getPlayerTeam: (playerName) => {
                if (!self.proxy.currentPlayer?.gameState) return null;
                const cleanPlayerName = playerName.replace(/§./g, '');
                return self.proxy.currentPlayer.gameState.getPlayerTeam(cleanPlayerName);
            },
            
            sendChat: (message) => {
                if (self.proxy.currentPlayer?.client) {
                    self.proxy.sendMessage(self.proxy.currentPlayer.client, message);
                }
            },
            
            playSound: (soundName, options = {}) => {
                if (self.proxy.currentPlayer?.client?.state === 3) {
                    const pos = options.position || self.proxy.currentPlayer.gameState.position;
                    self.proxy.currentPlayer.client.write('named_sound_effect', {
                        soundName: soundName,
                        x: Math.round(pos.x * 8),
                        y: Math.round(pos.y * 8),
                        z: Math.round(pos.z * 8),
                        volume: options.volume || 1,
                        pitch: options.pitch || 63
                    });
                }
            },

            updatePlayerList: (uuid, displayName) => {
                if (self.proxy.currentPlayer?.client?.state === 'play') {
                    self.customDisplayNames.set(uuid, displayName);
                    
                    self.proxy.currentPlayer.client.write('player_info', {
                        action: 3,
                        data: [{ UUID: uuid, displayName: displayName }]
                    });
                }
            },
            
            createInventory: (title, slots = 54) => {
                return new VirtualInventory(self.proxy.currentPlayer, title, slots);
            },
            
            createScoreboard: (name, displayName) => {
                return new VirtualScoreboard(self.proxy.currentPlayer, name, displayName);
            },
            
            clearAllCustomDisplayNames: () => {
                self.customDisplayNames.clear();
            },
            
            log: (message) => {
                const plugin = self.plugins.get(moduleName.toLowerCase());
                const prefix = plugin?.metadata.displayName || moduleName;
                console.log(`[${prefix}] ${message}`);
            },

            debugLog: (message) => {
                if (self.isPluginDebugEnabled(moduleName.toLowerCase())) {
                    const plugin = self.plugins.get(moduleName.toLowerCase());
                    const prefix = plugin?.metadata.displayName || moduleName;
                    console.log(`[${prefix} Debug] ${message}`);
                }
            },

            getPrefix: () => {
                const proxyPrefix = self.proxy.PROXY_PREFIX;
                const plugin = self.plugins.get(moduleName.toLowerCase());
                const pluginPrefix = plugin?.metadata?.prefix || plugin?.metadata?.displayName || moduleName;
                return `§8[§r${proxyPrefix}§8-§r${pluginPrefix}§8]§r`;
            },
            
            isEnabled: () => {
                return self.isPluginEnabled(moduleName.toLowerCase());
            },
            
            getConfig: () => {
                const plugin = self.plugins.get(moduleName.toLowerCase());
                return plugin?.config || {};
            },

            saveCurrentConfig: () => {
                self.savePluginConfig(moduleName.toLowerCase());
            }
        };
        
        return api;
    }
    
    registerPlugin(metadata) {
        const name = metadata.name.toLowerCase();
        
        this.plugins.set(name, {
            metadata,
            enabled: true,
            config: {},
            configSchema: []
        });
        
        const existingConfig = this.proxy.storage.loadPluginConfig(name);
        const plugin = this.plugins.get(name);
        plugin.config = existingConfig;
        
        if (plugin.config.debug === undefined) {
            plugin.config.debug = false;
        }
        
        this.pluginStates.set(name, { 
            enabled: true, 
            debug: plugin.config.debug 
        });
        this.pluginDependencies.set(name, metadata.dependencies || []);
        
        if (!this.pluginEventHandlers.has(name)) {
            this.pluginEventHandlers.set(name, new Map());
        }
    }
    
    registerEventHandler(pluginName, event, handler, options) {
        if (!this.pluginEventHandlers.has(pluginName)) {
            this.pluginEventHandlers.set(pluginName, new Map());
        }
        
        const handlers = this.pluginEventHandlers.get(pluginName);
        if (!handlers.has(event)) {
            handlers.set(event, []);
        }
        
        handlers.get(event).push({
            handler,
            priority: options.priority || 0
        });
        
        this.rebuildEventChain(event);
    }
    
    rebuildEventChain(event) {
        const allHandlers = [];
        
        for (const [pluginName, handlers] of this.pluginEventHandlers) {
            const plugin = this.plugins.get(pluginName);
            if (!plugin || !plugin.enabled) continue;
            
            const eventHandlers = handlers.get(event) || [];
            for (const handlerInfo of eventHandlers) {
                allHandlers.push({
                    pluginName,
                    ...handlerInfo
                });
            }
        }
        
        allHandlers.sort((a, b) => b.priority - a.priority);
        this.eventChains.set(event, allHandlers);
    }
    
    emit(event, data) {
        const chain = this.eventChains.get(event) || [];
        
        for (const handlerInfo of chain) {
            const plugin = this.plugins.get(handlerInfo.pluginName);
            if (!plugin || !plugin.enabled) continue;
            
            try {
                handlerInfo.handler(data);
            } catch (err) {
                console.error(`Error in ${handlerInfo.pluginName} handler for ${event}:`, err);
            }
        }
        
        return true;
    }
    
    isPluginEnabled(pluginName) {
        const state = this.pluginStates.get(pluginName);
        return state?.enabled || false;
    }
    
    isPluginDebugEnabled(pluginName) {
        const state = this.pluginStates.get(pluginName);
        if (state) return state.debug;
        
        const plugin = this.plugins.get(pluginName);
        return plugin?.config.debug || false;
    }
    
    setPluginEnabled(pluginName, enabled) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return false;
        
        if (!enabled) {
            const dependents = this.getPluginDependents(pluginName);
            for (const dependent of dependents) {
                if (this.isPluginEnabled(dependent)) {
                    return false;
                }
            }
        }
        
        if (enabled) {
            const dependencies = this.pluginDependencies.get(pluginName) || [];
            for (const dep of dependencies) {
                if (!this.isPluginEnabled(dep)) {
                    this.setPluginEnabled(dep, true);
                }
            }
        }
        
        plugin.enabled = enabled;
        this.pluginStates.set(pluginName, { ...this.pluginStates.get(pluginName), enabled });
        
        for (const [event] of this.eventChains) {
            this.rebuildEventChain(event);
        }
        
        return true;
    }
    
    setPluginDebugEnabled(pluginName, debug) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return false;
        
        plugin.config.debug = debug;
        this.pluginStates.set(pluginName, { ...this.pluginStates.get(pluginName), debug });
        
        this.savePluginConfig(pluginName);
        
        return true;
    }
    
    getPluginDependents(pluginName) {
        const dependents = [];
        
        for (const [name, deps] of this.pluginDependencies) {
            if (deps.includes(pluginName)) {
                dependents.push(name);
            }
        }
        
        return dependents;
    }
    
    resolveDependencyOrder() {
        const resolved = new Set();
        const resolving = new Set();
        
        const resolve = (name) => {
            if (resolved.has(name)) return;
            if (resolving.has(name)) {
                console.error(`Circular dependency detected involving ${name}`);
                return;
            }
            
            resolving.add(name);
            const deps = this.pluginDependencies.get(name) || [];
            
            for (const dep of deps) {
                if (!this.plugins.has(dep)) {
                    console.error(`Plugin ${name} depends on missing plugin: ${dep}`);
                    this.setPluginEnabled(name, false);
                    return;
                }
                resolve(dep);
            }
            
            resolving.delete(name);
            resolved.add(name);
        };
        
        for (const name of this.plugins.keys()) {
            resolve(name);
        }
    }
    
    getLoadedPlugins() {
        return Array.from(this.plugins.values()).map(p => ({
            ...p.metadata,
            enabled: p.enabled
        }));
    }
    
    savePluginConfig(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (plugin && plugin.config) {
            this.proxy.storage.savePluginConfig(pluginName, plugin.config);
        }
    }
    
    isOfficialPlugin(filename, metadata) {
        const filepath = path.join(this.scriptsDir, filename);
        const content = fs.readFileSync(filepath, 'utf8');
        
        if (content.includes('__OFFICIAL_PLUGIN__')) {
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            const expectedHash = metadata.checksum;
            
            if (expectedHash && hash === expectedHash) {
                return true;
            }
        }
        
        return false;
    }
}

class VirtualInventory {
    constructor(player, title, size) {
        this.player = player;
        this.title = title;
        this.size = size;
        this.windowId = 100 + Math.floor(Math.random() * 50);
        this.slots = new Array(size).fill(null);
        this.clickHandlers = new Map();
    }
    
    setItem(slot, item, clickHandler = null) {
        this.slots[slot] = item;
        if (clickHandler) {
            this.clickHandlers.set(slot, clickHandler);
        }
        return this;
    }
    
    open() {
        if (!this.player?.client) return;
        
        this.player.client.write('open_window', {
            windowId: this.windowId,
            inventoryType: 'minecraft:chest',
            windowTitle: JSON.stringify({ text: this.title }),
            slotCount: this.size
        });
        
        this.player.client.write('window_items', {
            windowId: this.windowId,
            items: this.slots
        });
        
        const originalHandler = this.player.client._events.window_click;
        this.player.client.on('window_click', (data) => {
            if (data.windowId === this.windowId) {
                const handler = this.clickHandlers.get(data.slot);
                if (handler) {
                    handler(data.slot, data);
                }
                
                this.player.client.write('set_slot', {
                    windowId: -1,
                    slot: -1,
                    item: null
                });
                
                this.player.client.write('confirm_transaction', {
                    windowId: this.windowId,
                    action: data.action,
                    accepted: false
                });
                
                return;
            }
            if (originalHandler) originalHandler(data);
        });
        
        return this;
    }
    
    close() {
        if (this.player?.client) {
            this.player.client.write('close_window', {
                windowId: this.windowId
            });
        }
    }
}

class VirtualScoreboard {
    constructor(player, name, displayName) {
        this.player = player;
        this.name = name;
        this.displayName = displayName;
        this.scores = new Map();
        this.created = false;
    }
    
    create(position = 1) {
        if (!this.player?.client || this.created) return this;
        
        this.player.client.write('scoreboard_objective', {
            name: this.name,
            action: 0,
            displayText: this.displayName,
            type: 'integer'
        });
        
        this.player.client.write('scoreboard_display_objective', {
            position: position,
            name: this.name
        });
        
        this.created = true;
        return this;
    }
    
    setScore(entry, value) {
        if (!this.player?.client || !this.created) return this;
        
        this.scores.set(entry, value);
        
        this.player.client.write('scoreboard_score', {
            scoreName: entry,
            action: 0,
            objective: this.name,
            value: value
        });
        
        return this;
    }
    
    removeScore(entry) {
        if (!this.player?.client || !this.created) return this;
        
        this.scores.delete(entry);
        
        this.player.client.write('scoreboard_score', {
            scoreName: entry,
            action: 1,
            objective: this.name,
            value: 0
        });
        
        return this;
    }
    
    destroy() {
        if (!this.player?.client || !this.created) return;
        
        this.player.client.write('scoreboard_objective', {
            name: this.name,
            action: 1
        });
        
        this.created = false;
        this.scores.clear();
    }
}

module.exports = { PluginAPI };