// Advanced debugger/logging system for development
const __OFFICIAL_PLUGIN__ = true;
module.exports = (api) => {
    api.metadata({
        name: 'debugger',
        displayName: 'Debugger',
        prefix: '§cDEBUG',
        version: '0.0.5',
        author: 'Hexze',
        description: 'Advanced debugger/logging system for development',
        checksum: null // Calculate the actual SHA256 hash if needed
    });

    api.commands((registry) => {
        registry.registerConfig({
            displayName: 'Debugger',
            configObject: api.getConfig(),
            schemaBuilder: () => [],
            saveHandler: () => api.saveCurrentConfig()
        });
    });

    const debugSystem = new DebugSystem(api);
    debugSystem.registerHandlers();

    return debugSystem;
};

class DebugSystem {
    constructor(api) {
        this.api = api;
        this.enabled = true;
    }

    registerHandlers() {
        this.api.on('player.move', this.onPlayerMove.bind(this));
        this.api.on('player.action', this.onPlayerAction.bind(this));
        this.api.on('player.join', this.onPlayerJoin.bind(this));
        this.api.on('player.leave', this.onPlayerLeave.bind(this));
        this.api.on('player.equipment', this.onPlayerEquipment.bind(this));
    }

    onPlayerMove(player) {
        if (!this.shouldLogPlayer(player)) return;

        const logData = {
            event: 'move',
            name: player.name,
            pos: {
                x: player.position.x.toFixed(2),
                y: player.position.y.toFixed(2),
                z: player.position.z.toFixed(2)
            },
            velocity: {
                x: player.velocity.x.toFixed(3),
                y: player.velocity.y.toFixed(3),
                z: player.velocity.z.toFixed(3)
            },
            onGround: player.onGround,
            rotation: {
                yaw: player.rotation.yaw.toFixed(2),
                pitch: player.rotation.pitch.toFixed(2)
            }
        };

        this.api.log(`Player Move: ${JSON.stringify(logData)}`);
    }

    onPlayerAction(player, action) {
        if (!this.shouldLogPlayer(player)) return;

        const logData = {
            event: 'action',
            name: player.name,
            type: action.type,
            value: action.value,
            states: {
                crouching: player.isCrouching,
                sprinting: player.isSprinting,
                usingItem: player.isUsingItem,
                blocking: player.isBlocking
            }
        };

        this.api.log(`Player Action: ${JSON.stringify(logData)}`);
    }

    onPlayerJoin(player) {
        const logData = {
            event: 'join',
            name: player.name,
            uuid: player.uuid,
            displayName: player.displayName
        };

        this.api.log(`Player Join: ${JSON.stringify(logData)}`);
    }

    onPlayerLeave(player) {
        const logData = {
            event: 'leave',
            name: player.name,
            uuid: player.uuid
        };

        this.api.log(`Player Leave: ${JSON.stringify(logData)}`);
    }

    onPlayerEquipment(player) {
        if (!this.shouldLogPlayer(player)) return;

        const logData = {
            event: 'equipment',
            name: player.name,
            heldItem: player.heldItem ? {
                id: player.heldItem.blockId,
                count: player.heldItem.itemCount,
                meta: player.heldItem.itemDamage
            } : null,
            armor: {
                helmet: player.getEquipment(4),
                chestplate: player.getEquipment(3),
                leggings: player.getEquipment(2),
                boots: player.getEquipment(1)
            }
        };

        this.api.log(`Player Equipment: ${JSON.stringify(logData)}`);
    }

    shouldLogPlayer(player) {
        // filter specific players if needed
        return player.name === 'UrchinAPI';
    }
} 