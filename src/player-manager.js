const { EventEmitter } = require('events');
const Player = require('./player');

class PlayerManager extends EventEmitter {
    constructor() {
        super();
        this.players = new Map(); // UUID -> Player
        this.entityIdToUuid = new Map(); // Entity ID -> UUID
    }

    // update player state from GameState data
    updateFromGameState(gameState) {
        // sync player info
        for (const [uuid, info] of gameState.playerInfo) {
            if (!this.players.has(uuid)) {
                const entityId = gameState.uuidToEntityId.get(uuid);
                const entity = entityId ? gameState.entities.get(entityId) : null;
                
                const playerData = {
                    uuid,
                    name: info.name,
                    displayName: info.displayName || info.name,
                    entityId: entityId || null,
                    position: entity?.position || { x: 0, y: 0, z: 0 },
                    lastPosition: entity?.lastPosition || { x: 0, y: 0, z: 0 },
                    rotation: { yaw: entity?.yaw || 0, pitch: entity?.pitch || 0 },
                    onGround: entity?.onGround !== undefined ? entity.onGround : true,
                    isCrouching: entity?.isCrouching || false,
                    isSprinting: entity?.isSprinting || false,
                    isUsingItem: entity?.isUsingItem || false,
                    isBlocking: entity?.isUsingItem || false,
                    health: entity?.health || 20,
                    team: gameState.getPlayerTeam(info.name),
                    equipment: entity?.equipment || {},
                    heldItem: entity?.heldItem || null,
                    effects: entity?.effects || new Map(),
                    ticksExisted: 0,
                    lastSeen: Date.now(),
                    lastMoved: Date.now(),
                    ping: info.ping || 0
                };
                
                const player = new Player(playerData);
                this.players.set(uuid, player);
                this.emit('player.join', player);
                
                if (entityId) {
                    this.entityIdToUuid.set(entityId, uuid);
                }
            }
        }
        
        // remove players no longer in playerInfo
        for (const [uuid, player] of this.players) {
            if (!gameState.playerInfo.has(uuid)) {
                this.players.delete(uuid);
                if (player.entityId) {
                    this.entityIdToUuid.delete(player.entityId);
                }
                this.emit('player.leave', player);
            }
        }
        
        // update existing players with entity data
        for (const [uuid, player] of this.players) {
            const entityId = gameState.uuidToEntityId.get(uuid);
            if (!entityId) continue;
            
            const entity = gameState.entities.get(entityId);
            if (!entity) continue;
            
            const info = gameState.playerInfo.get(uuid);
            const team = gameState.getPlayerTeam(player.name);
            
            const updatedData = {
                ...player._data,
                position: entity.position,
                lastPosition: entity.lastPosition,
                rotation: { yaw: entity.yaw || 0, pitch: entity.pitch || 0 },
                onGround: entity.onGround !== undefined ? entity.onGround : true,
                isCrouching: entity.isCrouching || false,
                isSprinting: entity.isSprinting || false,
                isUsingItem: entity.isUsingItem || false,
                isBlocking: entity.isUsingItem || false,
                health: entity.health || 20,
                team: team,
                equipment: entity.equipment || {},
                heldItem: entity.heldItem || null,
                effects: entity.effects || new Map(),
                ticksExisted: player.ticksExisted + 1,
                lastSeen: Date.now(),
                ping: info?.ping || player.ping
            };
            
            // check if player moved
            if (entity.position.x !== player.position.x ||
                entity.position.y !== player.position.y ||
                entity.position.z !== player.position.z) {
                updatedData.lastMoved = Date.now();
            }
            
            const updatedPlayer = new Player(updatedData);
            this.players.set(uuid, updatedPlayer);
        }
    }

    // notify of specific player updates from packet handlers
    notifyPlayerUpdate(uuid, changeType, data) {
        const player = this.players.get(uuid);
        if (!player) return;
        
        const updatedData = { ...player._data };
        
        switch (changeType) {
            case 'movement':
                updatedData.lastPosition = player.position;
                updatedData.position = data.position;
                updatedData.rotation = data.rotation || player.rotation;
                updatedData.onGround = data.onGround !== undefined ? data.onGround : player.onGround;
                updatedData.lastMoved = Date.now();
                
                const updatedPlayer = new Player(updatedData);
                this.players.set(uuid, updatedPlayer);
                this.emit('player.move', updatedPlayer);
                break;
                
            case 'action':
                if (data.type === 'crouch') {
                    updatedData.isCrouching = data.value;
                } else if (data.type === 'sprint') {
                    updatedData.isSprinting = data.value;
                } else if (data.type === 'useItem') {
                    updatedData.isUsingItem = data.value;
                    updatedData.isBlocking = data.value;
                } else if (data.type === 'swing') {
                    // swing doesn't change state, just emit event
                    this.emit('player.action', player, { type: 'swing' });
                    return;
                }
                
                const actionPlayer = new Player(updatedData);
                this.players.set(uuid, actionPlayer);
                this.emit('player.action', actionPlayer, data);
                break;
                
            case 'equipment':
                updatedData.equipment = { ...player.equipment, ...data.equipment };
                if (data.heldItem !== undefined) {
                    updatedData.heldItem = data.heldItem;
                }
                
                const equipPlayer = new Player(updatedData);
                this.players.set(uuid, equipPlayer);
                this.emit('player.equipment', equipPlayer);
                break;
                
            case 'health':
                updatedData.health = data.health;
                const healthPlayer = new Player(updatedData);
                this.players.set(uuid, healthPlayer);
                break;
                
            case 'effects':
                updatedData.effects = new Map(data.effects);
                const effectPlayer = new Player(updatedData);
                this.players.set(uuid, effectPlayer);
                break;
        }
    }

    // get player by UUID
    getPlayer(uuid) {
        return this.players.get(uuid);
    }

    // get player by entity ID
    getPlayerByEntityId(entityId) {
        const uuid = this.entityIdToUuid.get(entityId);
        return uuid ? this.players.get(uuid) : null;
    }

    // get player by name
    getPlayerByName(name) {
        for (const player of this.players.values()) {
            if (player.name === name) {
                return player;
            }
        }
        return null;
    }

    // get all players
    getAllPlayers() {
        return Array.from(this.players.values());
    }

    // utility: get players within distance
    getPlayersWithinDistance(position, distance) {
        const players = [];
        for (const player of this.players.values()) {
            const dx = player.position.x - position.x;
            const dy = player.position.y - position.y;
            const dz = player.position.z - position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= distance) {
                players.push(player);
            }
        }
        return players;
    }

    // utility: get players in team
    getPlayersInTeam(teamName) {
        const players = [];
        for (const player of this.players.values()) {
            if (player.team && player.team.name === teamName) {
                players.push(player);
            }
        }
        return players;
    }

    // safety validation for movement packets
    validateMovementPacket(meta, data) {
        // prevent any modification of movement-related packets
        const dangerousPackets = [
            'position', 'position_look', 'look', 'flying',
            'entity_velocity', 'entity_teleport', 'rel_entity_move'
        ];
        
        if (dangerousPackets.includes(meta.name)) {
            throw new Error(`Cannot modify movement packet: ${meta.name}`);
        }
        
        return true;
    }

    // tick update
    tick() {
        for (const [uuid, player] of this.players) {
            const updatedData = {
                ...player._data,
                ticksExisted: player.ticksExisted + 1
            };
            this.players.set(uuid, new Player(updatedData));
        }
    }
}

module.exports = PlayerManager; 