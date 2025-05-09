class Player {
    // Class to represent a player in the world

    constructor(username, uuid, entityId) {
        this.username = username; // Player's username
        this.uuid = uuid;         // Player's UUID
        this.entityId = entityId; // Player's entity ID
        this.AutoBlockA_VL = 0;
        this.AutoBlockA_LastAlert = 0;
        this.NoSlowA_VL = 0;
        this.NoSlowA_LastAlert = 0;
        this.swingProgress = 0;
        this.isCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.ticksExisted = 0;
        this.lastUsingTick = 0;
    }

    toString() {
        return `${this.username} (${this.uuid}) [Entity ID: ${this.entityId}]`;
    }
}

// Packet handling goes here
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

    function AutoBlockA(player, client) {
        if (player.isUsingItem && player.swingProgress > 0) {
            player.AutoBlockA_VL++;
            if (player.AutoBlockA_VL >= 10) {
                player.AutoBlockA_VL = 0;
                player.AutoBlockA_LastAlert = player.ticksExisted;
                sendChatMessage(client, `${player.username} flagged AutoBlock!`);
            }
        } else {
            player.AutoBlockA_VL = Math.max(0, player.AutoBlockA_VL - 5);
        }
    }

    function NoSlowA(player, client) {
        if (player.isUsingItem && player.isSprinting) {
            player.NoSlowA_VL++;
            if (player.NoSlowA_VL >= 10) {
                player.NoSlowA_VL = 0;
                player.NoSlowA_LastAlert = player.ticksExisted;
                sendChatMessage(client, `${player.username} flagged NoSlow!`);
            }
        } else {
            player.NoSlowA_VL = Math.max(0, player.NoSlowA_VL - 1);
        }
    }

    proxyAPI.on('clientPacket', ({ data, meta }) => {
        // console.log(`Client Packet: ${meta.name}`, data);
    });

    proxyAPI.on('serverPacket', ({ client, data, meta }) => {
        // Player usernames are not sent when the player is loaded, so we need to track them here
        if (meta.name === 'player_info') {
            if (data.action === 0) {
                data.data.forEach((player) => {
                    if (player.name && player.UUID) { // Add player
                        igns.set(player.UUID, player.name); // Store the player's name by UUID
                    }
                });
            }
        }

        // Track players rendered in the world
        if (meta.name === 'named_entity_spawn') {
            playerName = igns.get(data.playerUUID) || 'Unknown'; // Get the player's name from the map or use 'Unknown'
            const player = new Player(
                playerName,
                data.playerUUID,
                data.entityId
            );
            players.set(data.entityId, player);
        }

        // Remove players from the world when they are destroyed
        if (meta.name === 'entity_destroy') {
            data.entityIds.forEach((entityId) => {
                if (players.has(entityId)) {
                    const player = players.get(entityId);
                    players.delete(entityId);
                }
            });
        }

        if (meta.name === 'entity_metadata') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);
                data.metadata.forEach((entry) => {

                    // Check if the entry is for item use state
                    if (entry.key === 0 && entry.type === 0) {

                        // Check if the entry is for using an item
                        // Check if bit 4 is set (using an item)
                        // if ((entry.value & 0b00010000) !== 0) {
                        //     player.isUsingItem = true;
                        // }
                        // // Check if bit 4 is not set (no longer using an item)
                        // else {
                        //     player.isUsingItem = false;
                        // }
                        player.isCrouching = entry.value & 0x01;
                        player.isSprinting = entry.value & 0x08;
                        player.isUsingItem = entry.value & 0x10;
                    }
                });
            }
        }

        if (meta.name === 'animation') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);

                // Check if the animation is swinging
                if (data.animation === 0) {
                    player.swingProgress = 6;
                }
            }
        }

        // Use entity position packets to clock ticks
        if (meta.name === 'entity_look' || meta.name === 'entity_move_look' || meta.name === 'rel_entity_move') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);

                // Run checks
                AutoBlockA(player, client);
                NoSlowA(player, client);

                // Update player state
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
