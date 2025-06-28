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
    });

    // define config schema for debugger settings
    api.configSchema([
        {
            label: 'General Logging',
            settings: [
                {
                    key: 'logging.enabled',
                    type: 'toggle',
                    description: 'Enable debug logging'
                }
            ],
            defaults: {
                logging: { enabled: true }
            }
        },
        {
            label: 'Player Filter',
            settings: [
                {
                    key: 'logging.filterPlayers',
                    type: 'cycle',
                    values: [
                        { text: 'All Players', value: 'all' },
                        { text: 'UrchinAPI Only', value: 'UrchinAPI' },
                        { text: 'No Filtering', value: 'none' }
                    ],
                    description: 'Choose which players to log'
                }
            ],
            defaults: {
                logging: { filterPlayers: 'UrchinAPI' }
            }
        },
        {
            label: 'Movement Events',
            settings: [
                {
                    key: 'events.movement',
                    type: 'toggle',
                    description: 'Log player movement events'
                }
            ],
            defaults: {
                events: { movement: true }
            }
        },
        {
            label: 'Action Events',
            settings: [
                {
                    key: 'events.actions',
                    type: 'toggle',
                    description: 'Log player action events'
                }
            ],
            defaults: {
                events: { actions: true }
            }
        },
        {
            label: 'Equipment Events',
            settings: [
                {
                    key: 'events.equipment',
                    type: 'toggle',
                    description: 'Log player equipment changes'
                }
            ],
            defaults: {
                events: { equipment: true }
            }
        },
        {
            label: 'Join/Leave Events',
            settings: [
                {
                    key: 'events.joinLeave',
                    type: 'toggle',
                    description: 'Log player join/leave events'
                }
            ],
            defaults: {
                events: { joinLeave: true }
            }
        }
    ]);

    const debugSystem = new DebugSystem(api);
    debugSystem.registerHandlers();

    // return cleanup function for proper plugin lifecycle management
    return {
        cleanup: () => {
            debugSystem.cleanup();
        }
    };
};

class DebugSystem {
    constructor(api) {
        this.api = api;
        this.lastStates = new Map(); // track previous states per player
        this.lastPositions = new Map(); // track previous positions and timestamps for velocity calculation
    }

    registerHandlers() {
        this.api.on('player.move', this.onPlayerMove.bind(this));
        this.api.on('player.action', this.onPlayerAction.bind(this));
        this.api.on('player.join', this.onPlayerJoin.bind(this));
        this.api.on('player.leave', this.onPlayerLeave.bind(this));
        this.api.on('player.equipment', this.onPlayerEquipment.bind(this));
    }

    cleanup() {
        // clear stored states on plugin cleanup
        this.lastStates.clear();
        this.lastPositions.clear();
    }

    isLoggingEnabled() {
        return this.api.config.get('logging.enabled');
    }

    shouldLogEvent(eventType) {
        return this.api.config.get(`events.${eventType}`);
    }

    onPlayerMove(event) {
        if (!this.isLoggingEnabled() || !this.shouldLogEvent('movement')) return;
        
        const player = event.player;
        if (!this.shouldLogPlayer(player)) return;

        const currentTime = Date.now();
        const currentPos = event.position;
        const playerUuid = player.uuid;

        // calculate velocity based on position changes
        let calculatedVelocity = { x: 0, y: 0, z: 0 };
        const lastPosData = this.lastPositions.get(playerUuid);
        
        if (lastPosData) {
            const timeDelta = (currentTime - lastPosData.timestamp) / 1000; // convert to seconds
            
            if (timeDelta > 0) {
                calculatedVelocity = {
                    x: (currentPos.x - lastPosData.position.x) / timeDelta,
                    y: (currentPos.y - lastPosData.position.y) / timeDelta,
                    z: (currentPos.z - lastPosData.position.z) / timeDelta
                };
            }
        }

        // store current position and timestamp for next calculation
        this.lastPositions.set(playerUuid, {
            position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
            timestamp: currentTime
        });

        const logData = {
            event: 'move',
            name: player.name,
            pos: {
                x: currentPos.x.toFixed(2),
                y: currentPos.y.toFixed(2),
                z: currentPos.z.toFixed(2)
            },
            velocity: {
                x: calculatedVelocity.x.toFixed(3),
                y: calculatedVelocity.y.toFixed(3),
                z: calculatedVelocity.z.toFixed(3)
            },
            onGround: event.onGround,
            rotation: event.rotation ? {
                yaw: event.rotation.yaw.toFixed(2),
                pitch: event.rotation.pitch.toFixed(2)
            } : { yaw: '0.00', pitch: '0.00' }
        };

        this.api.log(`Player Move: ${JSON.stringify(logData)}`);
    }

    onPlayerAction(event) {
        if (!this.isLoggingEnabled() || !this.shouldLogEvent('actions')) return;
        
        const player = event.player;
        const action = { type: event.type, value: event.value };
        if (!this.shouldLogPlayer(player)) return;

        // get previous state for this player
        const lastState = this.lastStates.get(player.uuid) || {};
        
        // get current state value for the specific action
        let currentValue;
        switch (action.type) {
            case 'crouch':
                currentValue = player.isCrouching;
                break;
            case 'sprint':
                currentValue = player.isSprinting;
                break;
            case 'useItem':
                currentValue = player.isUsingItem;
                break;
            case 'swing':
                // always log swings since they're momentary actions
                break;
            default:
                currentValue = action.value;
        }

        // only log if the state actually changed (or if it's a swing)
        if (action.type === 'swing' || lastState[action.type] !== currentValue) {
            const logData = {
                event: 'action',
                name: player.name,
                type: action.type,
                value: action.value,
                changed: action.type === 'swing' ? 'swing' : `${action.type}: ${lastState[action.type]} -> ${currentValue}`
            };

            this.api.log(`Player Action: ${JSON.stringify(logData)}`);
        }

        // update stored state for this player
        if (!this.lastStates.has(player.uuid)) {
            this.lastStates.set(player.uuid, {});
        }
        this.lastStates.get(player.uuid)[action.type] = currentValue;
    }

    onPlayerJoin(event) {
        if (!this.isLoggingEnabled() || !this.shouldLogEvent('joinLeave')) return;
        
        const player = event.player;
        const logData = {
            event: 'join',
            name: player.name,
            uuid: player.uuid,
            displayName: player.displayName
        };

        this.api.log(`Player Join: ${JSON.stringify(logData)}`);
    }

    onPlayerLeave(event) {
        if (!this.isLoggingEnabled() || !this.shouldLogEvent('joinLeave')) return;
        
        const player = event.player;
        const logData = {
            event: 'leave',
            name: player.name,
            uuid: player.uuid
        };

        this.api.log(`Player Leave: ${JSON.stringify(logData)}`);
        
        // cleanup stored state for this player
        this.lastStates.delete(player.uuid);
        this.lastPositions.delete(player.uuid);
    }

    onPlayerEquipment(event) {
        if (!this.isLoggingEnabled() || !this.shouldLogEvent('equipment')) return;
        
        const player = event.player;
        if (!this.shouldLogPlayer(player)) return;

        const logData = {
            event: 'equipment',
            name: player.name,
            heldItem: player.heldItem ? {
                id: player.heldItem.blockId || player.heldItem.itemId || player.heldItem.id,
                count: player.heldItem.itemCount || player.heldItem.count,
                meta: player.heldItem.itemDamage || player.heldItem.metadata
            } : null,
            armor: {
                helmet: player.equipment && player.equipment[4] ? player.equipment[4] : null,
                chestplate: player.equipment && player.equipment[3] ? player.equipment[3] : null,
                leggings: player.equipment && player.equipment[2] ? player.equipment[2] : null,
                boots: player.equipment && player.equipment[1] ? player.equipment[1] : null
            }
        };

        this.api.log(`Player Equipment: ${JSON.stringify(logData)}`);
    }

    shouldLogPlayer(player) {
        const filterSetting = this.api.config.get('logging.filterPlayers');
        
        switch (filterSetting) {
            case 'all':
                return true;
            case 'UrchinAPI':
                return player.name === 'UrchinAPI';
            case 'none':
                return false;
            default:
                return player.name === 'UrchinAPI'; // fallback to UrchinAPI
        }
    }
} 