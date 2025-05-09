class Player {
    constructor(username, uuid, entityId) {
        this.username = username; // Player's username
        this.uuid = uuid;         // Player's UUID
        this.entityId = entityId; // Player's entity ID
        this.AutoBlockA_VL = 0;
        this.AutoBlockA_LastAlert = 0;
        this.swingProgress = 0;
        this.isUsingItem = false;
        this.ticksExisted = 0;
        this.lastUsingTick = 0;
    }

    toString() {
        return `${this.username} (${this.uuid}) [Entity ID: ${this.entityId}]`;
    }
}

module.exports = (proxyAPI) => {
    const players = new Map(); // Map to track players by entityId
    const igns = new Map(); // Map to track player names by UUID

    function sendChatMessage(client, message) {
        proxyAPI.sendToClient(client, 'chat', {
            message: JSON.stringify({ text: ("[§cAC§r] " + message) }),
            position: 0,
            sender: '00000000-0000-0000-0000-000000000000'
        });
    }

    proxyAPI.on('clientPacket', ({ data, meta }) => {
        // console.log(`Client Packet: ${meta.name}`, data);
    });

    proxyAPI.on('serverPacket', ({ client, data, meta }) => {
        // Track player info from the player_info packet
        if (meta.name === 'player_info') {
            if (data.action === 0) {
                data.data.forEach((player) => {
                    if (player.name && player.UUID) { // Add player
                        igns.set(player.UUID, player.name); // Store the player's name by UUID
                        // console.log(`Player info added: ${player.name} (${player.UUID})`);

                    }
                });
            }
        }

        // Track players rendered in the world from the named_entity_spawn packet
        if (meta.name === 'named_entity_spawn') {
            playerName = igns.get(data.playerUUID) || 'Unknown'; // Get the player's name from the map or use 'Unknown'
            const player = new Player(
                playerName,
                data.playerUUID,
                data.entityId
            );
            players.set(data.entityId, player);
            // console.log(`Player rendered: ${player}`);
            // try {
            //     sendChatMessage(client, `Player ${player} added.`);
            //     const playerList = Array.from(players.values()).map(p => p.username).join(', ');
            //     sendChatMessage(client, `Current players: ${playerList}`);
            // } catch (err) {
            //     console.error(`Error sending chat message: ${err.message}`);
            // }
        }

        // Remove players from the world when the entity_destroy packet is received
        if (meta.name === 'entity_destroy') {
            data.entityIds.forEach((entityId) => {
                if (players.has(entityId)) {
                    const player = players.get(entityId);
                    // console.log(`Player removed: ${player}`);
                    players.delete(entityId);
                }
            });
        }

        if (meta.name === 'entity_metadata') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);
                data.metadata.forEach((entry) => {
                    if (entry.key === 0 && entry.type === 0) {
                        if (entry.value === 16) {
                            player.isUsingItem = true;
                            // sendChatMessage(client, `Player ${player.username} is using an item.`);
                        }
                        else if (entry.value === 0) {
                            player.isUsingItem = false;
                            // sendChatMessage(client, `Player ${player.username} is no longer using an item.`); 
                        }
                    }
                });
            }
        }

        if (meta.name === 'animation') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);
                if (data.animation === 0) {
                    player.swingProgress = 6;
                    // sendChatMessage(client, `${player.username} swung!`);
                }
            }
        }

        if (meta.name === 'entity_look' || meta.name === 'entity_move_look' || meta.name === 'rel_entity_move') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);
                if (player.isUsingItem && player.swingProgress > 0) {
                    player.AutoBlockA_VL++;
                    // sendChatMessage(client, `${player.username} AutoBlock level: ${player.AutoBlockA_VL}`);
                    if (player.AutoBlockA_VL >= 10) {
                        player.AutoBlockA_VL = 0;
                        player.AutoBlockA_LastAlert = player.ticksExisted;
                        sendChatMessage(client, `${player.username} flagged AutoBlock!`);
                    }
                } else {
                    player.AutoBlockA_VL = Math.max(0, player.AutoBlockA_VL - 5);
                }
                player.ticksExisted++;
                if (player.swingProgress > 0) {
                    player.swingProgress--;
                }
                if (player.isUsingItem) {
                    player.lastUsingTick = player.ticksExisted;
                }
            }
        }
    });
};
