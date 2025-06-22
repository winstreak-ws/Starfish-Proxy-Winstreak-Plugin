const mc = require('minecraft-protocol');
const { exec } = require('child_process');
const path = require('path');

function stripColorCodes(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/§./g, '');
}

class GameState {
    constructor() {
        this.reset();
    }

    byteToYaw(byte) {
        return (byte / 256) * 360;
    }
    
    byteToPitch(byte) {
        const signed = byte > 127 ? byte - 256 : byte;
        return signed * (90 / 128);
    }

    reset() {
        this.loginPacket = null;
        this.playerInfo = new Map();
        this.teams = new Map();
        this.entities = new Map();
        this.entityIdToUuid = new Map();
        this.scoreboards = new Map();
        this.inventory = {
            slots: new Array(46).fill(null),
            heldItemSlot: 0
        };
        this.position = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        this.gameMode = 0;
        this.health = 20;
        this.food = 20;
        this.saturation = 5;
        this.experience = { level: 0, progress: 0, total: 0 };
    }

    updateFromPacket(meta, data, fromServer) {
        if (!fromServer) {
            switch (meta.name) {
                case 'held_item_slot':
                    this.inventory.heldItemSlot = data.slotId;
                    break;
                case 'position':
                case 'position_look':
                    this.position.x = data.x;
                    this.position.y = data.y;
                    this.position.z = data.z;
                    if (data.yaw !== undefined) this.position.yaw = data.yaw;
                    if (data.pitch !== undefined) this.position.pitch = data.pitch;
                    break;
            }
            return;
        }
        
        switch (meta.name) {
            case 'login':
                this.loginPacket = data;
                this.gameMode = data.gameMode;
                break;
                
            case 'respawn': {
                const loginData = this.loginPacket;
                this.reset();
                this.loginPacket = loginData;
                this.gameMode = data.gameMode;
                break;
            }
                
            case 'player_info':
                this.updatePlayerInfo(data);
                break;
                
            case 'scoreboard_team':
                this.updateTeam(data);
                break;
                
            case 'scoreboard_objective':
                this.updateScoreboard(data);
                break;
                
            case 'scoreboard_score':
                this.updateScore(data);
                break;
                
            case 'named_entity_spawn':
                this.entities.set(data.entityId, {
                    type: 'player',
                    uuid: data.playerUUID,
                    name: null,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    yaw: this.byteToYaw(data.yaw),
                    pitch: this.byteToPitch(data.pitch),
                    onGround: true,
                    isCrouching: false,
                    isSprinting: false,
                    isUsingItem: false,
                    heldItem: null,
                    equipment: {}
                });
                this.entityIdToUuid.set(data.entityId, data.playerUUID);
                break;
                
            case 'spawn_entity':
            case 'spawn_entity_living':
                this.entities.set(data.entityId, {
                    type: data.type,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    metadata: data.metadata
                });
                break;
                
            case 'entity_destroy':
                if (Array.isArray(data.entityIds)) {
                    data.entityIds.forEach(id => {
                        this.entities.delete(id);
                        this.entityIdToUuid.delete(id);
                    });
                }
                break;
                
            case 'rel_entity_move':
            case 'entity_look':
            case 'entity_look_and_move':
            case 'entity_teleport':
                if (this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    if (meta.name === 'entity_teleport') {
                        entity.position = { x: data.x / 32, y: data.y / 32, z: data.z / 32 };
                        entity.yaw = this.byteToYaw(data.yaw);
                        entity.pitch = this.byteToPitch(data.pitch);
                    } else if (meta.name === 'rel_entity_move' || meta.name === 'entity_look_and_move') {
                        entity.position.x += data.dX / 32;
                        entity.position.y += data.dY / 32;
                        entity.position.z += data.dZ / 32;
                    }
                    if (meta.name === 'entity_look' || meta.name === 'entity_look_and_move') {
                        entity.yaw = this.byteToYaw(data.yaw);
                        entity.pitch = this.byteToPitch(data.pitch);
                    }
                    entity.onGround = data.onGround;
                }
                break;
                
            case 'entity_metadata':
                if (this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    entity.metadata = data.metadata;
                    
                    const flags = data.metadata?.find(m => m.key === 0)?.value || 0;
                    entity.isCrouching = (flags & 0x02) !== 0;
                    entity.isSprinting = (flags & 0x08) !== 0;
                    entity.isUsingItem = (flags & 0x10) !== 0;
                }
                break;
                
            case 'entity_equipment':
                if (this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    if (!entity.equipment) entity.equipment = {};
                    entity.equipment[data.slot] = data.item;
                    if (data.slot === 0) {
                        entity.heldItem = data.item;
                    }
                }
                break;
                
            case 'set_slot':
                if (data.windowId === 0 && data.slot >= 0 && data.slot < 46) {
                    this.inventory.slots[data.slot] = data.item;
                }
                break;
                
            case 'window_items':
                if (data.windowId === 0) {
                    this.inventory.slots = data.items.slice(0, 46);
                }
                break;
                
            case 'update_health':
                this.health = data.health;
                this.food = data.food;
                this.saturation = data.foodSaturation;
                break;
                
            case 'experience':
                this.experience = {
                    progress: data.experienceBar,
                    level: data.level,
                    total: data.totalExperience
                };
                break;
                
            case 'game_state_change':
                if (data.reason === 3) {
                    this.gameMode = data.gameMode;
                }
                break;
        }
    }

    updatePlayerInfo(data) {
        if (!data.data || !Array.isArray(data.data)) return;
        
        for (const player of data.data) {
            switch (data.action) {
                case 0:
                    this.playerInfo.set(player.UUID, {
                        name: stripColorCodes(player.name),
                        properties: player.properties || [],
                        gamemode: player.gamemode,
                        ping: player.ping,
                        displayName: player.displayName
                    });
                    break;
                case 1:
                    const existing = this.playerInfo.get(player.UUID);
                    if (existing) existing.gamemode = player.gamemode;
                    break;
                case 2:
                    const info = this.playerInfo.get(player.UUID);
                    if (info) info.ping = player.ping;
                    break;
                case 3:
                    const p = this.playerInfo.get(player.UUID);
                    if (p) p.displayName = player.displayName;
                    break;
                case 4:
                    this.playerInfo.delete(player.UUID);
                    break;
            }
        }
    }

    updateTeam(data) {
        const { team, mode } = data;
        
        switch (mode) {
            case 0:
            case 2:
                this.teams.set(team, {
                    displayName: data.name || team,
                    prefix: data.prefix || '',
                    suffix: data.suffix || '',
                    color: data.color || -1,
                    players: new Set((data.players || []).map(p => stripColorCodes(p)))
                });
                break;
            case 1:
                this.teams.delete(team);
                break;
            case 3:
                const t = this.teams.get(team);
                if (t && data.players) {
                    data.players.forEach(p => t.players.add(stripColorCodes(p)));
                }
                break;
            case 4:
                const tm = this.teams.get(team);
                if (tm && data.players) {
                    data.players.forEach(p => tm.players.delete(stripColorCodes(p)));
                }
                break;
        }
    }

    updateScoreboard(data) {
        const { name, action } = data;
        
        switch (action) {
            case 0:
            case 2:
                this.scoreboards.set(name, {
                    displayName: data.displayText,
                    type: data.type || 'integer',
                    scores: new Map()
                });
                break;
            case 1:
                this.scoreboards.delete(name);
                break;
        }
    }

    updateScore(data) {
        const { scoreName, action, objective, value } = data;
        
        if (action === 1) {
            this.scoreboards.forEach(scoreboard => {
                scoreboard.scores.delete(scoreName);
            });
        } else {
            const scoreboard = this.scoreboards.get(objective);
            if (scoreboard) {
                scoreboard.scores.set(scoreName, value);
            }
        }
    }

    getPlayerByName(name) {
        for (const [uuid, info] of this.playerInfo) {
            if (info.name === name) {
                return { uuid, ...info };
            }
        }
        return null;
    }

    getPlayerTeam(playerName) {
        for (const [teamName, team] of this.teams) {
            if (team.players.has(playerName)) {
                return { name: teamName, ...team };
            }
        }
        return null;
    }

    getFormattedName(uuid) {
        const info = this.playerInfo.get(uuid);
        if (!info) return null;

        let name = info.name;
        if (info.displayName) {
            try {
                const parsed = JSON.parse(info.displayName);
                name = this.extractText(parsed);
            } catch (e) {
                name = info.displayName;
            }
        }

        const team = this.getPlayerTeam(info.name);
        if (team) {
            return `${team.prefix}${name}${team.suffix}`;
        }

        return name;
    }

    extractText(component) {
        if (typeof component === 'string') return component;
        if (!component) return '';
        
        let text = component.text || '';
        if (component.extra && Array.isArray(component.extra)) {
            for (const extra of component.extra) {
                text += this.extractText(extra);
            }
        }
        return text;
    }

    getPlayerByEntityId(entityId) {
        const uuid = this.entityIdToUuid.get(entityId);
        if (!uuid) return null;
        
        const info = this.playerInfo.get(uuid);
        if (!info) return null;

        return {
            uuid,
            name: info.name,
            entityId,
            ...info
        };
    }
}

class PlayerSession {
    constructor(proxy, client) {
        this.proxy = proxy;
        this.client = client;
        this.targetClient = null;
        this.username = client.username;
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
        
        this.client.write('login', packet);
        this.proxy.pluginAPI.emit('playerJoin', { player: this });
        
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
            if (this.handleClientPacket(data, meta)) return;

            if (this.targetClient?.state === mc.states.PLAY) {
                this.targetClient.write(meta.name, data);
            }
        });

        this.targetClient.on('packet', (data, meta) => {
            this.handleServerPacket(data, meta);
        });

        this.tickInterval = setInterval(() => {
            this.proxy.pluginAPI.emit('tick');
        }, 50);
    }
    
    handleClientPacket(data, meta) {
        this.gameState.updateFromPacket(meta, data, false);

        if (meta.name === 'chat' && data.message.startsWith('/')) {
            return this.proxy.commandHandler.handleCommand(data.message, this.client);
        }
        
        switch (meta.name) {
            case 'position':
                this.proxy.pluginAPI.emit('playerMove', {
                    player: this,
                    position: { x: data.x, y: data.y, z: data.z },
                    onGround: data.onGround,
                    rotation: undefined
                });
                break;
            case 'position_look':
                this.proxy.pluginAPI.emit('playerMove', {
                    player: this,
                    position: { x: data.x, y: data.y, z: data.z },
                    onGround: data.onGround,
                    rotation: { yaw: data.yaw, pitch: data.pitch }
                });
                break;
            case 'look':
                this.proxy.pluginAPI.emit('playerMove', {
                    player: this,
                    position: { ...this.gameState.position },
                    onGround: data.onGround,
                    rotation: { yaw: data.yaw, pitch: data.pitch }
                });
                break;
            case 'arm_animation':
                this.proxy.pluginAPI.emit('playerSwing', { player: this });
                break;
            case 'entity_action':
                if (data.actionId === 0) this.proxy.pluginAPI.emit('playerCrouch', { player: this, crouching: true });
                else if (data.actionId === 1) this.proxy.pluginAPI.emit('playerCrouch', { player: this, crouching: false });
                else if (data.actionId === 3) this.proxy.pluginAPI.emit('playerSprint', { player: this, sprinting: true });
                else if (data.actionId === 4) this.proxy.pluginAPI.emit('playerSprint', { player: this, sprinting: false });
                break;
            case 'block_place':
                this.proxy.pluginAPI.emit('playerUseItem', { player: this, using: true });
                setTimeout(() => this.proxy.pluginAPI.emit('playerUseItem', { player: this, using: false }), 500);
                break;
            case 'held_item_slot':
                this.proxy.pluginAPI.emit('playerHeldItemChange', { player: this, slot: data.slotId });
                break;
        }

        return false;
    }

    handleServerPacket(data, meta) {
        if (meta.name === 'player_info' && data.action === 4) {
            data.data.forEach(p => {
                const playerInfo = this.gameState.playerInfo.get(p.UUID);
                if (playerInfo) {
                    this.proxy.pluginAPI.emit('playerDespawn', {
                        uuid: p.UUID,
                        name: playerInfo.name
                    });
                }
            });
        }
        this.gameState.updateFromPacket(meta, data, true);

        const event = {
            player: this,
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
        if (entityPlayer) {
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
                        
                        this.proxy.pluginAPI.emit('playerMove', { 
                            player: { 
                                username: entityPlayer.name, 
                                uuid: entityPlayer.uuid, 
                                entityId: data.entityId,
                                displayName: entityPlayer.name 
                            },
                            position: { ...entity.position },
                            onGround: entity.onGround !== undefined ? entity.onGround : true,
                            rotation: rotation
                        });
                    }
                    break;
                case 'animation':
                    if (data.animation === 0) {
                        this.proxy.pluginAPI.emit('playerSwing', { 
                            player: { 
                                username: entityPlayer.name, 
                                uuid: entityPlayer.uuid, 
                                entityId: data.entityId,
                                displayName: entityPlayer.name
                            }
                        });
                    }
                    break;
                case 'entity_metadata':
                    this.proxy.pluginAPI.emit('playerCrouch', { 
                        player: { 
                            username: entityPlayer.name, 
                            uuid: entityPlayer.uuid, 
                            entityId: data.entityId,
                            displayName: entityPlayer.name
                        },
                        crouching: entity.isCrouching || false
                    });
                    this.proxy.pluginAPI.emit('playerSprint', { 
                        player: { 
                            username: entityPlayer.name, 
                            uuid: entityPlayer.uuid, 
                            entityId: data.entityId,
                            displayName: entityPlayer.name
                        },
                        sprinting: entity.isSprinting || false
                    });
                    if (entity.isUsingItem !== undefined) {
                        this.proxy.pluginAPI.emit('playerUseItem', { 
                            player: { 
                                username: entityPlayer.name, 
                                uuid: entityPlayer.uuid, 
                                entityId: data.entityId,
                                displayName: entityPlayer.name
                            },
                            using: entity.isUsingItem
                        });
                    }
                    break;
                case 'entity_equipment':
                    this.proxy.pluginAPI.emit('playerHeldItemChange', { 
                        player: { 
                            username: entityPlayer.name, 
                            uuid: entityPlayer.uuid, 
                            entityId: data.entityId,
                            displayName: entityPlayer.name
                        },
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
                            this.proxy.pluginAPI.emit('playerSpawn', {
                                ...event,
                                uuid: p.UUID,
                                name: playerInfo.name,
                                ...playerInfo
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
                this.proxy.pluginAPI.emit('playerRespawn', { player: this });
                break;
        }

        if (!event.cancelled && this.client.state === mc.states.PLAY) {
            this.client.write(meta.name, event.modified ? event.modifiedData : event.data);

            if (meta.name === 'player_info' && (data.action === 0 || data.action === 3)) {
                setTimeout(() => {
                    data.data.forEach(p => {
                        const uuid = p.UUID || p.uuid;
                        const customName = this.proxy.pluginAPI.customDisplayNames.get(uuid);
                        if (customName) {
                            this.client.write('player_info', {
                                action: 3,
                                data: [{ UUID: uuid, displayName: customName }]
                            });
                        }
                    });
                }, 50);
            } else if (meta.name === 'scoreboard_team' && (data.mode === 0 || data.mode === 2 || data.mode === 3 || data.mode === 4)) {
                 setTimeout(() => {
                    const playersToCheck = new Set();
                    if (data.players && Array.isArray(data.players)) {
                        data.players.forEach(playerName => playersToCheck.add(playerName));
                    }
                    if (data.mode === 2 && data.name) {
                        const team = this.gameState.teams.get(data.name);
                        if (team && team.players) {
                            team.players.forEach(playerName => playersToCheck.add(playerName));
                        }
                    }
                    
                    playersToCheck.forEach(playerName => {
                        for (const [uuid, info] of this.gameState.playerInfo) {
                            if (info.name === playerName) {
                                const customName = this.proxy.pluginAPI.customDisplayNames.get(uuid);
                                if (customName) {
                                    this.client.write('player_info', {
                                        action: 3,
                                        data: [{ UUID: uuid, displayName: customName }]
                                    });
                                }
                                break;
                            }
                        }
                    });
                }, 50);
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
        if (this.client.state === mc.states.PLAY) {
            this.client.end(reason);
        }
        if (this.targetClient && this.targetClient.state !== mc.states.DISCONNECTED) {
            this.targetClient.end();
        }
        this.cleanup();
    }

    cleanup() {
        if (this.tickInterval) clearInterval(this.tickInterval);
        this.proxy.pluginAPI.emit('playerLeave', { player: this });
        this.proxy.clearSession();
    }
}

module.exports = { PlayerSession }; 