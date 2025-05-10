class Player {
    // Class to represent a player in the world
    constructor(username, uuid, entityId) {
        this.username = username;
        this.uuid = uuid;
        this.entityId = entityId;
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
}

// Packet handling goes here
module.exports = (proxyAPI) => {
    const players = new Map(); // Map to track players by entityId
    const igns = new Map(); // Map to track player names by UUID

    function sendChatMessage(message) {
        proxyAPI.sendToClient('chat', {
            message: JSON.stringify({ text: ("[§cAC§r] " + message) }),
            position: 0,
            sender: '00000000-0000-0000-0000-000000000000'
        });
    }

    function AutoBlockA(player) {
        if (player.isUsingItem && player.swingProgress > 0) {
            player.AutoBlockA_VL++;
            if (player.AutoBlockA_VL >= 10) {
                player.AutoBlockA_VL = 0;
                player.AutoBlockA_LastAlert = player.ticksExisted;
                sendChatMessage(`${player.username} flagged AutoBlock!`);
            }
        } else {
            player.AutoBlockA_VL = Math.max(0, player.AutoBlockA_VL - 5);
        }
    }

    function NoSlowA(player) {
        if (player.isUsingItem && player.isSprinting) {
            player.NoSlowA_VL++;
            if (player.NoSlowA_VL >= 10) {
                player.NoSlowA_VL = 0;
                player.NoSlowA_LastAlert = player.ticksExisted;
                sendChatMessage(`${player.username} flagged NoSlow!`);
            }
        } else {
            player.NoSlowA_VL = Math.max(0, player.NoSlowA_VL - 1);
        }
    }

    proxyAPI.on('clientPacket', ({ data, meta }) => {
        // console.log(`Client Packet: ${meta.name}`, data);
    });

    proxyAPI.on('serverPacket', ({ data, meta }) => {

        // Player usernames are not sent when the player is loaded, so we need to track them from player_info packets
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
                    players.delete(entityId);
                }
            });
        }

        if (meta.name === 'entity_metadata') {
            if (players.has(data.entityId)) {
                const player = players.get(data.entityId);
                data.metadata.forEach((entry) => {
                    if (entry.key === 0 && entry.type === 0) {
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
                AutoBlockA(player);
                NoSlowA(player);

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
