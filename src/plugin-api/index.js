const Core = require('./core');
const Players = require('./players');
const Events = require('./events');
const DisplayNames = require('./display-names');
const Commands = require('./commands');
const Communication = require('./communication');
const World = require('./world');
const Entities = require('./entities');
const Inventory = require('./inventory');
const Server = require('./server');
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
        this.entitiesModule = new Entities(proxy, this.core);
        this.inventoryModule = new Inventory(proxy, this.core);
        this.serverModule = new Server(proxy, this.core);
        
        this.config = this.core.config;
        this.log = this.core.log.bind(this.core);
        this.debugLog = this.core.debugLog.bind(this.core);
        
        this.on = this.events.on.bind(this.events);
        this.emit = this.events.emit.bind(this.events);
        this.intercept = this.events.intercept.bind(this.events);
        
        this.setCustomDisplayName = this.displayNames.setCustomDisplayName.bind(this.displayNames);
        this.updatePlayerList = this.displayNames.updatePlayerList.bind(this.displayNames);
        this.clearAllCustomDisplayNames = this.displayNames.clearAllCustomDisplayNames.bind(this.displayNames);
        this.clearCustomDisplayName = this.displayNames.clearCustomDisplayName.bind(this.displayNames);
        this.customDisplayNames = this.displayNames.customDisplayNames;
        
        // communication methods
        this.chat = this.communicationModule.chat.bind(this.communicationModule);
        this.sound = this.communicationModule.sound.bind(this.communicationModule);
        this.sendTitle = this.communicationModule.sendTitle.bind(this.communicationModule);
        this.sendActionBar = this.communicationModule.sendActionBar.bind(this.communicationModule);
        this.sendParticle = this.communicationModule.sendParticle.bind(this.communicationModule);
        
        // server administration methods
        this.kick = this.serverModule.kick.bind(this.serverModule);
        this.sendKeepAlive = this.serverModule.sendKeepAlive.bind(this.serverModule);
        this.sendTabComplete = this.serverModule.sendTabComplete.bind(this.serverModule);
        this.sendCustomPayload = this.serverModule.sendCustomPayload.bind(this.serverModule);
        this.sendLogin = this.serverModule.sendLogin.bind(this.serverModule);
        
        // inventory/GUI methods
        this.openWindow = this.inventoryModule.openWindow.bind(this.inventoryModule);
        this.closeWindow = this.inventoryModule.closeWindow.bind(this.inventoryModule);
        this.setSlot = this.inventoryModule.setSlot.bind(this.inventoryModule);
        this.setWindowItems = this.inventoryModule.setWindowItems.bind(this.inventoryModule);
        this.sendTransaction = this.inventoryModule.sendTransaction.bind(this.inventoryModule);
        this.sendCraftProgress = this.inventoryModule.sendCraftProgress.bind(this.inventoryModule);
        this.setHeldItemSlot = this.inventoryModule.setHeldItemSlot.bind(this.inventoryModule);
        this.creativeInventoryAction = this.inventoryModule.creativeInventoryAction.bind(this.inventoryModule);
        this.enchantItem = this.inventoryModule.enchantItem.bind(this.inventoryModule);
        this.createChest = this.inventoryModule.createChest.bind(this.inventoryModule);
        this.createHopper = this.inventoryModule.createHopper.bind(this.inventoryModule);
        this.createDispenser = this.inventoryModule.createDispenser.bind(this.inventoryModule);
        this.fillWindow = this.inventoryModule.fillWindow.bind(this.inventoryModule);
        this.clearWindow = this.inventoryModule.clearWindow.bind(this.inventoryModule);
        
        this.commands = this.commandsModule.register.bind(this.commandsModule);
        
        Object.defineProperty(this, 'debug', {
            get: () => this.core.debug
        });
        
        Object.defineProperty(this, 'players', {
            get: () => this.playersModule.getPlayers()
        });
        
        // player query methods
        this.getPlayer = this.playersModule.getPlayer.bind(this.playersModule);
        this.getPlayerByName = this.playersModule.getPlayerByName.bind(this.playersModule);
        this.getPlayerInfo = this.playersModule.getPlayerInfo.bind(this.playersModule);
        this.calculateDistance = this.playersModule.calculateDistance.bind(this.playersModule);
        this.getPlayersWithinDistance = this.playersModule.getPlayersWithinDistance.bind(this.playersModule);
        this.getPlayersInTeam = this.playersModule.getPlayersInTeam.bind(this.playersModule);
        
        // player state methods
        this.sendHealth = this.playersModule.sendHealth.bind(this.playersModule);
        this.sendExperience = this.playersModule.sendExperience.bind(this.playersModule);
        this.sendPosition = this.playersModule.sendPosition.bind(this.playersModule);
        this.sendAbilities = this.playersModule.sendAbilities.bind(this.playersModule);
        this.sendPlayerInfo = this.playersModule.sendPlayerInfo.bind(this.playersModule);
        
        // entity methods
        this.spawnPlayer = this.entitiesModule.spawnPlayer.bind(this.entitiesModule);
        this.spawnLiving = this.entitiesModule.spawnLiving.bind(this.entitiesModule);
        this.spawnObject = this.entitiesModule.spawnObject.bind(this.entitiesModule);
        this.spawnExperienceOrb = this.entitiesModule.spawnExperienceOrb.bind(this.entitiesModule);
        this.setEntityVelocity = this.entitiesModule.setVelocity.bind(this.entitiesModule);
        this.teleportEntity = this.entitiesModule.teleport.bind(this.entitiesModule);
        this.moveEntity = this.entitiesModule.move.bind(this.entitiesModule);
        this.setEntityLook = this.entitiesModule.look.bind(this.entitiesModule);
        this.setEntityLookAndMove = this.entitiesModule.lookAndMove.bind(this.entitiesModule);
        this.setEntityHeadRotation = this.entitiesModule.setHeadRotation.bind(this.entitiesModule);
        this.setEntityEquipment = this.entitiesModule.setEquipment.bind(this.entitiesModule);
        this.addEntityEffect = this.entitiesModule.addEffect.bind(this.entitiesModule);
        this.removeEntityEffect = this.entitiesModule.removeEffect.bind(this.entitiesModule);
        this.setEntityStatus = this.entitiesModule.setStatus.bind(this.entitiesModule);
        this.setEntityMetadata = this.entitiesModule.setMetadata.bind(this.entitiesModule);
        this.animateEntity = this.entitiesModule.animate.bind(this.entitiesModule);
        this.collectEntity = this.entitiesModule.collect.bind(this.entitiesModule);
        this.attachEntity = this.entitiesModule.attach.bind(this.entitiesModule);
        
        // world methods
        this.getTeams = this.worldModule.getTeams.bind(this.worldModule);
        this.getPlayerTeam = this.worldModule.getPlayerTeam.bind(this.worldModule);
        this.sendExplosion = this.worldModule.sendExplosion.bind(this.worldModule);
        this.sendBlockChange = this.worldModule.sendBlockChange.bind(this.worldModule);
        this.sendMultiBlockChange = this.worldModule.sendMultiBlockChange.bind(this.worldModule);
        this.sendWorldEvent = this.worldModule.sendWorldEvent.bind(this.worldModule);
        this.sendTimeUpdate = this.worldModule.sendTimeUpdate.bind(this.worldModule);
        this.sendSpawnPosition = this.worldModule.sendSpawnPosition.bind(this.worldModule);
        this.sendGameStateChange = this.worldModule.sendGameStateChange.bind(this.worldModule);
        this.sendScoreboardObjective = this.worldModule.sendScoreboardObjective.bind(this.worldModule);
        this.sendScoreboardScore = this.worldModule.sendScoreboardScore.bind(this.worldModule);
        this.sendScoreboardDisplay = this.worldModule.sendScoreboardDisplay.bind(this.worldModule);
        this.sendTeams = this.worldModule.sendTeams.bind(this.worldModule);
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
        
        for (const interceptorInfo of pluginState.modifications.interceptors) {
            if (interceptorInfo.unsubscribe) {
                // New intercept format
                interceptorInfo.unsubscribe();
            } else if (interceptorInfo.direction && interceptorInfo.packets && interceptorInfo.handler) {
                // Old interceptPackets format
                this.events.unregisterPacketInterceptor(interceptorInfo.direction, interceptorInfo.packets, interceptorInfo.handler);
            }
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
    
    _ensureConfigCommandRegistered(pluginName) {
        if (this.proxy.commandHandler.modules.has(pluginName.toLowerCase())) {
            return;
        }
        
        this.proxy.commandHandler.register(pluginName, (registry) => {
        });
    }
    
    _getPluginEnabledState(pluginName) {
        try {
            const { getPluginConfigDir } = require('../utils/paths');
            const configPath = path.join(getPluginConfigDir(), `${pluginName}.config.json`);
            
            if (fs.existsSync(configPath)) {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return configData.enabled !== false;
            }
        } catch (error) {
            console.log(`Failed to read config for plugin ${pluginName}: ${error.message}`);
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
                
                const pluginEnabled = this._getPluginEnabledState(pluginName);
                
                this.pluginStates.set(pluginName, {
                    enabled: pluginEnabled,
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
                    enabled: pluginEnabled,
                    official: true,
                    metadata: pluginMetadata
                });
                
                const statusText = pluginEnabled ? 'Loaded' : 'Loaded (disabled)';
                console.log(`${statusText} plugin: ${pluginMetadata.displayName}`);
                
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
                this._ensureConfigCommandRegistered(pluginName);
            },
            
            config: pluginCore.config,
            log: withEnabledCheck(pluginCore.log.bind(pluginCore), 'log'),
            debugLog: withEnabledCheck(pluginCore.debugLog.bind(pluginCore), 'debugLog'),
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
            
            intercept: (event, handler) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'intercept')) {
                    return () => {};
                }
                
                const wrappedHandler = withEnabledCheck(handler, 'packetInterceptor');
                
                const unsubscribe = mainAPI.intercept(event, wrappedHandler);
                
                const interceptorInfo = { event, handler: wrappedHandler, unsubscribe };
                pluginState.modifications.interceptors.add(interceptorInfo);
                registeredInterceptors.push(interceptorInfo);
                
                return () => {
                    unsubscribe();
                    pluginState.modifications.interceptors.delete(interceptorInfo);
                    const index = registeredInterceptors.indexOf(interceptorInfo);
                    if (index !== -1) {
                        registeredInterceptors.splice(index, 1);
                    }
                };
            },
            
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
            
            chat: withEnabledCheck(mainAPI.chat, 'chat'),
            sound: withEnabledCheck(mainAPI.sound, 'sound'),
            
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
            
            // world methods
            getTeams: withEnabledCheck(mainAPI.getTeams, 'getTeams'),
            getPlayerTeam: withEnabledCheck(mainAPI.getPlayerTeam, 'getPlayerTeam'),
            
            // communication methods
            sendTitle: withEnabledCheck(mainAPI.sendTitle, 'sendTitle'),
            sendActionBar: withEnabledCheck(mainAPI.sendActionBar, 'sendActionBar'),
            sendParticle: withEnabledCheck(mainAPI.sendParticle, 'sendParticle'),
            
            // server administration methods
            kick: withEnabledCheck(mainAPI.kick, 'kick'),
            sendKeepAlive: withEnabledCheck(mainAPI.sendKeepAlive, 'sendKeepAlive'),
            sendTabComplete: withEnabledCheck(mainAPI.sendTabComplete, 'sendTabComplete'),
            sendCustomPayload: withEnabledCheck(mainAPI.sendCustomPayload, 'sendCustomPayload'),
            sendLogin: withEnabledCheck(mainAPI.sendLogin, 'sendLogin'),
            
            // inventory/GUI methods
            openWindow: withEnabledCheck(mainAPI.openWindow, 'openWindow'),
            closeWindow: withEnabledCheck(mainAPI.closeWindow, 'closeWindow'),
            setSlot: withEnabledCheck(mainAPI.setSlot, 'setSlot'),
            setWindowItems: withEnabledCheck(mainAPI.setWindowItems, 'setWindowItems'),
            sendTransaction: withEnabledCheck(mainAPI.sendTransaction, 'sendTransaction'),
            sendCraftProgress: withEnabledCheck(mainAPI.sendCraftProgress, 'sendCraftProgress'),
            setHeldItemSlot: withEnabledCheck(mainAPI.setHeldItemSlot, 'setHeldItemSlot'),
            creativeInventoryAction: withEnabledCheck(mainAPI.creativeInventoryAction, 'creativeInventoryAction'),
            enchantItem: withEnabledCheck(mainAPI.enchantItem, 'enchantItem'),
            createChest: withEnabledCheck(mainAPI.createChest, 'createChest'),
            createHopper: withEnabledCheck(mainAPI.createHopper, 'createHopper'),
            createDispenser: withEnabledCheck(mainAPI.createDispenser, 'createDispenser'),
            fillWindow: withEnabledCheck(mainAPI.fillWindow, 'fillWindow'),
            clearWindow: withEnabledCheck(mainAPI.clearWindow, 'clearWindow'),
            
            // player state methods
            sendHealth: withEnabledCheck(mainAPI.sendHealth, 'sendHealth'),
            sendExperience: withEnabledCheck(mainAPI.sendExperience, 'sendExperience'),
            sendPosition: withEnabledCheck(mainAPI.sendPosition, 'sendPosition'),
            sendAbilities: withEnabledCheck(mainAPI.sendAbilities, 'sendAbilities'),
            sendPlayerInfo: withEnabledCheck(mainAPI.sendPlayerInfo, 'sendPlayerInfo'),
            
            // entity methods
            spawnPlayer: withEnabledCheck(mainAPI.spawnPlayer, 'spawnPlayer'),
            spawnLiving: withEnabledCheck(mainAPI.spawnLiving, 'spawnLiving'),
            spawnObject: withEnabledCheck(mainAPI.spawnObject, 'spawnObject'),
            spawnExperienceOrb: withEnabledCheck(mainAPI.spawnExperienceOrb, 'spawnExperienceOrb'),
            setEntityVelocity: withEnabledCheck(mainAPI.setEntityVelocity, 'setEntityVelocity'),
            teleportEntity: withEnabledCheck(mainAPI.teleportEntity, 'teleportEntity'),
            moveEntity: withEnabledCheck(mainAPI.moveEntity, 'moveEntity'),
            setEntityLook: withEnabledCheck(mainAPI.setEntityLook, 'setEntityLook'),
            setEntityLookAndMove: withEnabledCheck(mainAPI.setEntityLookAndMove, 'setEntityLookAndMove'),
            setEntityHeadRotation: withEnabledCheck(mainAPI.setEntityHeadRotation, 'setEntityHeadRotation'),
            setEntityEquipment: withEnabledCheck(mainAPI.setEntityEquipment, 'setEntityEquipment'),
            addEntityEffect: withEnabledCheck(mainAPI.addEntityEffect, 'addEntityEffect'),
            removeEntityEffect: withEnabledCheck(mainAPI.removeEntityEffect, 'removeEntityEffect'),
            setEntityStatus: withEnabledCheck(mainAPI.setEntityStatus, 'setEntityStatus'),
            setEntityMetadata: withEnabledCheck(mainAPI.setEntityMetadata, 'setEntityMetadata'),
            animateEntity: withEnabledCheck(mainAPI.animateEntity, 'animateEntity'),
            collectEntity: withEnabledCheck(mainAPI.collectEntity, 'collectEntity'),
            attachEntity: withEnabledCheck(mainAPI.attachEntity, 'attachEntity'),
            
            // world methods
            sendExplosion: withEnabledCheck(mainAPI.sendExplosion, 'sendExplosion'),
            sendBlockChange: withEnabledCheck(mainAPI.sendBlockChange, 'sendBlockChange'),
            sendMultiBlockChange: withEnabledCheck(mainAPI.sendMultiBlockChange, 'sendMultiBlockChange'),
            sendWorldEvent: withEnabledCheck(mainAPI.sendWorldEvent, 'sendWorldEvent'),
            sendTimeUpdate: withEnabledCheck(mainAPI.sendTimeUpdate, 'sendTimeUpdate'),
            sendSpawnPosition: withEnabledCheck(mainAPI.sendSpawnPosition, 'sendSpawnPosition'),
            sendGameStateChange: withEnabledCheck(mainAPI.sendGameStateChange, 'sendGameStateChange'),
            sendScoreboardObjective: withEnabledCheck(mainAPI.sendScoreboardObjective, 'sendScoreboardObjective'),
            sendScoreboardScore: withEnabledCheck(mainAPI.sendScoreboardScore, 'sendScoreboardScore'),
            sendScoreboardDisplay: withEnabledCheck(mainAPI.sendScoreboardDisplay, 'sendScoreboardDisplay'),
            sendTeams: withEnabledCheck(mainAPI.sendTeams, 'sendTeams'),
            
            // display names & UI
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
            
            // commands
            commands: (commands) => {
                return mainAPI.commandsModule.register(pluginMetadata.name, commands);
            },
            
            _cleanup: () => {
                for (const interceptorInfo of registeredInterceptors) {
                    if (interceptorInfo.unsubscribe) {
                        interceptorInfo.unsubscribe();
                    } else if (interceptorInfo.direction && interceptorInfo.packets && interceptorInfo.handler) {
                        mainAPI.events.unregisterPacketInterceptor(interceptorInfo.direction, interceptorInfo.packets, interceptorInfo.handler);
                    }
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