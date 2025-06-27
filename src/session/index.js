const mc = require('minecraft-protocol');
const { exec } = require('child_process');
const path = require('path');
const GameState = require('./game-state');

class PlayerSession {
    constructor(proxy, client) {
        this.proxy = proxy;
        this.client = client;
        this.targetClient = null;
        this.username = client.username;
        this.uuid = client.uuid;
        this.gameState = new GameState();
        this.connected = false;
        this.forceReauth = proxy.currentPlayer?.forceReauth || false;
        this.tickInterval = null;

        this.connect();
    }

    connect() {
        console.log(`Connecting ${this.username} to ${this.proxy.config.targetHost}...`);

        this.targetClient = mc.createClient({
            host: this.proxy.config.targetHost,
            port: this.proxy.config.targetPort || 25565,
            username: this.username,
            version: '1.8.9',
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: path.join(this.proxy.getBaseDir(), 'auth_cache', this.username),
            forceRefresh: this.forceReauth,
            onMsaCode: (data) => {
                this.handleMicrosoftAuth(data);
            }
        });

        this.targetClient.on('login', (packet) => this.handleLogin(packet));
        this.targetClient.on('error', (err) => this.handleError(err));
        this.targetClient.on('end', () => this.handleDisconnect());
    }

    handleMicrosoftAuth(msaData) {
        this.createAuthWorld();
        
        const url = `${msaData.verification_uri}?otc=${msaData.user_code}`;
        const messages = [
            '§6========================================',
            '       §6S§eta§fr§bfi§3sh §5P§5roxy §e- Authentication',
            '§6========================================',
            '§eMicrosoft Auth Required!',
            '§7A browser tab should open automatically.',
            `§7If not, visit: §b${url}`,
            '§6========================================'
        ];
        this.proxy.sendMessage(this.client, messages.join('\n'));
        
        const cmd = process.platform === 'darwin' ? `open "${url}"` 
                  : process.platform === 'win32' ? `start "" "${url}"` 
                  : `xdg-open "${url}"`;
        
        try { 
            exec(cmd); 
        } catch (e) {
            console.error('Failed to open browser:', e.message);
        }
    }

    createAuthWorld() {
        if (this.client.state !== mc.states.PLAY) return;
        
        this.client.write('login', {
            entityId: 1,
            gameMode: 1,
            dimension: 0,
            difficulty: 0,
            maxPlayers: 1,
            levelType: 'flat',
            reducedDebugInfo: false
        });
        
        this.client.write('position', {
            x: 0.5,
            y: 100,
            z: 0.5,
            yaw: 0,
            pitch: 0,
            flags: 0
        });
    }

    handleLogin(packet) {
        console.log(`${this.username} successfully connected to ${this.proxy.config.targetHost}`);
        
        if (this.forceReauth) {
            this.disconnect('§aRe-authentication successful! Please reconnect to the server.');
            this.forceReauth = false;
            this.proxy.currentPlayer.forceReauth = false;
            return;
        }

        this.connected = true;
        this.gameState.reset();
        this.gameState.loginPacket = packet;
        
        this._handleWorldChange('login');
        
        this.client.write('login', packet);
        this.proxy.pluginAPI.emit('player.join', { 
            player: this._createCurrentPlayerObject()
        });
        
        this.setupPacketForwarding();
    }

    handleError(err) {
        console.error(`Connection error for ${this.username}:`, err.message);
        
        if (!this.connected) {
            this.createAuthWorld();
            this.proxy.sendMessage(this.client, [
                '§6========================================',
                '   §6S§eta§fr§bfi§3sh §5P§5roxy §e- Connection Failed',
                '§6========================================',
                `§cFailed to connect to ${this.proxy.config.targetHost}`,
                `§cError: ${err.message}`,
                '§7Use §b/proxy server§7 to switch servers',
                '§6========================================'
            ].join('\n'));

            this.setupLimboMode();
        }
    }

    handleDisconnect() {
        if (!this.connected) {
            this.cleanup();
            return;
        }

        if (this.client.state === mc.states.PLAY) {
            this.client.end('Server disconnected');
        }
        this.cleanup();
    }

    setupPacketForwarding() {
        this.client.removeAllListeners('packet');
        this.targetClient.removeAllListeners('packet');

        this.client.on('packet', (data, meta) => {
            this.handleClientPacket(data, meta);
        });

        this.targetClient.on('packet', (data, meta) => {
            this.handleServerPacket(data, meta);
        });

        this.tickInterval = setInterval(() => {
            if (this.connected && this.proxy.currentPlayer === this) {
                this.proxy.pluginAPI.emit('tick', {});
            }
        }, 50);
    }
    
    _createCurrentPlayerObject() {
        return {
            uuid: this.uuid,
            name: this.username,
            displayName: this.username,
            isCurrentPlayer: true
        };
    }
    
    _createEntityPlayerObject(entityPlayer, entityId) {
        return {
            name: entityPlayer.name,
            uuid: entityPlayer.uuid,
            entityId: entityId,
            displayName: entityPlayer.name,
            isCurrentPlayer: false
        };
    }
    
    handleClientPacket(data, meta) {
        const criticalMovementPackets = ['position', 'position_look', 'look', 'entity_action'];
        if (criticalMovementPackets.includes(meta.name)) {
            if (this.targetClient?.state === mc.states.PLAY) {
                this.targetClient.write(meta.name, data);
            }
            
            setImmediate(() => {
                this.gameState.updateFromPacket(meta, data, false);
                this._handleClientPacketEvents(data, meta);
            });
            
            return;
        }
        
        this.gameState.updateFromPacket(meta, data, false);
        
        let commandHandled = false;
        if (meta.name === 'chat' && data.message.startsWith('/')) {
            commandHandled = this.proxy.commandHandler.handleCommand(data.message, this.client);
            if (commandHandled) {
                return;
            }
        }
        
        let shouldForward = true;
        let finalData = data;
        
        if (this.proxy.pluginAPI.events.hasPacketInterceptors('client', meta.name)) {
            const event = {
                data: { ...data },
                meta: { ...meta },
                cancelled: false,
                modified: false,
                modifiedData: null
            };
            
            event.modify = (newData) => {
                event.modified = true;
                event.modifiedData = newData;
            };
            
            event.cancel = () => {
                event.cancelled = true;
            };
            
            const interceptors = this.proxy.pluginAPI.events.getPacketInterceptors('client', meta.name);
            for (const handler of interceptors) {
                try {
                    handler(event);
                } catch (error) {
                    console.error(`Error in client packet interceptor for ${meta.name}:`, error.message);
                }
            }
            
            if (event.cancelled) {
                shouldForward = false;
            } else {
                finalData = event.modified ? event.modifiedData : data;
            }
        }
        
        if (shouldForward && this.targetClient?.state === mc.states.PLAY) {
            this.targetClient.write(meta.name, finalData);
        }
        
        setImmediate(() => {
            this._handleClientPacketEvents(finalData, meta);
        });
    }

    handleServerPacket(data, meta) {    
        const criticalMovementPackets = ['entity_teleport', 'rel_entity_move', 'entity_look', 'entity_look_and_move', 'entity_velocity', 'entity_head_rotation'];
        if (criticalMovementPackets.includes(meta.name)) {
            if (this.client.state === mc.states.PLAY) {
                this.client.write(meta.name, data);
            }
            
            setImmediate(() => {
                this.gameState.updateFromPacket(meta, data, true);
                this._handleServerPacketEvents(data, meta);
            });
            
            return;
        }
        
        if (!this.proxy.pluginAPI.events.hasPacketInterceptors('server', meta.name)) {
            this.gameState.updateFromPacket(meta, data, true);
            
            if (this.client.state === mc.states.PLAY) {
                this.client.write(meta.name, data);
            }
            
            setImmediate(() => {
                this._handleServerPacketEvents(data, meta);
            });
            
            return;
        }
        
        if (meta.name === 'player_info' && data.action === 4) {
            data.data.forEach(p => {
                const playerInfo = this.gameState.playerInfo.get(p.UUID);
                if (playerInfo) {
                    this.proxy.pluginAPI.emit('player.leave', {
                        player: {
                            uuid: p.UUID,
                            name: playerInfo.name,
                            displayName: playerInfo.name,
                            isCurrentPlayer: false
                        },
                        uuid: p.UUID,
                        name: playerInfo.name
                    });
                }
            });
        }
        this.gameState.updateFromPacket(meta, data, true);

        const event = {
            data: { ...data },
            meta: { ...meta },
            cancelled: false,
            modified: false,
            modifiedData: null
        };
        
        event.modify = (newData) => {
            event.modified = true;
            event.modifiedData = newData;
        };
        
        event.cancel = () => {
            event.cancelled = true;
        };
        
        const interceptors = this.proxy.pluginAPI.events.getPacketInterceptors('server', meta.name);
        for (const handler of interceptors) {
            try {
                handler(event);
            } catch (error) {
                console.error(`Error in packet interceptor for ${meta.name}:`, error.message);
            }
        }

        const entityPlayer = this.gameState.getPlayerByEntityId(data.entityId);
        if (entityPlayer && entityPlayer.name && entityPlayer.uuid) {
            const entity = this.gameState.entities.get(data.entityId);
            if (!entity) return;
            
            switch(meta.name) {
                case 'rel_entity_move':
                case 'entity_look':
                case 'entity_look_and_move':
                case 'entity_teleport':
                    if (entity.position) {
                        const rotation = (meta.name === 'entity_look' || meta.name === 'entity_look_and_move' || meta.name === 'entity_teleport') 
                            ? { yaw: entity.yaw || 0, pitch: entity.pitch || 0 }
                            : undefined;
                        
                        this.proxy.pluginAPI.emit('player.move', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            position: { ...entity.position },
                            onGround: entity.onGround !== undefined ? entity.onGround : true,
                            rotation: rotation
                        });
                    }
                    break;
                case 'animation':
                    if (data.animation === 0) {
                        this.proxy.pluginAPI.emit('player.action', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            type: 'swing'
                        });
                    }
                    break;
                case 'entity_metadata':
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        type: 'crouch',
                        value: entity.isCrouching || false
                    });
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        type: 'sprint',
                        value: entity.isSprinting || false
                    });
                    if (entity.isUsingItem !== undefined) {
                        this.proxy.pluginAPI.emit('player.action', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            type: 'useItem',
                            value: entity.isUsingItem
                        });
                    }
                    break;
                case 'entity_equipment':
                    this.proxy.pluginAPI.emit('player.equipment', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        item: data.item,
                        slot: data.slot
                    });
                    break;
            }
        }

        switch (meta.name) {
            case 'chat':
                try {
                    const parsed = JSON.parse(data.message);
                    const text = this.gameState.extractText(parsed);
                    const chatEvent = { ...event, parsedMessage: parsed, text: text };
                    this.proxy.pluginAPI.emit('chat', chatEvent);
                } catch (e) {
                    this.proxy.pluginAPI.emit('chat', event);
                }
                break;
            case 'player_info':
                if (data.action === 0) {
                    data.data.forEach(p => {
                        const playerInfo = this.gameState.playerInfo.get(p.UUID);
                        if (playerInfo) {
                            this.proxy.pluginAPI.emit('player.join', {
                                player: {
                                    uuid: p.UUID,
                                    name: playerInfo.name,
                                    displayName: playerInfo.name,
                                    isCurrentPlayer: false
                                },
                                uuid: p.UUID,
                                name: playerInfo.name
                            });
                        }
                    });
                } else if (data.action === 4) {
                }
                break;
            case 'scoreboard_team':
                this.proxy.pluginAPI.emit('teamUpdate', { ...event, ...data });
                break;
            case 'respawn':
                this._handleWorldChange('respawn');
                this.proxy.pluginAPI.emit('player.respawn', { 
                    player: this._createCurrentPlayerObject()
                });
                break;
        }

        if (!event.cancelled && this.client.state === mc.states.PLAY) {
            this.client.write(meta.name, event.modified ? event.modifiedData : event.data);

            if (meta.name === 'player_info' && (data.action === 0 || data.action === 3)) {
                setTimeout(() => {
                    if (this.client.state !== mc.states.PLAY) return;
                    
                    data.data.forEach(p => {
                        const uuid = p.UUID || p.uuid;
                        const customName = this.proxy.pluginAPI.customDisplayNames.get(uuid);
                        if (customName) {
                            const displayNameJSON = JSON.stringify({ text: customName });
                            
                            this.client.write('player_info', {
                                action: 3,
                                data: [{ UUID: uuid, displayName: displayNameJSON }]
                            });
                        }
                    });
                }, 50);
            } else if (meta.name === 'scoreboard_team' && (data.mode === 0 || data.mode === 2 || data.mode === 3 || data.mode === 4)) {
            }
        }
    }

    setupLimboMode() {
        this.client.removeAllListeners('packet');
        
        const keepAliveInterval = setInterval(() => {
            if (this.client.state === mc.states.PLAY) {
                this.client.write('keep_alive', {
                    keepAliveId: Math.floor(Math.random() * 2147483647)
                });
            }
        }, 20000);

        this.client.on('packet', (data, meta) => {
            if (meta.name === 'chat' && data.message.startsWith('/')) {
                this.proxy.commandHandler.handleCommand(data.message, this.client);
            }
        });
        
        this.client.once('end', () => {
            clearInterval(keepAliveInterval);
            this.cleanup();
        });
    }

    disconnect(reason = 'Disconnected') {
        this.cleanup();
        
        if (this.client && this.client.state === mc.states.PLAY) {
            this.client.end(reason);
        }
        if (this.targetClient && this.targetClient.state !== mc.states.DISCONNECTED) {
            this.targetClient.end();
        }
    }

    cleanup() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        
        if (this.connected) {
            this.proxy.pluginAPI.emit('player.leave', { 
                player: this._createCurrentPlayerObject()
            });
        }
        
        this.connected = false;
        this.proxy.clearSession();
    }
    
    _handleClientPacketEvents(data, meta) {
        if (!this.connected || this.proxy.currentPlayer !== this) return;
        
        switch (meta.name) {
            case 'chat':
                this.proxy.pluginAPI.emit('client.chat', {
                    player: this._createCurrentPlayerObject(),
                    message: data.message
                });
                break;
            case 'position':
                this.proxy.pluginAPI.emit('player.move', {
                    player: this._createCurrentPlayerObject(),
                    position: { x: data.x, y: data.y, z: data.z },
                    onGround: data.onGround,
                    rotation: undefined
                });
                break;
            case 'position_look':
                this.proxy.pluginAPI.emit('player.move', {
                    player: this._createCurrentPlayerObject(),
                    position: { x: data.x, y: data.y, z: data.z },
                    onGround: data.onGround,
                    rotation: { yaw: data.yaw, pitch: data.pitch }
                });
                break;
            case 'look':
                this.proxy.pluginAPI.emit('player.move', {
                    player: this._createCurrentPlayerObject(),
                    position: { ...this.gameState.position },
                    onGround: data.onGround,
                    rotation: { yaw: data.yaw, pitch: data.pitch }
                });
                break;
            case 'arm_animation':
                this.proxy.pluginAPI.emit('player.action', { 
                    player: this._createCurrentPlayerObject(),
                    type: 'swing'
                });
                break;
            case 'entity_action':
                if (data.actionId === 0) {
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createCurrentPlayerObject(),
                        type: 'crouch',
                        value: true
                    });
                } else if (data.actionId === 1) {
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createCurrentPlayerObject(),
                        type: 'crouch',
                        value: false
                    });
                } else if (data.actionId === 3) {
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createCurrentPlayerObject(),
                        type: 'sprint',
                        value: true
                    });
                } else if (data.actionId === 4) {
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createCurrentPlayerObject(),
                        type: 'sprint',
                        value: false
                    });
                }
                break;
            case 'block_dig':
                this.proxy.pluginAPI.emit('player.blockDig', {
                    player: this._createCurrentPlayerObject(),
                    status: data.status,
                    location: data.location,
                    face: data.face
                });
                break;
            case 'block_place':
                this.proxy.pluginAPI.emit('player.blockPlace', {
                    player: this._createCurrentPlayerObject(),
                    location: data.location,
                    direction: data.direction,
                    heldItem: data.heldItem,
                    cursorPosition: { x: data.cursorX, y: data.cursorY, z: data.cursorZ }
                });
                this.proxy.pluginAPI.emit('player.action', { 
                    player: this._createCurrentPlayerObject(),
                    type: 'useItem',
                    value: true
                });
                setTimeout(() => {
                    if (!this.connected || this.proxy.currentPlayer !== this) return;
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createCurrentPlayerObject(),
                        type: 'useItem',
                        value: false
                    });
                }, 500);
                break;
            case 'held_item_slot':
                this.proxy.pluginAPI.emit('player.equipment', { 
                    player: this._createCurrentPlayerObject(),
                    slot: data.slotId,
                    item: null
                });
                this.proxy.pluginAPI.emit('player.heldItemChange', {
                    player: this._createCurrentPlayerObject(),
                    slot: data.slotId
                });
                break;
            case 'use_entity':
                this.proxy.pluginAPI.emit('player.useEntity', {
                    player: this._createCurrentPlayerObject(),
                    target: data.target,
                    mouse: data.mouse,
                    position: { x: data.x, y: data.y, z: data.z }
                });
                break;
            case 'window_click':
                this.proxy.pluginAPI.emit('inventory.click', {
                    player: this._createCurrentPlayerObject(),
                    windowId: data.windowId,
                    slot: data.slot,
                    mouseButton: data.mouseButton,
                    action: data.action,
                    mode: data.mode,
                    item: data.item
                });
                break;
            case 'close_window':
                this.proxy.pluginAPI.emit('inventory.close', {
                    player: this._createCurrentPlayerObject(),
                    windowId: data.windowId
                });
                break;
            case 'tab_complete':
                this.proxy.pluginAPI.emit('client.tabComplete', {
                    player: this._createCurrentPlayerObject(),
                    text: data.text
                });
                break;
            case 'client_command':
                this.proxy.pluginAPI.emit('client.command', {
                    player: this._createCurrentPlayerObject(),
                    command: data.command
                });
                break;
            case 'keep_alive':
                this.proxy.pluginAPI.emit('client.keepAlive', {
                    player: this._createCurrentPlayerObject(),
                    keepAliveId: data.keepAliveId
                });
                break;
            case 'flying':
                this.proxy.pluginAPI.emit('client.flying', {
                    player: this._createCurrentPlayerObject(),
                    onGround: data.onGround
                });
                break;
            case 'steer_vehicle':
                this.proxy.pluginAPI.emit('client.steerVehicle', {
                    player: this._createCurrentPlayerObject(),
                    sideways: data.sideways,
                    forward: data.forward,
                    jump: data.jump,
                    unmount: data.unmount
                });
                break;
            case 'transaction':
                this.proxy.pluginAPI.emit('client.transaction', {
                    player: this._createCurrentPlayerObject(),
                    windowId: data.windowId,
                    action: data.action,
                    accepted: data.accepted
                });
                break;
            case 'creative_inventory_action':
                this.proxy.pluginAPI.emit('client.creativeInventory', {
                    player: this._createCurrentPlayerObject(),
                    slot: data.slot,
                    item: data.item
                });
                break;
            case 'enchant_item':
                this.proxy.pluginAPI.emit('client.enchantItem', {
                    player: this._createCurrentPlayerObject(),
                    windowId: data.windowId,
                    enchantment: data.enchantment
                });
                break;
            case 'update_sign':
                this.proxy.pluginAPI.emit('client.signUpdate', {
                    player: this._createCurrentPlayerObject(),
                    location: data.location,
                    text1: data.text1,
                    text2: data.text2,
                    text3: data.text3,
                    text4: data.text4
                });
                break;
            case 'abilities':
                this.proxy.pluginAPI.emit('client.abilities', {
                    player: this._createCurrentPlayerObject(),
                    flags: data.flags,
                    flyingSpeed: data.flyingSpeed,
                    walkingSpeed: data.walkingSpeed
                });
                break;
            case 'custom_payload':
                this.proxy.pluginAPI.emit('client.customPayload', {
                    player: this._createCurrentPlayerObject(),
                    channel: data.channel,
                    data: data.data
                });
                break;
            case 'spectate':
                this.proxy.pluginAPI.emit('client.spectate', {
                    player: this._createCurrentPlayerObject(),
                    target: data.target
                });
                break;
        }
    }
    
    _handleServerPacketEvents(data, meta) {
        if (!this.connected || this.proxy.currentPlayer !== this) return;
        
        switch (meta.name) {
            case 'keep_alive':
                this.proxy.pluginAPI.emit('server.keepAlive', {
                    keepAliveId: data.keepAliveId
                });
                break;
            case 'time_update':
                this.proxy.pluginAPI.emit('world.timeUpdate', {
                    age: data.age,
                    time: data.time
                });
                break;
            case 'health':
                this.proxy.pluginAPI.emit('player.health', {
                    player: this._createCurrentPlayerObject(),
                    health: data.health,
                    food: data.food,
                    foodSaturation: data.foodSaturation
                });
                break;
            case 'experience':
                this.proxy.pluginAPI.emit('player.experience', {
                    player: this._createCurrentPlayerObject(),
                    experienceBar: data.experienceBar,
                    level: data.level,
                    totalExperience: data.totalExperience
                });
                break;
            case 'spawn_position':
                this.proxy.pluginAPI.emit('world.spawnPosition', {
                    position: data.location
                });
                break;
            case 'world_event':
                this.proxy.pluginAPI.emit('world.event', {
                    effectId: data.effectId,
                    location: data.location,
                    data: data.data,
                    disableRelativeVolume: data.disableRelativeVolume
                });
                break;
            case 'explosion':
                this.proxy.pluginAPI.emit('world.explosion', {
                    position: { x: data.x, y: data.y, z: data.z },
                    radius: data.radius,
                    records: data.records,
                    playerMotion: {
                        x: data.playerMotionX,
                        y: data.playerMotionY,
                        z: data.playerMotionZ
                    }
                });
                break;
            case 'named_sound_effect':
                this.proxy.pluginAPI.emit('world.sound', {
                    soundName: data.soundName,
                    position: { x: data.x / 8, y: data.y / 8, z: data.z / 8 },
                    volume: data.volume,
                    pitch: data.pitch / 63
                });
                break;
            case 'particle':
                this.proxy.pluginAPI.emit('world.particle', {
                    particleId: data.particleId,
                    longDistance: data.longDistance,
                    position: { x: data.x, y: data.y, z: data.z },
                    offset: { x: data.offsetX, y: data.offsetY, z: data.offsetZ },
                    particleData: data.particleData,
                    particleCount: data.particleCount,
                    data: data.data
                });
                break;
            case 'block_change':
                this.proxy.pluginAPI.emit('world.blockChange', {
                    location: data.location,
                    type: data.type
                });
                break;
            case 'multi_block_change':
                this.proxy.pluginAPI.emit('world.multiBlockChange', {
                    chunkX: data.chunkX,
                    chunkZ: data.chunkZ,
                    records: data.records
                });
                break;
            case 'game_state_change':
                this.proxy.pluginAPI.emit('world.gameStateChange', {
                    reason: data.reason,
                    gameMode: data.gameMode
                });
                break;
            case 'open_window':
                this.proxy.pluginAPI.emit('inventory.windowOpen', {
                    windowId: data.windowId,
                    inventoryType: data.inventoryType,
                    windowTitle: data.windowTitle,
                    slotCount: data.slotCount
                });
                break;
            case 'close_window':
                this.proxy.pluginAPI.emit('inventory.windowClose', {
                    windowId: data.windowId
                });
                break;
            case 'set_slot':
                this.proxy.pluginAPI.emit('inventory.slotSet', {
                    windowId: data.windowId,
                    slot: data.slot,
                    item: data.item
                });
                break;
            case 'window_items':
                this.proxy.pluginAPI.emit('inventory.windowItems', {
                    windowId: data.windowId,
                    items: data.items
                });
                break;
            case 'scoreboard_objective':
                this.proxy.pluginAPI.emit('scoreboard.objective', {
                    objectiveName: data.objectiveName,
                    mode: data.mode,
                    objectiveValue: data.objectiveValue,
                    type: data.type
                });
                break;
            case 'scoreboard_score':
                this.proxy.pluginAPI.emit('scoreboard.score', {
                    itemName: data.itemName,
                    action: data.action,
                    scoreName: data.scoreName,
                    value: data.value
                });
                break;
            case 'scoreboard_display_objective':
                this.proxy.pluginAPI.emit('scoreboard.displayObjective', {
                    position: data.position,
                    scoreName: data.scoreName
                });
                break;
            case 'teams':
                this.proxy.pluginAPI.emit('teamUpdate', { ...data });
                this.proxy.pluginAPI.emit('team.update', {
                    team: data.team,
                    mode: data.mode,
                    name: data.name,
                    prefix: data.prefix,
                    suffix: data.suffix,
                    friendlyFire: data.friendlyFire,
                    nameTagVisibility: data.nameTagVisibility,
                    color: data.color,
                    players: data.players
                });
                break;
            case 'abilities':
                this.proxy.pluginAPI.emit('player.abilities', {
                    player: this._createCurrentPlayerObject(),
                    flags: data.flags,
                    flyingSpeed: data.flyingSpeed,
                    walkingSpeed: data.walkingSpeed
                });
                break;
            case 'chat':
                try {
                    const parsed = JSON.parse(data.message);
                    const text = this.gameState.extractText(parsed);
                    this.proxy.pluginAPI.emit('chat', {
                        message: data.message,
                        position: data.position,
                        parsedMessage: parsed,
                        text: text
                    });
                } catch (e) {
                    this.proxy.pluginAPI.emit('chat', {
                        message: data.message,
                        position: data.position
                    });
                }
                break;
            case 'player_info':
                if (data.action === 4) {
                    data.data.forEach(p => {
                        const playerInfo = this.gameState.playerInfo.get(p.UUID);
                        if (playerInfo) {
                            this.proxy.pluginAPI.emit('player.leave', {
                                player: {
                                    uuid: p.UUID,
                                    name: playerInfo.name,
                                    displayName: playerInfo.name,
                                    isCurrentPlayer: false
                                },
                                uuid: p.UUID,
                                name: playerInfo.name
                            });
                        }
                    });
                }
                if (data.action === 0) {
                    data.data.forEach(p => {
                        const playerInfo = this.gameState.playerInfo.get(p.UUID);
                        if (playerInfo) {
                            this.proxy.pluginAPI.emit('player.join', {
                                player: {
                                    uuid: p.UUID,
                                    name: playerInfo.name,
                                    displayName: playerInfo.name,
                                    isCurrentPlayer: false
                                },
                                uuid: p.UUID,
                                name: playerInfo.name
                            });
                        }
                    });
                }
                this.proxy.pluginAPI.emit('player.info', {
                    action: data.action,
                    data: data.data
                });
                break;
            case 'respawn':
                this._handleWorldChange('respawn');
                this.proxy.pluginAPI.emit('player.respawn', { 
                    player: this._createCurrentPlayerObject()
                });
                break;
            case 'kick_disconnect':
                this.proxy.pluginAPI.emit('server.disconnect', {
                    reason: data.reason
                });
                break;
            case 'login':
                this.proxy.pluginAPI.emit('server.login', {
                    entityId: data.entityId,
                    gameMode: data.gameMode,
                    dimension: data.dimension,
                    difficulty: data.difficulty,
                    maxPlayers: data.maxPlayers,
                    levelType: data.levelType,
                    reducedDebugInfo: data.reducedDebugInfo
                });
                break;
            case 'position':
                this.proxy.pluginAPI.emit('server.position', {
                    player: this._createCurrentPlayerObject(),
                    position: { x: data.x, y: data.y, z: data.z },
                    rotation: { yaw: data.yaw, pitch: data.pitch },
                    flags: data.flags,
                    teleportId: data.teleportId
                });
                break;
            case 'entity_equipment':
                this.proxy.pluginAPI.emit('entity.equipment', {
                    entityId: data.entityId,
                    slot: data.slot,
                    item: data.item
                });
                break;
            case 'bed':
                this.proxy.pluginAPI.emit('player.bed', {
                    player: this._createCurrentPlayerObject(),
                    location: data.location
                });
                break;
            case 'animation':
                this.proxy.pluginAPI.emit('entity.animation', {
                    entityId: data.entityId,
                    animation: data.animation
                });
                break;
            case 'named_entity_spawn':
                this.proxy.pluginAPI.emit('entity.spawn.player', {
                    entityId: data.entityId,
                    playerUUID: data.playerUUID,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    rotation: { yaw: data.yaw, pitch: data.pitch },
                    currentItem: data.currentItem,
                    metadata: data.metadata
                });
                break;
            case 'collect':
                this.proxy.pluginAPI.emit('entity.collect', {
                    collectedEntityId: data.collectedEntityId,
                    collectorEntityId: data.collectorEntityId
                });
                break;
            case 'spawn_entity':
                this.proxy.pluginAPI.emit('entity.spawn.object', {
                    entityId: data.entityId,
                    type: data.type,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    pitch: data.pitch,
                    yaw: data.yaw,
                    objectData: data.objectData,
                    velocity: { x: data.velocityX, y: data.velocityY, z: data.velocityZ }
                });
                break;
            case 'spawn_entity_living':
                this.proxy.pluginAPI.emit('entity.spawn.living', {
                    entityId: data.entityId,
                    type: data.type,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    rotation: { yaw: data.yaw, pitch: data.pitch, headPitch: data.headPitch },
                    velocity: { x: data.velocityX, y: data.velocityY, z: data.velocityZ },
                    metadata: data.metadata
                });
                break;
            case 'spawn_entity_painting':
                this.proxy.pluginAPI.emit('entity.spawn.painting', {
                    entityId: data.entityId,
                    title: data.title,
                    location: data.location,
                    direction: data.direction
                });
                break;
            case 'spawn_entity_experience_orb':
                this.proxy.pluginAPI.emit('entity.spawn.experience', {
                    entityId: data.entityId,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    count: data.count
                });
                break;
            case 'entity_velocity':
                this.proxy.pluginAPI.emit('entity.velocity', {
                    entityId: data.entityId,
                    velocity: { x: data.velocityX, y: data.velocityY, z: data.velocityZ }
                });
                break;
            case 'rel_entity_move':
                this.proxy.pluginAPI.emit('entity.move', {
                    entityId: data.entityId,
                    delta: { x: data.dX / 32, y: data.dY / 32, z: data.dZ / 32 },
                    onGround: data.onGround
                });
                break;
            case 'entity_look':
                this.proxy.pluginAPI.emit('entity.look', {
                    entityId: data.entityId,
                    rotation: { yaw: data.yaw, pitch: data.pitch },
                    onGround: data.onGround
                });
                break;
            case 'entity_look_and_move':
                this.proxy.pluginAPI.emit('entity.lookAndMove', {
                    entityId: data.entityId,
                    delta: { x: data.dX / 32, y: data.dY / 32, z: data.dZ / 32 },
                    rotation: { yaw: data.yaw, pitch: data.pitch },
                    onGround: data.onGround
                });
                break;
            case 'entity_teleport':
                this.proxy.pluginAPI.emit('entity.teleport', {
                    entityId: data.entityId,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    rotation: { yaw: data.yaw, pitch: data.pitch },
                    onGround: data.onGround
                });
                break;
            case 'entity_head_rotation':
                this.proxy.pluginAPI.emit('entity.headRotation', {
                    entityId: data.entityId,
                    headYaw: data.headYaw
                });
                break;
            case 'entity_status':
                this.proxy.pluginAPI.emit('entity.status', {
                    entityId: data.entityId,
                    entityStatus: data.entityStatus
                });
                break;
            case 'attach_entity':
                this.proxy.pluginAPI.emit('entity.attach', {
                    entityId: data.entityId,
                    vehicleId: data.vehicleId,
                    leash: data.leash
                });
                break;
            case 'entity_metadata':
                this.proxy.pluginAPI.emit('entity.metadata', {
                    entityId: data.entityId,
                    metadata: data.metadata
                });
                break;
            case 'entity_effect':
                this.proxy.pluginAPI.emit('entity.effect', {
                    entityId: data.entityId,
                    effectId: data.effectId,
                    amplifier: data.amplifier,
                    duration: data.duration,
                    hideParticles: data.hideParticles
                });
                break;
            case 'remove_entity_effect':
                this.proxy.pluginAPI.emit('entity.effectRemove', {
                    entityId: data.entityId,
                    effectId: data.effectId
                });
                break;
            case 'update_attributes':
                this.proxy.pluginAPI.emit('entity.attributes', {
                    entityId: data.entityId,
                    properties: data.properties
                });
                break;
            case 'map_chunk':
                this.proxy.pluginAPI.emit('world.chunkLoad', {
                    x: data.x,
                    z: data.z,
                    groundUp: data.groundUp,
                    bitMap: data.bitMap,
                    chunkData: data.chunkData
                });
                break;
            case 'block_action':
                this.proxy.pluginAPI.emit('world.blockAction', {
                    location: data.location,
                    byte1: data.byte1,
                    byte2: data.byte2,
                    blockType: data.blockType
                });
                break;
            case 'block_break_animation':
                this.proxy.pluginAPI.emit('world.blockBreakAnimation', {
                    entityId: data.entityId,
                    location: data.location,
                    destroyStage: data.destroyStage
                });
                break;
            case 'map_chunk_bulk':
                this.proxy.pluginAPI.emit('world.chunksBulk', {
                    skyLightSent: data.skyLightSent,
                    chunks: data.chunks
                });
                break;
            case 'spawn_entity_weather':
                this.proxy.pluginAPI.emit('entity.spawn.weather', {
                    entityId: data.entityId,
                    type: data.type,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 }
                });
                break;
            case 'craft_progress_bar':
                this.proxy.pluginAPI.emit('inventory.craftProgress', {
                    windowId: data.windowId,
                    property: data.property,
                    value: data.value
                });
                break;
            case 'transaction':
                this.proxy.pluginAPI.emit('inventory.transaction', {
                    windowId: data.windowId,
                    action: data.action,
                    accepted: data.accepted
                });
                break;
            case 'update_sign':
                this.proxy.pluginAPI.emit('world.signUpdate', {
                    location: data.location,
                    text1: data.text1,
                    text2: data.text2,
                    text3: data.text3,
                    text4: data.text4
                });
                break;
            case 'map':
                this.proxy.pluginAPI.emit('world.map', {
                    itemDamage: data.itemDamage,
                    data: data.data
                });
                break;
            case 'tile_entity_data':
                this.proxy.pluginAPI.emit('world.tileEntity', {
                    location: data.location,
                    action: data.action,
                    nbtData: data.nbtData
                });
                break;
            case 'sign_editor_open':
                this.proxy.pluginAPI.emit('world.signEditor', {
                    location: data.location
                });
                break;
            case 'statistics':
                this.proxy.pluginAPI.emit('player.statistics', {
                    player: this._createCurrentPlayerObject(),
                    entries: data.entries
                });
                break;
            case 'tab_complete':
                this.proxy.pluginAPI.emit('server.tabComplete', {
                    matches: data.matches
                });
                break;
            case 'custom_payload':
                this.proxy.pluginAPI.emit('server.customPayload', {
                    channel: data.channel,
                    data: data.data
                });
                break;
        }

        const entityPlayer = this.gameState.getPlayerByEntityId(data.entityId);
        if (entityPlayer && entityPlayer.name && entityPlayer.uuid) {
            const entity = this.gameState.entities.get(data.entityId);
            if (!entity) return;
            
            switch(meta.name) {
                case 'rel_entity_move':
                case 'entity_look':
                case 'entity_look_and_move':
                case 'entity_teleport':
                    if (entity.position) {
                        const rotation = (meta.name === 'entity_look' || meta.name === 'entity_look_and_move' || meta.name === 'entity_teleport') 
                            ? { yaw: entity.yaw || 0, pitch: entity.pitch || 0 }
                            : undefined;
                        
                        this.proxy.pluginAPI.emit('player.move', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            position: { ...entity.position },
                            onGround: entity.onGround !== undefined ? entity.onGround : true,
                            rotation: rotation
                        });
                    }
                    break;
                case 'animation':
                    if (data.animation === 0) {
                        this.proxy.pluginAPI.emit('player.action', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            type: 'swing'
                        });
                    }
                    break;
                case 'entity_metadata':
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        type: 'crouch',
                        value: entity.isCrouching || false
                    });
                    this.proxy.pluginAPI.emit('player.action', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        type: 'sprint',
                        value: entity.isSprinting || false
                    });
                    if (entity.isUsingItem !== undefined) {
                        this.proxy.pluginAPI.emit('player.action', { 
                            player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                            type: 'useItem',
                            value: entity.isUsingItem
                        });
                    }
                    break;
                case 'entity_equipment':
                    this.proxy.pluginAPI.emit('player.equipment', { 
                        player: this._createEntityPlayerObject(entityPlayer, data.entityId),
                        item: data.item,
                        slot: data.slot
                    });
                    break;
            }
        }
    }
    
    _handleWorldChange(reason) {
        this.proxy.pluginAPI._handleWorldChange(reason);
    }
}

module.exports = { PlayerSession }; 