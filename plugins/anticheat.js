// Advanced Anticheat System
// Adapted from Pug's Custom Anticheat Raven script (github.com/PugrillaDev)

module.exports = (api) => {
    api.metadata({
        name: 'anticheat',
        displayName: 'Anticheat',
        prefix: '§cAC',
        version: '0.0.9',
        author: 'Hexze',
        description: 'Advanced cheater detector system (Inspired by github.com/PugrillaDev)'
    });

    const anticheat = new AnticheatSystem(api);
    
    const configSchema = [];
    const checkDefinitions = getCheckDefinitions();
    
    for (const checkName in checkDefinitions) {
        const defaultCheckConfig = checkDefinitions[checkName];
            
        configSchema.push({
            label: checkName,
            defaults: { checks: { [checkName]: defaultCheckConfig } },
            settings: [
                {
                    type: 'toggle',
                    key: `checks.${checkName}.enabled`,
                    text: ['OFF', 'ON'],
                    description: defaultCheckConfig.description || `Enables or disables the ${checkName} check.`
                },
                {
                    type: 'soundToggle',
                    key: `checks.${checkName}.sound`,
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Toggles sound alerts for this check.'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.vl`,
                    values: [
                        { text: 'VL: 5', value: 5 },
                        { text: 'VL: 10', value: 10 },
                        { text: 'VL: 15', value: 15 },
                        { text: 'VL: 20', value: 20 },
                        { text: 'VL: 30', value: 30 }
                    ],
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Sets the violation level to trigger an alert.'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.cooldown`,
                    values: [
                        { text: 'CD: 0s', value: 0 },
                        { text: 'CD: 1s', value: 1000 },
                        { text: 'CD: 2s', value: 2000 },
                        { text: 'CD: 3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.checks[checkName].enabled,
                    description: 'Sets the cooldown between alerts for this check.'
                }
            ]
        });
    }

    api.initializeConfig(configSchema);
    api.configSchema(configSchema);
    
    anticheat.registerHandlers();
    return anticheat;
};


const CHECKS = {
    NoSlowA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects moving too fast while using items that should slow you down (eating food, drawing bow, blocking sword)." 
        },
        
        check: function(player, config) {
            const currentTime = Date.now();
            
            const isUsingSlowdownItem = player.isUsingItem && (
                player.isHoldingConsumable() || 
                player.isHoldingBow() || 
                (player.isHoldingSword() && player.isUsingItem)
            );
            
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            const isMovingTooFast = horizontalSpeed > 1.5;
            
            const isCurrentlyNoSlow = isUsingSlowdownItem && isMovingTooFast;
            
            if (!player.noSlowData) {
                player.noSlowData = {
                    startTime: null,
                    isActive: false
                };
            }
            
            if (isCurrentlyNoSlow) {
                if (!player.noSlowData.isActive) {
                    player.noSlowData.startTime = currentTime;
                    player.noSlowData.isActive = true;
                }
                
                const noSlowDuration = currentTime - player.noSlowData.startTime;
                if (noSlowDuration >= 500) {
                    this.addViolation(player, 'NoSlowA', 2);
                    
                    if (this.shouldAlert(player, 'NoSlowA', config)) {
                        this.flag(player, 'NoSlowA', player.violations.NoSlowA);
                        this.markAlert(player, 'NoSlowA');
                    }
                }
            } else {
                player.noSlowData.isActive = false;
                player.noSlowData.startTime = null;
                this.reduceViolation(player, 'NoSlowA');
            }
        }
    },
    
    AutoBlockA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects attacking while blocking with a sword." 
        },
        
        check: function(player, config) {
            const currentTime = Date.now();
            const isHoldingSword = player.isHoldingSword();
            const isSwinging = player.swingProgress > 0;
            
            if (!player.swingHistory) player.swingHistory = [];
            
            if (isSwinging && (!player.lastSwingDetected || currentTime - player.lastSwingDetected > 100)) {
                const hasBeenBlockingLongEnough = player.isBlocking && 
                    player.blockingStartTime && 
                    (currentTime - player.blockingStartTime >= 150);
                
                player.swingHistory.push({
                    time: currentTime,
                    wasBlockingBefore: hasBeenBlockingLongEnough,
                    wasBlockingAfter: null
                });
                player.lastSwingDetected = currentTime;
                
                if (player.swingHistory.length > 20) {
                    player.swingHistory.shift();
                }
            }
            
            player.swingHistory.forEach(swing => {
                if (swing.wasBlockingAfter === null) {
                    const timeSinceSwing = currentTime - swing.time;
                    if (timeSinceSwing >= 150 && timeSinceSwing <= 200) {
                        swing.wasBlockingAfter = player.isBlocking;
                    }
                    else if (timeSinceSwing > 200) {
                        swing.wasBlockingAfter = false;
                    }
                }
            });
            
            const recentSwings = player.swingHistory.filter(swing => 
                currentTime - swing.time < 1000 &&
                swing.wasBlockingAfter !== null &&
                isHoldingSword
            );
            
            let autoBlockCount = 0;
            recentSwings.forEach(swing => {
                const wasBlockingBefore = swing.wasBlockingBefore;
                const wasBlockingAfter = swing.wasBlockingAfter;
                
                if (wasBlockingBefore && wasBlockingAfter) {
                    autoBlockCount++;
                }
            });
            
            if (autoBlockCount >= 2) {
                this.addViolation(player, 'AutoBlockA');
                
                if (this.shouldAlert(player, 'AutoBlockA', config)) {
                    this.flag(player, 'AutoBlockA', player.violations.AutoBlockA);
                    this.markAlert(player, 'AutoBlockA');
                }
            } else {
                this.reduceViolation(player, 'AutoBlockA');
            }
        }
    },
    
    EagleA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects diagonal double-shifting eagle (legit scaffold) patterns." 
        },

        check: function(player, config) {
            const isLookingDown = player.pitch >= 30;
            const isOnGround = player.onGround;
            const isSwingingBlock = player.swingProgress > 0 && player.heldItem && player.heldItem.blockId;
            
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            const isMovingFast = horizontalSpeed > 2.0;
            
            let movementAngle = Math.atan2(player.velocity.z, player.velocity.x) * 180 / Math.PI;
            if (movementAngle < 0) movementAngle += 360;
            const cardinalAngles = [0, 90, 180, 270];
            const isMovingStraight = cardinalAngles.some(angle => 
                Math.abs(movementAngle - angle) <= 15 || Math.abs(movementAngle - angle - 360) <= 15
            );
            const isMovingDiagonal = !isMovingStraight && horizontalSpeed > 0.1;
            
            const currentTime = Date.now();
            const recentShifts = player.shiftEvents.filter(event => 
                currentTime - event.timestamp < 2000 && event.type === 'start'
            );
            const shiftCount = recentShifts.length;
            const hasExcessiveShifts = shiftCount > 6 && horizontalSpeed > 2.5;
            
            const isEagle = isLookingDown && isOnGround && isSwingingBlock && 
                           isMovingDiagonal && isMovingFast && hasExcessiveShifts;

            if (isEagle) {
                this.addViolation(player, 'EagleA', 2);
                
                if (this.shouldAlert(player, 'EagleA', config)) {
                    this.flag(player, 'EagleA', player.violations.EagleA);
                    this.markAlert(player, 'EagleA');
                }
            } else {
                this.reduceViolation(player, 'EagleA', 1);
            }
        }
    },
    
    ScaffoldA: {
        config: { 
            enabled: true, sound: true, vl: 15, cooldown: 2000, 
            description: "Detects fast flat scaffold with no vertical movement" 
        },

        check: function(player, config) {
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            
            const isLikelyDead = player.position.y > 100;
            if (isLikelyDead) {
                this.reduceViolation(player, 'ScaffoldA');
                return;
            }
            
            const isLookingDown = player.pitch >= 25;
            const isPlacingBlocks = player.swingProgress > 0 && player.heldItem && player.heldItem.blockId;
            const isMovingFast = horizontalSpeed > 5.0;
            const isNotSneaking = !player.isCrouching;
            const isFlat = Math.abs(player.velocity.y) < 0.1;
            
            const isScaffold = isLookingDown && isPlacingBlocks && isMovingFast && isNotSneaking && isFlat;
            
            if (isScaffold) {
                this.addViolation(player, 'ScaffoldA', 1);
                
                if (this.shouldAlert(player, 'ScaffoldA', config)) {
                    this.flag(player, 'ScaffoldA', player.violations.ScaffoldA);
                    this.markAlert(player, 'ScaffoldA');
                }
            } else {
                this.reduceViolation(player, 'ScaffoldA');
            }
        }
    },
    
    
    TowerA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects ascending (towering) faster than normal while placing blocks below." 
        },
        
        check: function(player, config) {
            const currentTime = Date.now();
            const verticalSpeed = player.velocity.y;
            const horizontalSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
            
            const isLookingDown = player.pitch >= 30;
            const isSwingingBlock = player.swingProgress > 0 && player.heldItem && player.heldItem.blockId;
            const hasNoJumpBoost = !player.hasJumpBoost;
            const isAscendingFast = verticalSpeed > 5.5;
            
            const verticalToHorizontalRatio = horizontalSpeed > 0 ? verticalSpeed / horizontalSpeed : verticalSpeed;
            const hasProperTowerRatio = verticalToHorizontalRatio >= 0.8;
            
            const hasRecentDamage = player.lastDamaged > 0 && (currentTime - player.lastDamaged) < 500;
            
            if (!player.towerData) {
                player.towerData = {
                    heightHistory: [],
                    lastReset: currentTime
                };
            }
            
            if (currentTime - player.towerData.lastReset > 2000) {
                player.towerData.heightHistory = [];
                player.towerData.lastReset = currentTime;
            }
            
            if (isLookingDown && isSwingingBlock && isAscendingFast && hasProperTowerRatio && hasNoJumpBoost && !hasRecentDamage) {
                player.towerData.heightHistory.push({
                    y: player.position.y,
                    time: currentTime
                });
                
                if (player.towerData.heightHistory.length > 15) {
                    player.towerData.heightHistory.shift();
                }
            }
            
            if (player.towerData.heightHistory.length >= 8) {
                const heights = player.towerData.heightHistory;
                const start = heights[0];
                const end = heights[heights.length - 1];
                
                const totalHeightGain = end.y - start.y;
                const timeSpan = (end.time - start.time) / 1000;
                
                let consistentRiseCount = 0;
                for (let i = 1; i < heights.length; i++) {
                    if (heights[i].y > heights[i-1].y) {
                        consistentRiseCount++;
                    }
                }
                
                const consistencyRatio = consistentRiseCount / (heights.length - 1);
                const hasConsistentRise = consistencyRatio >= 0.8;
                const hasSignificantHeight = totalHeightGain >= 3.0;
                const hasGoodTimespan = timeSpan >= 0.4 && timeSpan <= 1.5;
                
                this.api.debugLog(`[TowerA] ${player.displayName} - VSpeed: ${verticalSpeed.toFixed(2)}, HSpeed: ${horizontalSpeed.toFixed(2)}, Ratio: ${verticalToHorizontalRatio.toFixed(2)}, HeightGain: ${totalHeightGain.toFixed(2)}, TimeSpan: ${timeSpan.toFixed(2)}s, ConsistentRise: ${consistentRiseCount}/${heights.length-1} (${consistencyRatio.toFixed(2)}), Consistent: ${hasConsistentRise}, SignificantHeight: ${hasSignificantHeight}, GoodTimespan: ${hasGoodTimespan}`);
                
                if (hasConsistentRise && hasSignificantHeight && hasGoodTimespan) {
                    this.addViolation(player, 'TowerA', 2);
                    
                    if (this.shouldAlert(player, 'TowerA', config)) {
                        this.flag(player, 'TowerA', player.violations.TowerA);
                        this.markAlert(player, 'TowerA');
                    }
                } else {
                    this.reduceViolation(player, 'TowerA');
                }
            }
        }
    }
};

const getCheckDefinitions = () => {
    const definitions = {};
    for (const [checkName, checkData] of Object.entries(CHECKS)) {
        definitions[checkName] = checkData.config;
    }
    return definitions;
};

class PlayerData {
    constructor(username, uuid, entityId) {
        this.username = username;
        this.uuid = uuid;
        this.entityId = entityId;
        this.displayName = username;
        
        this.position = { x: 0, y: 0, z: 0 };
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.onGround = true;
        this.lastOnGround = true;
        
        this.yaw = 0;
        this.pitch = 0;
        
        this.isCrouching = false;
        this.lastCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.swingProgress = 0;
        
        this.lastSwingTime = 0;
        this.lastCrouchTime = 0;
        this.lastStopCrouchTime = 0;
        
        this.lastPositionData = null;
        this.velocity = { x: 0, y: 0, z: 0 };
        
        this.violations = {};
        this.lastAlerts = {};
        
        for (const checkName of Object.keys(CHECKS)) {
            this.violations[checkName] = 0;
            this.lastAlerts[checkName] = 0;
        }
        
        this.lastSwingItem = null;
        this.hasJumpBoost = false;
        
        this.shiftEvents = [];
        this.currentShiftStart = null;
        
        this.heldItem = null;
        
        this.lastSprinting = false;
        this.lastUsing = false;
        this.lastDamaged = 0;
        
        this.isBlocking = false;
        this.blockingStartTime = 0;
    }
    
    updatePosition(x, y, z, onGround, yaw = null, pitch = null) {
        this.lastPosition = { ...this.position };
        this.position = { x, y, z };
        this.onGround = onGround;
        
        if (yaw !== null) this.yaw = yaw;
        if (pitch !== null) this.pitch = pitch;
        
        const currentTime = Date.now();
        let calculatedVelocity = { x: 0, y: 0, z: 0 };
        
        if (this.lastPositionData) {
            const timeDelta = (currentTime - this.lastPositionData.timestamp) / 1000;
            
            if (timeDelta > 0) {
                calculatedVelocity = {
                    x: (x - this.lastPositionData.position.x) / timeDelta,
                    y: (y - this.lastPositionData.position.y) / timeDelta,
                    z: (z - this.lastPositionData.position.z) / timeDelta
                };
            }
        }
        
        this.velocity = calculatedVelocity;
        
        this.lastPositionData = {
            position: { x, y, z },
            timestamp: currentTime
        };
        
        this.lastOnGround = onGround;
    }
    
    isHoldingSword() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        const swordIds = [267, 268, 272, 276, 283]; // wood, stone, iron, diamond, gold swords
        return swordIds.includes(this.heldItem.blockId);
    }
    
    isHoldingBow() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        return this.heldItem.blockId === 261;
    }
    
    isHoldingConsumable() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        const consumableIds = [
            260, // apple
            297, // bread
            319, // porkchop
            320, // cooked_porkchop
            322, // golden_apple
            335, // milk_bucket
            349, // fish
            350, // cooked_fish
            354, // cake (item)
            357, // cookie
            360, // melon_slice
            363, // beef
            364, // cooked_beef
            365, // chicken
            366, // cooked_chicken
            367, // rotten_flesh
            373, // potion
            391, // carrot
            392, // potato
            393, // baked_potato
            394, // poisonous_potato
            396, // golden_carrot
            400, // pumpkin_pie
            411, // rabbit
            412, // cooked_rabbit
            413, // rabbit_stew
            423, // mutton
            424  // cooked_mutton
        ];
        return consumableIds.includes(this.heldItem.blockId);
    }
}

class AnticheatSystem {
    constructor(api) {
        this.api = api;
        this.players = new Map();
        this.entityToPlayer = new Map();
        this.uuidToName = new Map();
        this.uuidToDisplayName = new Map();
        this.userPosition = null;
    }
    
    reset() {
        this.players.clear();
        this.entityToPlayer.clear();
        this.uuidToName.clear();
        this.uuidToDisplayName.clear();
        this.api.debugLog('Cleared all tracked player data.');
    }
    
    registerHandlers() {

        this.api.on('world.change', () => {
            this.api.debugLog('World change detected, clearing data.');
            this.reset();
        });
        
        this.api.on('plugin.restored', (event) => {
            if (event.pluginName === 'anticheat') {
                this.api.debugLog('Anticheat plugin restored, clearing data.');
                this.reset();
            }
        });
        
        this.api.on('player.move', (event) => {
            this.handlePlayerMove(event);
        });
        
        this.api.on('player.action', (event) => {
            this.handlePlayerAction(event);
        });
        
        this.api.on('player.join', (event) => {
            this.handlePlayerJoin(event);
        });
        
        this.api.on('player.leave', (event) => {
            this.handlePlayerLeave(event);
        });
        
        this.unsubscribeRespawn = this.api.on('packet:server:respawn', (event) => {
            this.api.debugLog('Respawn detected, clearing data.');
            this.reset();
        });
        
        this.unsubscribePlayerInfo = this.api.on('packet:server:player_info', (event) => {
            this.handlePlayerInfo(event.data);
        });
        
        this.unsubscribeEntitySpawn = this.api.on('packet:server:named_entity_spawn', (event) => {
            this.handleEntitySpawn(event.data);
        });
        
        this.unsubscribeEntityDestroy = this.api.on('packet:server:entity_destroy', (event) => {
            this.handleEntityDestroy(event.data);
        });
        
        this.unsubscribeEntityMetadata = this.api.on('packet:server:entity_metadata', (event) => {
            this.handleEntityMetadata(event.data);
        });
        
        this.unsubscribeEntityTeleport = this.api.on('packet:server:entity_teleport', (event) => {
            this.handleEntityTeleport(event.data);
        });
        
        this.unsubscribeEntityEquipment = this.api.on('packet:server:entity_equipment', (event) => {
            this.handleEntityEquipment(event.data);
        });
        
        this.unsubscribeEntityEffect = this.api.on('packet:server:entity_effect', (event) => {
            this.handleEntityEffect(event.data);
        });
        
        this.unsubscribeRemoveEntityEffect = this.api.on('packet:server:remove_entity_effect', (event) => {
            this.handleRemoveEntityEffect(event.data);
        });
        
        this.unsubscribeEntityStatus = this.api.on('packet:server:entity_status', (event) => {
            this.handleEntityStatus(event.data);
        });
        
        this.unsubscribePosition = this.api.on('packet:client:position', (event) => {
            this.userPosition = { x: event.data.x, y: event.data.y, z: event.data.z };
        });
        
        this.unsubscribePositionLook = this.api.on('packet:client:position_look', (event) => {
            this.userPosition = { x: event.data.x, y: event.data.y, z: event.data.z };
        });
    }
    
    handlePlayerMove(event) {
        if (!event.player || !event.player.uuid || event.player.isCurrentPlayer) return;
        
        const player = this.getOrCreatePlayer(event.player);
        if (!player) return;
        
        player.updatePosition(
            event.position.x,
            event.position.y,
            event.position.z,
            event.onGround,
            event.rotation?.yaw,
            event.rotation?.pitch
        );
        
        this.runChecks(player);
    }
    
    handlePlayerAction(event) {
        if (!event.player || !event.player.uuid || event.player.isCurrentPlayer) return;
        
        const player = this.getOrCreatePlayer(event.player);
        if (!player) return;
        
        if (event.type === 'swing') {
            player.swingProgress = 6;
            player.lastSwingTime = Date.now();
            player.lastSwingItem = player.heldItem;

        } else if (event.type === 'crouch') {
            const wasCrouching = player.isCrouching;
            player.isCrouching = event.value;
            const currentTime = Date.now();
            
            if (player.isCrouching && !wasCrouching) {
                player.lastCrouchTime = currentTime;
                player.currentShiftStart = currentTime;
                player.shiftEvents.push({
                    type: 'start',
                    timestamp: currentTime,
                    position: { ...player.position }
                });
                
                if (player.shiftEvents.length > 50) {
                    player.shiftEvents.shift();
                }
            } else if (!player.isCrouching && wasCrouching) {
                player.lastStopCrouchTime = currentTime;
                const duration = player.currentShiftStart ? currentTime - player.currentShiftStart : 0;
                player.shiftEvents.push({
                    type: 'stop',
                    timestamp: currentTime,
                    position: { ...player.position },
                    duration: duration
                });
                player.currentShiftStart = null;
                
                if (player.shiftEvents.length > 50) {
                    player.shiftEvents.shift();
                }
            }
            
            player.lastCrouching = player.isCrouching;
        } else if (event.type === 'sprint') {
            player.isSprinting = event.value;
            player.lastSprinting = player.isSprinting;
        }
        
        this.runChecks(player);
    }
    
    handlePlayerJoin(event) {
        this.api.debugLog(`Player joined: ${event.player.name}`);
    }
    
    handlePlayerLeave(event) {
        if (event.player && event.player.uuid) {
            this.removePlayerByUuid(event.player.uuid);
        }
    }
    
    getOrCreatePlayer(playerData) {
        let player = null;
        for (const [name, p] of this.players) {
            if (p.uuid === playerData.uuid || p.username === playerData.name) {
                player = p;
                break;
            }
        }
        
        if (!player) {
            player = new PlayerData(playerData.name, playerData.uuid, playerData.entityId || -1);
            player.displayName = playerData.displayName || playerData.name;
            this.players.set(playerData.name, player);
            if (playerData.entityId) {
                this.entityToPlayer.set(playerData.entityId, player);
            }
        }
        
        return player;
    }
    
    removePlayerByUuid(uuid) {
        for (const [name, player] of this.players) {
            if (player.uuid === uuid) {
                this.players.delete(name);
                for (const [entityId, p] of this.entityToPlayer) {
                    if (p.uuid === uuid) {
                        this.entityToPlayer.delete(entityId);
                        break;
                    }
                }
                break;
            }
        }
    }
    
    handlePlayerInfo(data) {
        if (data.action === 0) {
            data.data.forEach(player => {
                if (player.name && player.UUID) {
                    this.uuidToName.set(player.UUID, player.name);
                    let displayName = player.name;
                    if (player.displayName) {
                        try {
                            const parsed = JSON.parse(player.displayName);
                            displayName = this.extractTextFromJSON(parsed);
                        } catch (e) {
                            displayName = player.displayName;
                        }
                    }
                    this.uuidToDisplayName.set(player.UUID, displayName);
                }
            });
        }
    }
    
    handleEntitySpawn(data) {
        const playerName = this.uuidToName.get(data.playerUUID) || 'Unknown';
        const displayName = this.uuidToDisplayName.get(data.playerUUID) || playerName;
        const player = new PlayerData(playerName, data.playerUUID, data.entityId);
        
        player.displayName = displayName;
        
        player.updatePosition(
            data.x / 32.0,
            data.y / 32.0,
            data.z / 32.0,
            false
        );
        
        player.yaw = (data.yaw / 256.0) * 360.0;
        player.pitch = (data.pitch / 256.0) * 360.0;
        
        this.players.set(playerName, player);
        this.entityToPlayer.set(data.entityId, player);
        
        this.api.debugLog(`Player spawned: ${playerName} (${displayName}) - Entity ID: ${data.entityId}`);
    }
    
    handleEntityDestroy(data) {
        data.entityIds.forEach(entityId => {
            const player = this.entityToPlayer.get(entityId);
            if (player) {
                this.players.delete(player.username);
                this.entityToPlayer.delete(entityId);
            }
        });
    }
    
    handleEntityMetadata(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        data.metadata.forEach(entry => {
            if (entry.key === 0 && entry.type === 0) {
                const flags = entry.value;
                
                const wasUsingItem = player.isUsingItem;
                player.isUsingItem = !!(flags & 0x10);
                
                if (player.isUsingItem && !wasUsingItem && player.isHoldingSword()) {
                    player.isBlocking = true;
                    player.blockingStartTime = Date.now();
                } else if (!player.isUsingItem && wasUsingItem) {
                    player.isBlocking = false;
                }
                
                if (player.isUsingItem !== player.lastUsing) {
                    player.lastUsing = player.isUsingItem;
                    this.runChecks(player);
                }
            }
        });
    }
    
    handleEntityTeleport(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        const newYaw = (data.yaw / 256.0) * 360.0;
        const newPitch = (data.pitch / 256.0) * 360.0;
        
        player.updatePosition(
            data.x / 32.0,
            data.y / 32.0,
            data.z / 32.0,
            data.onGround || false,
            newYaw,
            newPitch
        );
        
        player.yaw = newYaw;
        player.pitch = newPitch;
    }
    
    handleEntityEquipment(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        if (data.slot === 0) {
            player.heldItem = data.item;
        }
    }
    
    handleEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) {
            player.hasJumpBoost = true;
        }
    }

    handleRemoveEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) {
            player.hasJumpBoost = false;
        }
    }
    
    handleEntityStatus(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.entityStatus === 2) {
            player.lastDamaged = Date.now();
        }
    }
    
    runChecks(player) {
        Object.keys(CHECKS).forEach(checkName => {
            const isEnabled = this.api.config.get(`checks.${checkName}.enabled`);
            if (!isEnabled) return;
            
            const checkDefinition = CHECKS[checkName];
            if (checkDefinition && checkDefinition.check) {
                const checkConfig = {
                    enabled: isEnabled,
                    vl: this.api.config.get(`checks.${checkName}.vl`),
                    cooldown: this.api.config.get(`checks.${checkName}.cooldown`),
                    sound: this.api.config.get(`checks.${checkName}.sound`)
                };
                checkDefinition.check.call(this, player, checkConfig);
            }
        });
    }
    
    flag(player, checkName, vl) {
        const cleanName = player.name || player.displayName?.replace(/§./g, '') || 'Unknown';
        
        const team = this.api.getPlayerTeam(cleanName);
        const prefix = team?.prefix || '';
        const suffix = team?.suffix || '';
        const displayName = prefix + cleanName + suffix;
        
        this.api.debugLog(`Flagging ${displayName} for ${checkName} (VL: ${vl})`);

        const alertsEnabled = this.api.config.get(`checks.${checkName}.enabled`);
        if (alertsEnabled) {
            const message = `${this.api.getPrefix()} ${displayName} §7flagged §5${checkName} §8(§7VL: ${vl}§8)`;
            this.api.chat(message);
        }
        
        const soundEnabled = this.api.config.get(`checks.${checkName}.sound`);
        if (soundEnabled) {
            this.api.sound('note.pling');
        }
    }
    
    cleanup() {
        if (this.unsubscribeRespawn) {
            this.unsubscribeRespawn();
        }
        if (this.unsubscribePlayerInfo) {
            this.unsubscribePlayerInfo();
        }
        if (this.unsubscribeEntitySpawn) {
            this.unsubscribeEntitySpawn();
        }
        if (this.unsubscribeEntityDestroy) {
            this.unsubscribeEntityDestroy();
        }
        if (this.unsubscribeEntityMetadata) {
            this.unsubscribeEntityMetadata();
        }
        if (this.unsubscribeEntityTeleport) {
            this.unsubscribeEntityTeleport();
        }
        if (this.unsubscribeEntityEquipment) {
            this.unsubscribeEntityEquipment();
        }
        if (this.unsubscribeEntityEffect) {
            this.unsubscribeEntityEffect();
        }
        if (this.unsubscribeRemoveEntityEffect) {
            this.unsubscribeRemoveEntityEffect();
        }
        if (this.unsubscribeEntityStatus) {
            this.unsubscribeEntityStatus();
        }
        if (this.unsubscribePosition) {
            this.unsubscribePosition();
        }
        if (this.unsubscribePositionLook) {
            this.unsubscribePositionLook();
        }
        this.reset();
    }
    
    extractTextFromJSON(jsonText) {
        if (typeof jsonText === 'string') {
            return jsonText;
        }
        
        let result = '';
        
        if (jsonText.text) {
            result += jsonText.text;
        }
        
        if (jsonText.extra && Array.isArray(jsonText.extra)) {
            for (const extra of jsonText.extra) {
                if (typeof extra === 'string') {
                    result += extra;
                } else if (extra.text) {
                    result += extra.text;
                }
            }
        }
        
        return result || 'Unknown';
    }
    
    addViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] += amount;
        }
    }
    
    reduceViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] = Math.max(0, player.violations[checkName] - amount);
        }
    }
    
    shouldAlert(player, checkName, config) {
        const hasViolations = player.violations[checkName] >= config.vl;
        const timeSinceLastAlert = Date.now() - player.lastAlerts[checkName];
        const cooldownPassed = timeSinceLastAlert > config.cooldown;
        
        return hasViolations && cooldownPassed;
    }
    
    markAlert(player, checkName) {
        if (player.lastAlerts[checkName] !== undefined) {
            player.lastAlerts[checkName] = Date.now();
        }
    }
} 