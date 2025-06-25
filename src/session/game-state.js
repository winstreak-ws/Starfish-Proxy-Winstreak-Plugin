
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
        this.uuidToEntityId = new Map();
        this.scoreboards = new Map();
        this.position = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        this.lastPosition = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        this.health = 20;
        this.inventory = { slots: new Array(46).fill(null), heldItemSlot: 0 };
    }

    updateFromPacket(meta, data, fromServer) {
        if (!fromServer) {
            switch (meta.name) {
                case 'held_item_slot':
                    this.inventory.heldItemSlot = data.slotId;
                    break;
                case 'position':
                case 'position_look':
                    this.lastPosition = { ...this.position };
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
                const newEntity = {
                    type: 'player',
                    uuid: data.playerUUID,
                    name: null,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    lastPosition: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    yaw: this.byteToYaw(data.yaw),
                    pitch: this.byteToPitch(data.pitch),
                    onGround: true,
                    isCrouching: false,
                    isSprinting: false,
                    isUsingItem: false,
                    isOnFire: false,
                    heldItem: null,
                    equipment: {},
                    metadata: data.metadata || [],
                    effects: new Map(),
                    lastDamaged: 0,
                    health: 20
                };

                const initialFlags = newEntity.metadata.find(m => m.key === 0)?.value || 0;
                newEntity.isOnFire = (initialFlags & 0x01) !== 0;
                newEntity.isCrouching = (initialFlags & 0x02) !== 0;
                newEntity.isSprinting = (initialFlags & 0x08) !== 0;
                newEntity.isUsingItem = (initialFlags & 0x10) !== 0;
                
                const healthMeta = newEntity.metadata.find(m => m.key === 6);
                if (healthMeta) newEntity.health = healthMeta.value;

                this.uuidToEntityId.set(data.playerUUID, data.entityId);
                this.entities.set(data.entityId, newEntity);
                this.entityIdToUuid.set(data.entityId, data.playerUUID);
                break;
                
            case 'spawn_entity':
            case 'spawn_entity_living':
                this.entities.set(data.entityId, {
                    type: data.type,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    metadata: data.metadata,
                    effects: new Map(),
                });
                break;
                
            case 'entity_destroy':
                if (Array.isArray(data.entityIds)) {
                    data.entityIds.forEach(id => {
                        const uuid = this.entityIdToUuid.get(id);
                        if (uuid) {
                            this.uuidToEntityId.delete(uuid);
                        }
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
                    entity.lastPosition = { ...entity.position };
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
                    if (!entity.metadata) entity.metadata = [];
                    
                    data.metadata.forEach(newMeta => {
                        const index = entity.metadata.findIndex(m => m.key === newMeta.key);
                        if (index !== -1) {
                            entity.metadata[index] = newMeta;
                        } else {
                            entity.metadata.push(newMeta);
                        }
                        if (newMeta.key === 6) {
                            entity.health = newMeta.value;
                        }
                    });
                    
                    const flags = entity.metadata.find(m => m.key === 0)?.value || 0;
                    entity.isOnFire = (flags & 0x01) !== 0;
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
                
            case 'entity_effect':
                if (this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    if (!entity.effects) entity.effects = new Map();
                    entity.effects.set(data.effectId, {
                        amplifier: data.amplifier,
                        duration: data.duration,
                        hideParticles: data.hideParticles
                    });
                }
                break;

            case 'remove_entity_effect':
                if (this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    if (!entity.effects) entity.effects = new Map();
                    entity.effects.delete(data.effectId);
                }
                break;
            
            case 'entity_status':
                if (data.entityStatus === 2 && this.entities.has(data.entityId)) {
                    const entity = this.entities.get(data.entityId);
                    entity.lastDamaged = Date.now();
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
                this.teams.set(team, {
                    displayName: data.name || team,
                    prefix: data.prefix || '',
                    suffix: data.suffix || '',
                    color: data.color || -1,
                    players: new Set((data.players || []).map(p => stripColorCodes(p)))
                });
                break;
            case 2:
                const existingTeam = this.teams.get(team);
                if (existingTeam) {
                    const updatedTeam = {
                        displayName: data.name !== undefined ? data.name : existingTeam.displayName,
                        prefix: data.prefix !== undefined ? data.prefix : existingTeam.prefix,
                        suffix: data.suffix !== undefined ? data.suffix : existingTeam.suffix,
                        color: data.color !== undefined ? data.color : existingTeam.color,
                        players: data.players ? new Set(data.players.map(p => stripColorCodes(p))) : existingTeam.players
                    };
                    this.teams.set(team, updatedTeam);
                } else {
                    this.teams.set(team, {
                        displayName: data.name || team,
                        prefix: data.prefix || '',
                        suffix: data.suffix || '',
                        color: data.color || -1,
                        players: new Set((data.players || []).map(p => stripColorCodes(p)))
                    });
                }
                break;
            case 1:
                this.teams.delete(team);
                break;
            case 3:
                let t = this.teams.get(team);
                if (!t) {
                    t = {
                        displayName: team,
                        prefix: '',
                        suffix: '',
                        color: -1,
                        players: new Set()
                    };
                    this.teams.set(team, t);
                }
                if (data.players) {
                    data.players.forEach(p => t.players.add(stripColorCodes(p)));
                }
                break;
            case 4:
                let tm = this.teams.get(team);
                if (!tm) {
                    tm = {
                        displayName: team,
                        prefix: '',
                        suffix: '',
                        color: -1,
                        players: new Set()
                    };
                    this.teams.set(team, tm);
                }
                if (data.players) {
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

module.exports = GameState; 