const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PlayerManager = require('./player-manager');

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
        
        // create the PlayerManager for stateful player tracking
        this.playerManager = new PlayerManager();
        
        // connect PlayerManager events to plugin events
        this.playerManager.on('player.join', (player) => this.emit('player.join', player));
        this.playerManager.on('player.leave', (player) => this.emit('player.leave', player));
        this.playerManager.on('player.move', (player) => this.emit('player.move', player));
        this.playerManager.on('player.action', (player, action) => this.emit('player.action', player, action));
        this.playerManager.on('player.equipment', (player) => this.emit('player.equipment', player));
        
        this.scriptsDir = path.join(proxy.getBaseDir(), 'scripts');
        
        // compatibility mappings for old event names
        this.compatibilityMap = {
            'playerJoin': 'player.join',
            'playerLeave': 'player.leave',
            'playerMove': 'player.move',
            'playerSwing': 'player.action',
            'playerCrouch': 'player.action',
            'playerSprint': 'player.action',
            'playerUseItem': 'player.action',
            'playerHeldItemChange': 'player.equipment',
            'playerSpawn': 'player.join',
            'playerDespawn': 'player.leave',
            'teamUpdate': 'team.update',
            'playerRespawn': 'player.respawn'
        };
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
            // simplified API surface
            get players() {
                return self.playerManager.getAllPlayers();
            },
            
            getPlayer(uuid) {
                return self.playerManager.getPlayer(uuid);
            },
            
            config: {
                get: (key) => {
                    const plugin = self.plugins.get(moduleName.toLowerCase());
                    if (!plugin) return undefined;
                    
                    // support dot notation
                    return key.split('.').reduce((obj, k) => obj?.[k], plugin.config);
                },
                
                set: (key, value) => {
                    const plugin = self.plugins.get(moduleName.toLowerCase());
                    if (!plugin) return;
                    
                    // support dot notation
                    const keys = key.split('.');
                    const lastKey = keys.pop();
                    const target = keys.reduce((obj, k) => {
                        if (!obj[k]) obj[k] = {};
                        return obj[k];
                    }, plugin.config);
                    
                    target[lastKey] = value;
                    self.savePluginConfig(moduleName.toLowerCase());
                }
            },
            
            chat: (message) => {
                if (self.proxy.currentPlayer?.client) {
                    self.proxy.sendMessage(self.proxy.currentPlayer.client, message);
                }
            },
            
            sound: (name, options = {}) => {
                if (self.proxy.currentPlayer?.client?.state === 3) {
                    const pos = options.position || self.proxy.currentPlayer.gameState.position;
                    self.proxy.currentPlayer.client.write('named_sound_effect', {
                        soundName: name,
                        x: Math.round(pos.x * 8),
                        y: Math.round(pos.y * 8),
                        z: Math.round(pos.z * 8),
                        volume: options.volume || 1,
                        pitch: options.pitch || 63
                    });
                }
            },
            
            everyTick: (callback) => {
                self.registerEventHandler(moduleName.toLowerCase(), 'tick', callback);
            },
            
            on: (event, callback) => {
                // check for compatibility mapping
                const mappedEvent = self.compatibilityMap[event] || event;
                
                // special handling for legacy events that need transformation
                if (event in self.compatibilityMap) {
                    const wrappedCallback = self.createCompatibilityWrapper(event, callback);
                    self.registerEventHandler(moduleName.toLowerCase(), mappedEvent, wrappedCallback);
                } else {
                    self.registerEventHandler(moduleName.toLowerCase(), mappedEvent, callback);
                }
            },
            
            log: (message) => {
                const plugin = self.plugins.get(moduleName.toLowerCase());
                const prefix = plugin?.metadata.displayName || moduleName;
                console.log(`[${prefix}] ${message}`);
            },
            
            // legacy compatibility methods
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
            
            store: () => {
                return self.proxy.storage.getPluginStore(moduleName.toLowerCase());
            },
            
            // legacy getters
            get player() {
                return self.proxy.currentPlayer;
            },
            
            get gameState() {
                return self.proxy.currentPlayer?.gameState;
            },
            
            getPlayers: () => {
                // return legacy format for compatibility
                return self.playerManager.getAllPlayers().map(player => ({
                    uuid: player.uuid,
                    entityId: player.entityId,
                    name: player.name,
                    displayName: player.displayName,
                    ping: player.ping
                }));
            },

            getTeams: () => {
                return self.proxy.currentPlayer?.gameState?.teams || new Map();
            },
            
            getPlayerTeam: (playerName) => {
                const player = self.playerManager.getPlayerByName(playerName);
                return player?.team || null;
            },
            
            sendChat: (message) => api.chat(message),
            
            playSound: (soundName, options) => api.sound(soundName, options),

            updatePlayerList: (uuid, displayName) => {
                if (self.proxy.currentPlayer?.client?.state === 'play') {
                    self.customDisplayNames.set(uuid, displayName);
                    
                    self.proxy.currentPlayer.client.write('player_info', {
                        action: 3,
                        data: [{ UUID: uuid, displayName: displayName }]
                    });
                }
            },
            
            clearAllCustomDisplayNames: () => {
                self.customDisplayNames.clear();
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
    
    // create compatibility wrapper for old event format
    createCompatibilityWrapper(oldEvent, callback) {
        const self = this;
        
        switch (oldEvent) {
            case 'playerMove':
                return (player) => {
                    callback({
                        player: {
                            username: player.name,
                            uuid: player.uuid,
                            entityId: player.entityId,
                            displayName: player.displayName,
                            gameState: self.proxy.currentPlayer?.gameState
                        },
                        position: player.position,
                        onGround: player.onGround,
                        rotation: player.rotation
                    });
                };
                
            case 'playerSwing':
                return (player, action) => {
                    if (action?.type === 'swing') {
                        callback({
                            player: {
                                username: player.name,
                                uuid: player.uuid,
                                entityId: player.entityId,
                                displayName: player.displayName
                            }
                        });
                    }
                };
                
            case 'playerCrouch':
                return (player, action) => {
                    if (action?.type === 'crouch') {
                        callback({
                            player: {
                                username: player.name,
                                uuid: player.uuid,
                                entityId: player.entityId,
                                displayName: player.displayName
                            },
                            crouching: action.value
                        });
                    }
                };
                
            case 'playerSprint':
                return (player, action) => {
                    if (action?.type === 'sprint') {
                        callback({
                            player: {
                                username: player.name,
                                uuid: player.uuid,
                                entityId: player.entityId,
                                displayName: player.displayName
                            },
                            sprinting: action.value
                        });
                    }
                };
                
            case 'playerUseItem':
                return (player, action) => {
                    if (action?.type === 'useItem') {
                        callback({
                            player: {
                                username: player.name,
                                uuid: player.uuid,
                                entityId: player.entityId,
                                displayName: player.displayName
                            },
                            using: action.value
                        });
                    }
                };
                
            case 'playerHeldItemChange':
                return (player) => {
                    callback({
                        player: {
                            username: player.name,
                            uuid: player.uuid,
                            entityId: player.entityId,
                            displayName: player.displayName
                        },
                        slot: 0, // default slot for compatibility
                        item: player.heldItem
                    });
                };
                
            case 'playerJoin':
            case 'playerSpawn':
                return (player) => {
                    callback({
                        player: {
                            username: player.name,
                            uuid: player.uuid,
                            entityId: player.entityId,
                            displayName: player.displayName,
                            gameState: self.proxy.currentPlayer?.gameState
                        },
                        uuid: player.uuid,
                        name: player.name
                    });
                };
                
            case 'playerLeave':
            case 'playerDespawn':
                return (player) => {
                    callback({
                        player: {
                            username: player.name,
                            uuid: player.uuid,
                            entityId: player.entityId,
                            displayName: player.displayName
                        },
                        uuid: player.uuid,
                        name: player.name
                    });
                };
                
            default:
                return callback;
        }
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
    
    registerEventHandler(pluginName, event, handler, options = {}) {
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
    
    emit(event, ...args) {
        const chain = this.eventChains.get(event) || [];
        
        // also emit compatibility events if needed
        const legacyEvent = Object.entries(this.compatibilityMap).find(([old, mapped]) => mapped === event)?.[0];
        if (legacyEvent) {
            super.emit(legacyEvent, ...args);
        }
        
        for (const handlerInfo of chain) {
            const plugin = this.plugins.get(handlerInfo.pluginName);
            if (!plugin || !plugin.enabled) continue;
            
            try {
                handlerInfo.handler(...args);
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

module.exports = PluginAPI;