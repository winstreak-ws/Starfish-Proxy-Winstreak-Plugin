class Player {
    constructor(username, uuid, entityId) {
        this.username = username; // Player's username
        this.uuid = uuid;         // Player's UUID
        this.entityId = entityId; // Player's entity ID
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
            data.data.forEach((player) => {
                if (data.action === 0 && player.name && player.UUID) { // Add player
                    igns.set(player.UUID, player.name); // Store the player's name by UUID
                    // console.log(`Player info added: ${player.name} (${player.UUID})`);

                }
            });
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
    });
};
