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
        
        if (!this.proxy.pluginAPI.events.hasPacketInterceptors('client', meta.name)) {
            if (meta.name === 'chat' && data.message.startsWith('/')) {
                if (!this.proxy.commandHandler.handleCommand(data.message, this.client)) {
                    this.targetClient.write(meta.name, data);
                }
                return;
            }
            
            this.gameState.updateFromPacket(meta, data, false);
            
            if (this.targetClient?.state === mc.states.PLAY) {
                this.targetClient.write(meta.name, data);
            }
            
            setImmediate(() => {
                this._handleClientPacketEvents(data, meta);
            });
            
            return;
        }
        
        this.gameState.updateFromPacket(meta, data, false);

        if (meta.name === 'chat' && data.message.startsWith('/')) {
            this.proxy.commandHandler.handleCommand(data.message, this.client);
            return;
        }
        
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
            return;
        }
        
        switch (meta.name) {
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
            case 'block_place':
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
                break;
        }

        if (this.targetClient?.state === mc.states.PLAY) {
            this.targetClient.write(meta.name, event.modified ? event.modifiedData : data);
        }
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
            case 'block_place':
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
                break;
        }
    }
    
    _handleServerPacketEvents(data, meta) {
        if (!this.connected || this.proxy.currentPlayer !== this) return;
        
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

        if (this.client.state === mc.states.PLAY) {
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
            }
        }
    }
    
    _handleWorldChange(reason) {
        this.proxy.pluginAPI._handleWorldChange(reason);
    }
}

module.exports = { PlayerSession }; 