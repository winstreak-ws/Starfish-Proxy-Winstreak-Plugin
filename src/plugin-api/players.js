class Players {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    getPlayers() {
        if (!this.proxy.currentPlayer?.gameState) return [];
        
        const gameState = this.proxy.currentPlayer.gameState;
        const players = [];
        
        // add the current player
        if (gameState.loginPacket) {
            players.push({
                uuid: this.proxy.currentPlayer.uuid,
                name: this.proxy.currentPlayer.username,
                displayName: this.proxy.currentPlayer.username,
                position: { ...gameState.position },
                rotation: {
                    yaw: gameState.position.yaw,
                    pitch: gameState.position.pitch
                },
                health: gameState.health,
                entityId: gameState.loginPacket.entityId,
                isCurrentPlayer: true,
                isCrouching: false,
                isSprinting: false,
                isUsingItem: false,
                isOnFire: false,
                heldItem: gameState.inventory?.slots?.[gameState.inventory.heldItemSlot + 36] || null,
                equipment: {},
                effects: new Map(),
                withinRenderDistance: true
            });
        }
        
        const entitiesWithinRender = new Set();
        
        // add players within render distance
        for (const [entityId, entity] of gameState.entities) {
            if (entity.type === 'player' && entity.uuid) {
                const playerInfo = gameState.playerInfo.get(entity.uuid);
                if (playerInfo) {
                    entitiesWithinRender.add(entity.uuid);
                    players.push({
                        uuid: entity.uuid,
                        name: playerInfo.name,
                        displayName: gameState.getFormattedName(entity.uuid) || playerInfo.name,
                        position: { ...entity.position },
                        rotation: {
                            yaw: entity.yaw || 0,
                            pitch: entity.pitch || 0
                        },
                        health: entity.health || 20,
                        entityId: entityId,
                        isCurrentPlayer: false,
                        isCrouching: entity.isCrouching || false,
                        isSprinting: entity.isSprinting || false,
                        isUsingItem: entity.isUsingItem || false,
                        isOnFire: entity.isOnFire || false,
                        heldItem: entity.heldItem,
                        equipment: entity.equipment || {},
                        effects: entity.effects || new Map(),
                        withinRenderDistance: true
                    });
                }
            }
        }
        
        // add players from tab list that are not within render distance
        for (const [uuid, playerInfo] of gameState.playerInfo) {
            if (entitiesWithinRender.has(uuid) || uuid === this.proxy.currentPlayer?.uuid) {
                continue;
            }
            
            players.push({
                uuid: uuid,
                name: playerInfo.name,
                displayName: gameState.getFormattedName(uuid) || playerInfo.name,
                position: null,
                rotation: null,
                health: null,
                entityId: null,
                isCurrentPlayer: false,
                isCrouching: false,
                isSprinting: false,
                isUsingItem: false,
                isOnFire: false,
                heldItem: null,
                equipment: {},
                effects: new Map(),
                withinRenderDistance: false
            });
        }
        
        return players;
    }
    
    getPlayer(uuid) {
        return this.getPlayers().find(p => p.uuid === uuid);
    }
    
    getPlayerByName(name) {
        return this.getPlayers().find(p => p.name === name);
    }
    
    calculateDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    getPlayersWithinDistance(position, distance) {
        return this.getPlayers().filter(player => 
            this.calculateDistance(player.position, position) <= distance
        );
    }
    
    getPlayersInTeam(teamName) {
        if (!this.proxy.currentPlayer?.gameState) return [];
        
        const team = this.proxy.currentPlayer.gameState.teams.get(teamName);
        if (!team) return [];
        
        return this.getPlayers().filter(player => 
            team.players.has(player.name)
        );
    }
    
    getPlayerInfo(uuid) {
        if (!this.proxy.currentPlayer?.gameState) return null;
        
        return this.proxy.currentPlayer.gameState.playerInfo.get(uuid) || null;
    }
}

module.exports = Players; 