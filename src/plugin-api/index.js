const Core = require('./core');
const Players = require('./players');
const Events = require('./events');
const DisplayNames = require('./display-names');
const Commands = require('./commands');
const Communication = require('./communication');
const World = require('./world');
const fs = require('fs');
const path = require('path');
const { getPluginsDir } = require('../utils/paths');

class PluginAPI {
    constructor(proxy, metadata) {
        this.proxy = proxy;
        this.metadata = metadata;
        this.loadedPlugins = [];
        
        this.pluginStates = new Map();
        
        this.core = new Core(proxy, metadata);
        this.playersModule = new Players(proxy, this.core);
        this.events = new Events(proxy, this.core);
        this.displayNames = new DisplayNames(proxy, this.core, this.events);
        this.commandsModule = new Commands(proxy, this.core);
        this.communicationModule = new Communication(proxy, this.core);
        this.worldModule = new World(proxy, this.core);
        
        this.config = this.core.config;
        this.log = this.core.log.bind(this.core);
        this.debugLog = this.core.debugLog.bind(this.core);
        
        this.on = this.events.on.bind(this.events);
        this.emit = this.events.emit.bind(this.events);
        
        this.setCustomDisplayName = this.displayNames.setCustomDisplayName.bind(this.displayNames);
        this.updatePlayerList = this.displayNames.updatePlayerList.bind(this.displayNames);
        this.clearAllCustomDisplayNames = this.displayNames.clearAllCustomDisplayNames.bind(this.displayNames);
        this.clearCustomDisplayName = this.displayNames.clearCustomDisplayName.bind(this.displayNames);
        this.customDisplayNames = this.displayNames.customDisplayNames;
        
        this.chat = this.communicationModule.chat.bind(this.communicationModule);
        this.sound = this.communicationModule.sound.bind(this.communicationModule);
        
        this.commands = this.commandsModule.register.bind(this.commandsModule);
        
        Object.defineProperty(this, 'enabled', {
            get: () => this.core.enabled
        });
        
        Object.defineProperty(this, 'debug', {
            get: () => this.core.debug
        });
        
        Object.defineProperty(this, 'players', {
            get: () => this.playersModule.getPlayers()
        });
        
        this.getPlayer = this.playersModule.getPlayer.bind(this.playersModule);
        this.getPlayerByName = this.playersModule.getPlayerByName.bind(this.playersModule);
        this.getPlayerInfo = this.playersModule.getPlayerInfo.bind(this.playersModule);
        this.calculateDistance = this.playersModule.calculateDistance.bind(this.playersModule);
        this.getPlayersWithinDistance = this.playersModule.getPlayersWithinDistance.bind(this.playersModule);
        this.getPlayersInTeam = this.playersModule.getPlayersInTeam.bind(this.playersModule);
        
        Object.defineProperty(this, 'gameState', {
            get: () => this.worldModule.gameState
        });
        
        this.getTeams = this.worldModule.getTeams.bind(this.worldModule);
        this.getPlayerTeam = this.worldModule.getPlayerTeam.bind(this.worldModule);
    }
    
    setPluginEnabled(pluginName, enabled) {
        const pluginState = this.pluginStates.get(pluginName);
        if (!pluginState) return;
        
        const wasEnabled = pluginState.enabled;
        pluginState.enabled = enabled;
        
        if (wasEnabled && !enabled) {
            this._cleanupPlugin(pluginName, pluginState);
        } else if (!wasEnabled && enabled) {
            this._restorePluginState(pluginName, pluginState);
        }
    }
    
    _cleanupPlugin(pluginName, pluginState) {
        for (const uuid of pluginState.modifications.displayNames) {
            this.clearCustomDisplayName(uuid);
        }
        pluginState.modifications.displayNames.clear();
        
        for (const { direction, packets, handler } of pluginState.modifications.interceptors) {
            this.events.unregisterPacketInterceptor(direction, packets, handler);
        }
        pluginState.modifications.interceptors.clear();
        
        console.log(`Cleaned up modifications for disabled plugin: ${pluginName}`);
    }
    
    _restorePluginState(pluginName, pluginState) {
        const currentState = {
            players: this.playersModule.getPlayers(),
            gameState: this.worldModule.gameState,
            teams: this.getTeams()
        };
        
        this.emit('plugin.restored', { pluginName, currentState });
        
        console.log(`Restored state for re-enabled plugin: ${pluginName}`);
    }
    
    _checkPluginEnabled(pluginName, methodName) {
        const pluginState = this.pluginStates.get(pluginName);
        if (!pluginState || !pluginState.enabled) {
            return false;
        }
        return true;
    }
    
    loadPlugins() {
        const pluginsDir = getPluginsDir();
        if (!fs.existsSync(pluginsDir)) {
            console.log('Plugins directory not found, no plugins to load');
            return;
        }
        
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
        
        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                const pluginName = path.basename(file, '.js');
                
                const pluginMetadata = {
                    name: pluginName,
                    path: pluginPath,
                    displayName: pluginName.charAt(0).toUpperCase() + pluginName.slice(1)
                };
                
                this.pluginStates.set(pluginName, {
                    enabled: true,
                    modifications: {
                        displayNames: new Set(),
                        interceptors: new Set(),
                        eventHandlers: new Set()
                    }
                });
                
                const pluginAPI = this.createPluginWrapper(pluginMetadata);
                
                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);
                
                if (typeof plugin.init === 'function') {
                    plugin.init(pluginAPI);
                } else if (typeof plugin === 'function') {
                    plugin(pluginAPI);
                }
                
                this.loadedPlugins.push({
                    name: pluginName,
                    displayName: pluginMetadata.displayName,
                    path: pluginPath,
                    enabled: true,
                    official: true,
                    metadata: pluginMetadata
                });
                
                console.log(`Loaded plugin: ${pluginMetadata.displayName}`);
                
            } catch (error) {
                console.error(`Failed to load plugin ${file}:`, error.message);
            }
        }
    }
    
    createPluginWrapper(pluginMetadata) {
        const pluginCore = new Core(this.proxy, pluginMetadata);
        const mainAPI = this;
        const pluginName = pluginMetadata.name;
        const pluginState = this.pluginStates.get(pluginName);
        
        const registeredInterceptors = [];
        
        const withEnabledCheck = (fn, methodName) => {
            return (...args) => {
                if (!mainAPI._checkPluginEnabled(pluginName, methodName)) {
                    return;
                }
                return fn(...args);
            };
        };
        
        return {
            metadata: (meta) => {
                Object.assign(pluginMetadata, meta);
            },
            
            configSchema: (schema) => {
                pluginMetadata.configSchema = schema;
            },
            
            config: pluginCore.config,
            log: withEnabledCheck(pluginCore.log.bind(pluginCore), 'log'),
            debugLog: withEnabledCheck(pluginCore.debugLog.bind(pluginCore), 'debugLog'),
            get enabled() { return pluginState?.enabled && pluginCore.enabled; },
            get debug() { return pluginCore.debug; },
            
            initializeConfig: pluginCore.initializeConfig.bind(pluginCore),
            getConfig: () => pluginCore.config,
            saveCurrentConfig: pluginCore.saveCurrentConfig.bind(pluginCore),
            getPrefix: () => `§8[§r${this.proxy.PROXY_PREFIX}§8-§r${pluginMetadata.prefix}§8]§r`,
            
            isEnabled: () => pluginState?.enabled && pluginCore.enabled,
            
            on: (event, handler) => {
                const wrappedHandler = withEnabledCheck(handler, 'eventHandler');
                pluginState.modifications.eventHandlers.add({ event, handler: wrappedHandler });
                return mainAPI.on(event, wrappedHandler);
            },
            emit: withEnabledCheck(mainAPI.emit, 'emit'),
            chat: withEnabledCheck(mainAPI.chat, 'chat'),
            sound: withEnabledCheck(mainAPI.sound, 'sound'),
            
            interceptPackets: (options, handler) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'interceptPackets')) {
                    return () => {};
                }
                
                if (!options || !options.direction || !options.packets || !Array.isArray(options.packets)) {
                    throw new Error('interceptPackets requires options with direction and packets array');
                }
                
                if (!['server', 'client'].includes(options.direction)) {
                    throw new Error('direction must be either "server" or "client"');
                }
                
                if (typeof handler !== 'function') {
                    throw new Error('handler must be a function');
                }
                
                const wrappedHandler = withEnabledCheck(handler, 'packetInterceptor');
                
                mainAPI.events.registerPacketInterceptor(options.direction, options.packets, wrappedHandler);
                
                const interceptorInfo = { direction: options.direction, packets: options.packets, handler: wrappedHandler };
                pluginState.modifications.interceptors.add(interceptorInfo);
                registeredInterceptors.push(interceptorInfo);
                
                return () => {
                    mainAPI.events.unregisterPacketInterceptor(options.direction, options.packets, wrappedHandler);
                    pluginState.modifications.interceptors.delete(interceptorInfo);
                    const index = registeredInterceptors.indexOf(interceptorInfo);
                    if (index !== -1) {
                        registeredInterceptors.splice(index, 1);
                    }
                };
            },
            
            everyTick: (callback) => {
                const wrappedCallback = withEnabledCheck(callback, 'tickHandler');
                return mainAPI.on('tick', wrappedCallback);
            },
            
            onWorldChange: (callback) => {
                const wrappedCallback = withEnabledCheck(callback, 'worldChangeHandler');
                return mainAPI.on('world.change', wrappedCallback);
            },
            
            get players() { 
                return mainAPI._checkPluginEnabled(pluginName, 'players') ? mainAPI.playersModule.getPlayers() : []; 
            },
            getPlayer: withEnabledCheck(mainAPI.getPlayer, 'getPlayer'),
            getPlayerByName: withEnabledCheck(mainAPI.getPlayerByName, 'getPlayerByName'),
            getPlayerInfo: withEnabledCheck(mainAPI.getPlayerInfo, 'getPlayerInfo'),
            calculateDistance: withEnabledCheck(mainAPI.calculateDistance, 'calculateDistance'),
            getPlayersWithinDistance: withEnabledCheck(mainAPI.getPlayersWithinDistance, 'getPlayersWithinDistance'),
            getPlayersInTeam: withEnabledCheck(mainAPI.getPlayersInTeam, 'getPlayersInTeam'),
            
            get gameState() { 
                return mainAPI._checkPluginEnabled(pluginName, 'gameState') ? mainAPI.worldModule.gameState : null; 
            },
            getTeams: withEnabledCheck(mainAPI.getTeams, 'getTeams'),
            getPlayerTeam: withEnabledCheck(mainAPI.getPlayerTeam, 'getPlayerTeam'),
            
            setCustomDisplayName: (uuid, displayName) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'setCustomDisplayName')) return;
                
                pluginState.modifications.displayNames.add(uuid);
                return mainAPI.setCustomDisplayName(uuid, displayName);
            },
            clearCustomDisplayName: (uuid) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'clearCustomDisplayName')) return;
                
                pluginState.modifications.displayNames.delete(uuid);
                return mainAPI.clearCustomDisplayName(uuid);
            },
            updatePlayerList: withEnabledCheck(mainAPI.updatePlayerList, 'updatePlayerList'),
            clearAllCustomDisplayNames: withEnabledCheck(mainAPI.clearAllCustomDisplayNames, 'clearAllCustomDisplayNames'),
            
            commands: (commands) => {
                return mainAPI.proxy.commandHandler.register(pluginMetadata.name, commands);
            },
            
            _cleanup: () => {
                for (const { direction, packets, handler } of registeredInterceptors) {
                    mainAPI.events.unregisterPacketInterceptor(direction, packets, handler);
                }
                registeredInterceptors.length = 0;
            }
        };
    }
    
    getLoadedPlugins() {
        return this.loadedPlugins;
    }
    
    _handleWorldChange(reason) {
        this.emit('world.change', { reason });
        
        this.displayNames._handleWorldChange(reason);
    }
}

module.exports = PluginAPI; 