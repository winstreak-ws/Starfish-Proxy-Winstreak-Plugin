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

    api.commands((registry) => {
    });
    
    anticheat.registerHandlers();
    return anticheat;
};


// NoSlowA, AutoBlockA, EagleA, and TowerA should be working well- ScaffoldA might work and ScaffoldB does not. getAverageSpeed breaks often and inflates numbers.
// TODO: fix getAverageSpeed, add damage tick check for TowerA, refine scaffold checks


const CHECKS = {
    NoSlowA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects moving too fast while using items that should slow you down (eating food, drawing bow, blocking sword)." 
        },
        
        check: function(player, config) {
            // detect moving too fast while using an item that should cause slowdown
            const currentSpeed = player.getMovementDistance();
            const isUsingSlowdownItem = player.isUsingItem && (player.isHoldingConsumable() || player.isHoldingBow() || player.isHoldingSword());
            
            // threshold for detecting NoSlow - normal walking speed is ~0.2, so anything above 0.15 while using slowdown items is suspicious
            const suspiciousSpeed = 0.15;
            
            if (isUsingSlowdownItem && currentSpeed > suspiciousSpeed) {
                this.addViolation(player, 'NoSlowA');
                
                if (this.shouldAlert(player, 'NoSlowA', config)) {
                    this.flag(player, 'NoSlowA', player.violations.NoSlowA);
                    this.markAlert(player, 'NoSlowA');
                }
            } else {
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
            // detect swinging while using sword
            if (player.isUsingItem && player.swingProgress > 0 && player.isHoldingSword()) {
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
            // detect double-shifting during diagonal bridging (legit scaffold)
            const moveDistance = player.getMovementDistance();
            
            if (moveDistance < 0.03 || player.shiftEvents.length < 6) {
                this.reduceViolation(player, 'ScaffoldA');
                return;
            }
            
            const lookingDown = player.pitch >= 30;
            const isDiagonal = player.isDiagonalMovement();
            const hasRecentSwing = player.hasRecentSwing(20);
            const swungBlock = player.lastSwingWasBlock();

            let flagged = false;
            if (lookingDown && isDiagonal && player.onGround && swungBlock && hasRecentSwing) {
                
                const veryRecentShifts = player.hasRecentShiftEvents(15);
                
                if (veryRecentShifts.length >= 3) {
                    let totalDistance = 0;
                    for (let i = 1; i < veryRecentShifts.length; i++) {
                        const prev = veryRecentShifts[i-1].position;
                        const curr = veryRecentShifts[i].position;
                        const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.z - prev.z, 2));
                        totalDistance += dist;
                    }
                    
                    const shiftsPerBlock = veryRecentShifts.length / Math.max(totalDistance, 0.5);
                    const isActivelyDoubleShifting = shiftsPerBlock > 1.25;
                    
                    const mostRecentShift = Math.max(...veryRecentShifts.map(s => s.tick));
                    const wasRecentShift = (player.ticksExisted - mostRecentShift) <= 5;
                    
                    if (isActivelyDoubleShifting && wasRecentShift) {
                        this.addViolation(player, 'EagleA', 2);
                        
                        if (this.shouldAlert(player, 'EagleA', config)) {
                            this.flag(player, 'EagleA', player.violations.EagleA);
                            this.markAlert(player, 'EagleA');
                        }
                        flagged = true;
                    }
                }
            }

            if (!flagged) {
                this.reduceViolation(player, 'EagleA');
            }
        }
    },
    
    ScaffoldA: {
        config: { 
            enabled: true, sound: true, vl: 15, cooldown: 2000, 
            description: "Detects fast scaffold with no height change" 
        },

        check: function(player, config) {
            // check if moving over 5 blocks per second
            const avgSpeedPerSecond = player.getAverageSpeed(10);
            const fastMovement = avgSpeedPerSecond > 5;

            // this.api.debugLog(`  Average Speed: ${avgSpeedPerSecond} blocks/s`);
            
            // check if looking down (more than 25 pitch)
            const lookingDown = player.pitch > 25;
            
            // check if placing blocks
            const hasRecentSwing = player.hasRecentSwing(10);
            const swungBlock = player.lastSwingWasBlock();
            const placingBlocks = hasRecentSwing && swungBlock;
            
            // check if y level is NOT changing
            const yNotChanging = player.getYVariance(10) < 0.1;
            
            if (fastMovement && lookingDown && placingBlocks && yNotChanging && !player.isCrouching) {
                this.addViolation(player, 'ScaffoldA', 2);
                
                if (this.shouldAlert(player, 'ScaffoldA', config)) {
                    this.flag(player, 'ScaffoldA', player.violations.ScaffoldA);
                    this.markAlert(player, 'ScaffoldA');
                }
            } else {
                this.reduceViolation(player, 'ScaffoldA');
            }
        }
    },
    
    ScaffoldB: {
        config: { 
            enabled: true, sound: true, vl: 15, cooldown: 2000, 
            description: "Detects keep-y scaffold" 
        },

        check: function(player, config) {
            // check if moving over 6 blocks per second
            const avgSpeedPerSecond = player.getAverageSpeed(10);
            const fastMovement = avgSpeedPerSecond > 6;
            
            // check if looking down (more than 25 pitch)
            const lookingDown = player.pitch > 25;
            
            // check if placing blocks
            const hasRecentSwing = player.hasRecentSwing(10);
            const swungBlock = player.lastSwingWasBlock();
            const placingBlocks = hasRecentSwing && swungBlock;
            
            // check if height fluctuates but does NOT increase (keep-y)
            const keepY = player.isKeepYBehavior(15);
            
            if (fastMovement && lookingDown && placingBlocks && keepY && !player.isCrouching) {
                this.addViolation(player, 'ScaffoldB');
                
                if (this.shouldAlert(player, 'ScaffoldB', config)) {
                    this.flag(player, 'ScaffoldB', player.violations.ScaffoldB);
                    this.markAlert(player, 'ScaffoldB');
                }
            } else {
                this.reduceViolation(player, 'ScaffoldB');
            }
        }
    },
    
    TowerA: {
        config: { 
            enabled: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects ascending (towering) faster than normal while placing blocks below." 
        },
        
        check: function(player, config) {
            // detect towering up too fast
            if (player.hasJumpBoost) {
                return;
            }
            
            if (player.pitch < 30) {
                this.reduceViolation(player, 'TowerA');
                return;
            }

            if (player.previousPositions.length < 6) {
                return;
            }

            const hasRecentSwing = player.hasRecentSwing(5);
            const swungBlock = player.lastSwingWasBlock();

            if (!hasRecentSwing || !swungBlock) {
                return;
            }

            const verticalSpeed = player.getVerticalSpeed(6);
            const isToweringSpeed = verticalSpeed > 0.5;

            if (isToweringSpeed) {
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
        this.previousPositions = [];
        this.onGround = true;
        this.lastOnGround = true;
        
        this.yaw = 0;
        this.pitch = 0;
        
        this.isCrouching = false;
        this.lastCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.swingProgress = 0;
        
        this.ticksExisted = 0;
        this.lastSwingTick = 0;
        this.lastCrouchTick = 0;
        this.lastStopCrouchTick = 0;
        
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
    }
    
    updatePosition(x, y, z, onGround, yaw = null, pitch = null) {
        this.lastPosition = { ...this.position };
        this.position = { x, y, z };
        this.onGround = onGround;
        
        if (yaw !== null) this.yaw = yaw;
        if (pitch !== null) this.pitch = pitch;
        
        const posData = { x, y, z, tick: this.ticksExisted, onGround };
        posData.yaw = this.yaw;
        posData.pitch = this.pitch;
        
        this.previousPositions.push(posData);
        if (this.previousPositions.length > 20) {
            this.previousPositions.shift();
        }
        
        this.lastOnGround = onGround;
    }
    
    getMoveYaw() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;

        if (Math.sqrt(dx * dx + dz * dz) < 0.03) { 
            return null;
        }

        const moveAngle = -Math.atan2(dx, dz) * (180 / Math.PI);

        let diff = this.yaw - moveAngle;

        diff = ((diff % 360) + 540) % 360 - 180;
        
        return diff;
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
    
    isHoldingBlock() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        return this.heldItem.blockId < 256 && this.heldItem.blockId > 0;
    }
    
    lastSwingWasBlock() {
        if (!this.lastSwingItem || !this.lastSwingItem.blockId) return false;
        return this.lastSwingItem.blockId < 256 && this.lastSwingItem.blockId > 0;
    }
    
    hasRecentSwing(maxTicks = 10) {
        return this.ticksExisted - this.lastSwingTick <= maxTicks;
    }
    
    hasRecentShiftEvents(maxTicks = 15) {
        return this.shiftEvents.filter(e => 
            e.type === 'start' && (this.ticksExisted - e.tick) <= maxTicks
        );
    }
    
    getMovementDistance() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    isDiagonalMovement() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;
        const absX = Math.abs(dx);
        const absZ = Math.abs(dz);
        return absX > 0.015 && absZ > 0.015 && Math.abs(absX - absZ) < Math.min(absX, absZ) * 0.3;
    }
    
    getAverageSpeed(sampleSize = 15) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        let totalSpeed = 0;
        let speedSamples = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
            const current = recentPositions[i];
            const previous = recentPositions[i - 1];
            if (current.x !== undefined && previous.x !== undefined && 
                current.z !== undefined && previous.z !== undefined) {
                const dx = current.x - previous.x;
                const dz = current.z - previous.z;
                const speed2D = Math.sqrt(dx * dx + dz * dz);
                totalSpeed += speed2D;
                speedSamples++;
            }
        }
        
        const avgSpeedPerTick = speedSamples > 0 ? totalSpeed / speedSamples : 0;
        return avgSpeedPerTick * 10;
    }
    
    getVerticalSpeed(ticksBack = 6) {
        if (this.previousPositions.length < ticksBack) {
            return 0;
        }
        
        const currentPos = this.position;
        const pastPos = this.previousPositions[this.previousPositions.length - ticksBack];
        const ticksElapsed = this.ticksExisted - pastPos.tick;
        
        if (ticksElapsed <= 0) return 0;
        
        const deltaY = currentPos.y - pastPos.y;
        return deltaY / ticksElapsed;
    }
    
    isBackwardMovement() {
        const moveYaw = this.getMoveYaw();
        return moveYaw !== null && Math.abs(moveYaw) >= 90;
    }
    
    hasSignificantVerticalMovement(threshold = 1) {
        if (this.previousPositions.length < 2) return false;
        const firstPos = this.previousPositions[this.previousPositions.length - 1];
        const lastPos = this.previousPositions[0];
        return Math.abs(lastPos.y - firstPos.y) > threshold;
    }
    
    getYVariance(sampleSize = 10) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        if (recentPositions.length < 2) return 0;
        
        const yValues = recentPositions.map(pos => pos.y);
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        const variance = yValues.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / yValues.length;
        
        return Math.sqrt(variance);
    }
    
    isKeepYBehavior(sampleSize = 15) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        if (recentPositions.length < 5) return false;
        
        const yValues = recentPositions.map(pos => pos.y);
        const firstY = yValues[0];
        const lastY = yValues[yValues.length - 1];
        
        // check if there's no net height gain (within small tolerance)
        const noNetGain = Math.abs(lastY - firstY) < 0.2;
        
        // check if there's fluctuation (variance indicating jumping movement)
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        const variance = yValues.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / yValues.length;
        const hasFluctuation = Math.sqrt(variance) > 0.1;
        
        return noNetGain && hasFluctuation;
    }
    
    tick() {
        this.ticksExisted++;
        if (this.swingProgress > 0) {
            this.swingProgress--;
        }
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
        player.tick();
    }
    
    handlePlayerAction(event) {
        if (!event.player || !event.player.uuid || event.player.isCurrentPlayer) return;
        
        const player = this.getOrCreatePlayer(event.player);
        if (!player) return;
        
        if (event.type === 'swing') {
            player.swingProgress = 6;
            player.lastSwingTick = player.ticksExisted;
            player.lastSwingItem = player.heldItem;
        } else if (event.type === 'crouch') {
            const wasCrouching = player.isCrouching;
            player.isCrouching = event.value;
            
            if (player.isCrouching && !wasCrouching) {
                player.lastCrouchTick = player.ticksExisted;
                player.currentShiftStart = player.ticksExisted;
                player.shiftEvents.push({
                    type: 'start',
                    tick: player.ticksExisted,
                    position: { ...player.position }
                });
                
                if (player.shiftEvents.length > 50) {
                    player.shiftEvents.shift();
                }
            } else if (!player.isCrouching && wasCrouching) {
                player.lastStopCrouchTick = player.ticksExisted;
                const duration = player.currentShiftStart ? player.ticksExisted - player.currentShiftStart : 0;
                player.shiftEvents.push({
                    type: 'stop',
                    tick: player.ticksExisted,
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
                
                player.isUsingItem = !!(flags & 0x10);
                
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
        
        // slot 0 = held item, 1-4 = armor (boots, leggings, chestplate, helmet)
        if (data.slot === 0) {
            player.heldItem = data.item;
        }
    }
    
    handleEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) { // jump boost
            player.hasJumpBoost = true;
        }
    }

    handleRemoveEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) { // jump boost
            player.hasJumpBoost = false;
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
        this.api.debugLog(`Flagging ${player.displayName} for ${checkName} (VL: ${vl})`);

        const alertsEnabled = this.api.config.get(`checks.${checkName}.enabled`);
        if (alertsEnabled) {
            const message = `${this.api.getPrefix()} ${player.displayName} §7flagged §c${checkName} §8(§7VL: ${vl}§8)`;
            this.api.chat(message);
        }
        
        const soundEnabled = this.api.config.get(`checks.${checkName}.sound`);
        if (soundEnabled && this.userPosition) {
            this.api.sound('note.pling', this.userPosition.x, this.userPosition.y, this.userPosition.z, 1.0, 1.0);
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