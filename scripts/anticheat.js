// Advanced Anticheat System
// Adapted from Pug's Custom Anticheat Raven script (github.com/PugrillaDev)

const PLUGIN_INFO = {
    name: 'anticheat',
    displayName: 'Anticheat',
    version: '1.0.0',
    description: 'Advanced cheater detector system (Inspired by github.com/PugrillaDev)'
};

const DEFAULT_CHECKS_CONFIG = {
    NoSlowA: { enabled: true, alerts: true, sound: true, vl: 15, cooldown: 2000, description: "Detects sprinting while using items that should slow you down (eating food, drawing bow, blocking sword)." },
    AutoBlockA: { enabled: true, alerts: true, sound: true, vl: 15, cooldown: 2000, description: "Detects attacking while blocking with a sword." },
    RotationA: { enabled: true, alerts: true, sound: true, vl: 20, cooldown: 2000, description: "Detects impossible head/body rotations (invalid pitch)." },
    ScaffoldA: { enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, description: "Detects diagonal double-shifting legit scaffold patterns." },
    ScaffoldB: { enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, description: "Detects blatant scaffold (fast movement & snappy rotations" },
    ScaffoldC: { enabled: true, alerts: true, sound: true, vl: 5, cooldown: 2000, description: "Detects high-speed backward bridging with air time (typical of keep-y)" },
    TowerA: { enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, description: "Detects ascending (towering) faster than normal while placing blocks below." }
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
        
        this.violations = {
            NoSlowA: 0,
            AutoBlockA: 0,
            RotationA: 0,
            ScaffoldA: 0,
            ScaffoldB: 0,
            ScaffoldC: 0,
            TowerA: 0
        };
        
        this.lastAlerts = {
            NoSlowA: 0,
            AutoBlockA: 0,
            RotationA: 0,
            ScaffoldA: 0,
            ScaffoldB: 0,
            ScaffoldC: 0,
            TowerA: 0
        };
        
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
        const swordIds = [267, 268, 272, 276, 283]; // wood, stone, iron, diamond, gold swords in 1.8.9
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
}

class AnticheatSystem {
    constructor(proxyAPI) {
        this.proxyAPI = proxyAPI;
        this.players = new Map();
        this.entityToPlayer = new Map();
        this.uuidToName = new Map();
        this.uuidToDisplayName = new Map();
        this.userPosition = null;
        
        // Dynamic plugin prefix using proxy prefix
        this.PLUGIN_PREFIX = `§8[${this.proxyAPI.proxyPrefix}§8-§cAC§8]§r`;
        
        this.config = {
            checks: JSON.parse(JSON.stringify(DEFAULT_CHECKS_CONFIG)),
            debug: false,
        };
        
        this.registerHandlers();
    }
    
    saveConfig() {
        // In a real scenario, this would save to a file.
        // For now, it's just in-memory.
        console.log('[Anticheat] Config updated.');
    }
    
    registerHandlers() {
        this.proxyAPI.on('serverPacketMonitor', ({ username, player, data, meta }) => {
            if (!player || !this.proxyAPI.isPluginEnabled('anticheat')) return;
            
            switch (meta.name) {
                case 'player_info':
                    this.handlePlayerInfo(data);
                    break;
                case 'named_entity_spawn':
                    this.handleEntitySpawn(data);
                    break;
                case 'entity_destroy':
                    this.handleEntityDestroy(data);
                    break;
                case 'entity_metadata':
                    this.handleEntityMetadata(data);
                    break;
                case 'animation':
                    this.handleAnimation(data);
                    break;
                case 'rel_entity_move':
                case 'entity_move_look':
                case 'entity_look':
                    this.handleEntityMove(data, meta.name);
                    break;
                case 'entity_teleport':
                    this.handleEntityTeleport(data);
                    break;
                case 'entity_equipment':
                    this.handleEntityEquipment(data);
                    break;
                case 'entity_effect':
                    this.handleEntityEffect(data);
                    break;
                case 'remove_entity_effect':
                    this.handleRemoveEntityEffect(data);
                    break;
            }
        });
        
        this.proxyAPI.on('clientPacketMonitor', ({ username, player, data, meta }) => {
            if (!player) return;
            
            if (meta.name === 'position' || meta.name === 'position_look') {
                this.userPosition = { x: data.x, y: data.y, z: data.z };
            }
        });
        
        this.proxyAPI.on('playerLeave', ({ username, player }) => {
            this.players.clear();
            this.entityToPlayer.clear();
            this.uuidToName.clear();
            this.uuidToDisplayName.clear();
        });
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
        
        console.debug(`[Anticheat] Player spawned: ${playerName} (${displayName}) - Entity ID: ${data.entityId}`);
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
                player.isCrouching = !!(flags & 0x02);
                player.isSprinting = !!(flags & 0x08);
                player.isUsingItem = !!(flags & 0x10);
                
                if (player.isCrouching && !player.lastCrouching) {
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
                    
                    this.runChecks(player);
                }
                if (!player.isCrouching && player.lastCrouching) {
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
                    
                    this.runChecks(player);
                }
                
                player.lastCrouching = player.isCrouching;
                player.lastSprinting = player.isSprinting;
                player.lastUsing = player.isUsingItem;
            }
        });
    }
    
    handleAnimation(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        if (data.animation === 0) {
            player.swingProgress = 6;
            player.lastSwingTick = player.ticksExisted;
            player.lastSwingItem = player.heldItem;
        }
    }
    
    handleEntityMove(data, packetType) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        let newYaw = null, newPitch = null;
        let positionChanged = false;
        
        if (packetType === 'entity_look' || packetType === 'entity_move_look') {
            newYaw = (data.yaw / 256.0) * 360.0;
            newPitch = (data.pitch / 256.0) * 360.0;
            player.yaw = newYaw;
            player.pitch = newPitch;
        }
        
        if (packetType === 'rel_entity_move' || packetType === 'entity_move_look') {
            const newX = player.position.x + (data.dX / 32.0);
            const newY = player.position.y + (data.dY / 32.0);
            const newZ = player.position.z + (data.dZ / 32.0);
            player.updatePosition(newX, newY, newZ, data.onGround || false, newYaw, newPitch);
            positionChanged = true;
        }

        if (!positionChanged && (newYaw !== null || newPitch !== null)) {
            player.updatePosition(player.position.x, player.position.y, player.position.z, player.onGround, newYaw, newPitch);
        }
        
        this.runChecks(player);
        
        player.ticksExisted++;
        if (player.swingProgress > 0) {
            player.swingProgress--;
        }
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
        if (!this.proxyAPI.isPluginEnabled('anticheat')) return;
        
        Object.entries(this.config.checks).forEach(([checkName, checkConfig]) => {
            if (!checkConfig.enabled) return;
            
            switch (checkName) {
                case 'NoSlowA':
                    this.checkNoSlowA(player, checkConfig);
                    break;
                case 'AutoBlockA':
                    this.checkAutoBlockA(player, checkConfig);
                    break;
                case 'RotationA':
                    this.checkRotationA(player, checkConfig);
                    break;
                case 'ScaffoldA':
                    this.checkScaffoldA(player, checkConfig);
                    break;
                case 'ScaffoldB':
                    this.checkScaffoldB(player, checkConfig);
                    break;
                case 'ScaffoldC':
                    this.checkScaffoldC(player, checkConfig);
                    break;
                case 'TowerA':
                    this.checkTowerA(player, checkConfig);
                    break;
            }
        });
    }
    
    checkNoSlowA(player, config) {
        // detect sprinting while using an item that should cause slowdown
        if (player.isSprinting && player.isUsingItem && (player.isHoldingConsumable() || player.isHoldingBow() || player.isHoldingSword())) {
            player.violations.NoSlowA++;
    
            if (player.violations.NoSlowA >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.NoSlowA;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'NoSlowA', player.violations.NoSlowA);
                    player.lastAlerts.NoSlowA = Date.now();
                }
            }
        } else {
            player.violations.NoSlowA = Math.max(0, player.violations.NoSlowA - 1);
        }
    }
    
    checkAutoBlockA(player, config) {
        // detect swinging while using sword
        if (player.isUsingItem && player.swingProgress > 0 && player.isHoldingSword()) {
            player.violations.AutoBlockA++;
            
            if (player.violations.AutoBlockA >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.AutoBlockA;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'AutoBlockA', player.violations.AutoBlockA);
                    player.lastAlerts.AutoBlockA = Date.now();
                }
            }
        } else {
            player.violations.AutoBlockA = Math.max(0, player.violations.AutoBlockA - 1);
        }
    }
    
    checkRotationA(player, config) {
        // detect invalid pitch values
        if (Math.abs(player.pitch) > 90) {
            player.violations.RotationA++;
            
            if (player.violations.RotationA >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.RotationA;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'RotationA', player.violations.RotationA);
                    player.lastAlerts.RotationA = Date.now();
                }
            }
        } else {
            player.violations.RotationA = Math.max(0, player.violations.RotationA - 1);
        }
    }
    
    checkScaffoldA(player, config) {
        // detect double-shifting during diagonal bridging (legit scaffold)
        const lookingDown = player.pitch >= 70;

        const dx = player.position.x - player.lastPosition.x;
        const dz = player.position.z - player.lastPosition.z;
        const moveDistance = Math.sqrt(dx * dx + dz * dz);
        
        if (moveDistance < 0.03 || player.shiftEvents.length < 6) {
            player.violations.ScaffoldB = Math.max(0, player.violations.ScaffoldB - 1);
            return;
        }
        
        const absX = Math.abs(dx);
        const absZ = Math.abs(dz);
        const isDiagonal = absX > 0.015 && absZ > 0.015 && Math.abs(absX - absZ) < Math.min(absX, absZ) * 0.3;
        const timeSinceLastSwing = player.ticksExisted - player.lastSwingTick;
        const swungBlock = player.lastSwingWasBlock();

        let flagged = false;
        if (lookingDown && isDiagonal && player.onGround && swungBlock && timeSinceLastSwing <= 20) {
            
            const veryRecentShifts = player.shiftEvents.filter(e => 
                e.type === 'start' && (player.ticksExisted - e.tick) <= 15
            );
            
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
                    player.violations.ScaffoldA += 2;
            if (player.violations.ScaffoldA >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.ScaffoldA;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'ScaffoldA', player.violations.ScaffoldA);
                    player.lastAlerts.ScaffoldA = Date.now();
                }
            }
                    flagged = true;
                }
            }
        }

        if (!flagged) {
            player.violations.ScaffoldA = Math.max(0, player.violations.ScaffoldA - 1);
        }
    }
    
    checkScaffoldB(player, config) {
        // detect scaffold auto-aim behavior
        const recentSwing = player.ticksExisted - player.lastSwingTick <= 10;
        const lookingDown = player.pitch >= 70;
        const swungBlock = player.lastSwingWasBlock();
        const notShifting = !player.isCrouching;
        const notRecentlyShifted = player.ticksExisted - player.lastStopCrouchTick > 100;
        
        if (!recentSwing || !lookingDown || !swungBlock || !notShifting || !notRecentlyShifted) {
            player.violations.ScaffoldB = Math.max(0, player.violations.ScaffoldB - 1);
            return;
        }
        
        const recentOnGroundData = player.previousPositions.slice(-10);
        let airTime = 0;
        let groundTime = 0;
        
        for (const pos of recentOnGroundData) {
            if (pos.onGround !== undefined) {
                if (pos.onGround) {
                    groundTime++;
                } else {
                    airTime++;
                }
            }
        }
        
        const totalTime = airTime + groundTime;
        const airRatio = totalTime > 0 ? airTime / totalTime : 0;
        const isGrounded = airRatio <= 0.3;
        
        if (!isGrounded) {
            player.violations.ScaffoldB = Math.max(0, player.violations.ScaffoldB - 1);
            return;
        }
        
        const recentPositions = player.previousPositions.slice(-10);
        let microRotations = 0;
        let totalRotations = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
            const prev = recentPositions[i-1];
            const curr = recentPositions[i];
            
            if (prev.yaw !== undefined && curr.yaw !== undefined) {
                let yawDiff = Math.abs(curr.yaw - prev.yaw);
                if (yawDiff > 180) yawDiff = 360 - yawDiff;
                
                if (yawDiff > 0.1) {
                    totalRotations++;
                }
                
                if (yawDiff >= 0.5 && yawDiff <= 25) {
                    microRotations++;
                }
            }
        }
        
        if (microRotations >= 2) {
            player.violations.ScaffoldB += 2;
            
            if (player.violations.ScaffoldB >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.ScaffoldB;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'ScaffoldB', player.violations.ScaffoldB);
                    player.lastAlerts.ScaffoldB = Date.now();
                }
            }
        } else if (totalRotations == 0) {
            player.violations.ScaffoldB = Math.max(0, player.violations.ScaffoldB - 1);
        }
    }

    checkScaffoldC(player, config) {
        // detect scaffold keep-y behavior
        const lookingDown = player.pitch >= 70;
        const moveYaw = player.getMoveYaw();
        const ticksExisted = player.ticksExisted;
        const lastSwing = player.lastSwingTick;
        const lastStartCrouch = player.lastCrouchTick;
        const lastStopCrouch = player.lastStopCrouchTick;
        
        const recentSwing = ticksExisted - lastSwing <= 10;
        const crouchCondition = lastStopCrouch >= lastStartCrouch;
        const longSinceUncrouch = ticksExisted - lastStopCrouch > 30;
        const backwardMovement = Math.abs(moveYaw) >= 90;
        const hasPositionHistory = player.previousPositions.length >= 20;
        const swungBlock = player.lastSwingWasBlock();
        
        if (lookingDown && recentSwing && swungBlock && crouchCondition && longSinceUncrouch && backwardMovement && hasPositionHistory) {
            const firstPos = player.previousPositions[player.previousPositions.length - 1];
            const lastPos = player.previousPositions[0];
            const verticalMovement = Math.abs(lastPos.y - firstPos.y);
            
            if (verticalMovement > 1) {
                player.violations.ScaffoldC = Math.max(0, player.violations.ScaffoldC - 1);
                return;
            }
            
            const recentPositions = player.previousPositions.slice(-15);
            let airTime = 0;
            let groundTime = 0;
            
            for (const pos of recentPositions) {
                if (pos.onGround !== undefined) {
                    if (pos.onGround) {
                        groundTime++;
                    } else {
                        airTime++;
                    }
                }
            }
            
            const totalTime = airTime + groundTime;
            const airRatio = totalTime > 0 ? airTime / totalTime : 0;
            const isBridging = airRatio > 0.2;
            
            if (!isBridging) {
                player.violations.ScaffoldC = Math.max(0, player.violations.ScaffoldC - 2);
                return;
            }

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
            const avgSpeedPerSecond = avgSpeedPerTick * 20;

            const highSpeedCheck = avgSpeedPerSecond > 5;
            
            if (!highSpeedCheck) {
                player.violations.ScaffoldC = Math.max(0, player.violations.ScaffoldC - 1);
                return;
            }
            
            const dx = lastPos.x - firstPos.x;
            const dz = lastPos.z - firstPos.z;
            const totalDistance = Math.sqrt(dx * dx + dz * dz);
            
            const distanceCheck = totalDistance > 3.4;
            
            if (this.config.debug) {
                console.log(`${player.username} ScaffoldC: speed=${avgSpeedPerSecond.toFixed(2)}b/s, distance=${totalDistance.toFixed(2)}, airRatio=${airRatio.toFixed(2)}, highSpeed=${highSpeedCheck}, distanceOK=${distanceCheck}`);
            }
            
            if (distanceCheck) {
                player.violations.ScaffoldC++;
                
                if (player.violations.ScaffoldC >= config.vl) {
                    const timeSinceLastAlert = Date.now() - player.lastAlerts.ScaffoldC;
                    if (timeSinceLastAlert > config.cooldown) {
                        this.flag(player, 'ScaffoldC', player.violations.ScaffoldC);
                        player.lastAlerts.ScaffoldC = Date.now();
                    }
                }
            } else {
                player.violations.ScaffoldC = Math.max(0, player.violations.ScaffoldC - 1);
            }
        } else {
            player.violations.ScaffoldC = Math.max(0, player.violations.ScaffoldC - 1);
        }
    }
    
    checkTowerA(player, config) {
        // detect towering up too fast
        if (player.hasJumpBoost) {
            return;
        }
        
        const lookingDown = player.pitch >= 70;
        if (!lookingDown) {
            player.violations.TowerA = Math.max(0, player.violations.TowerA - 1);
            return;
        }

        if (player.previousPositions.length < 6) {
            return;
        }

        const recentSwing = player.ticksExisted - player.lastSwingTick <= 5;
        const swungBlock = player.lastSwingWasBlock();

        if (!recentSwing || !swungBlock) {
            return;
        }

        const currentPos = player.position;
        const pastPos = player.previousPositions[player.previousPositions.length - 6];
        const ticksElapsed = player.ticksExisted - pastPos.tick;

        if (ticksElapsed <= 0) return;

        const deltaY = currentPos.y - pastPos.y;
        const verticalSpeed = deltaY / ticksElapsed;

        const isToweringSpeed = verticalSpeed > 0.5;

        if (isToweringSpeed) {
            player.violations.TowerA += 2;
            if (player.violations.TowerA >= config.vl) {
                const timeSinceLastAlert = Date.now() - player.lastAlerts.TowerA;
                if (timeSinceLastAlert > config.cooldown) {
                    this.flag(player, 'TowerA', player.violations.TowerA);
                    player.lastAlerts.TowerA = Date.now();
                }
            }
        } else {
            player.violations.TowerA = Math.max(0, player.violations.TowerA - 1);
        }
    }
    
    flag(player, checkName, vl) {
        const checkConfig = this.config.checks[checkName];
        if (!checkConfig) return;

        const currentPlayer = this.proxyAPI.currentPlayer;
        if (!currentPlayer) return;

        console.debug(`[Anticheat] Flagging ${player.displayName} for ${checkName} (VL: ${vl})`);

        if (checkConfig.alerts) {
            const message = `${this.PLUGIN_PREFIX} ${player.displayName} §7flagged §c${checkName} §8(§7VL: ${vl}§8)`;
            this.proxyAPI.sendChatMessage(currentPlayer.client, message);
        }
        
        if (checkConfig.sound && this.userPosition) {
            this.proxyAPI.sendToClient('named_sound_effect', {
                soundName: 'note.pling',
                x: this.userPosition.x * 8,
                y: this.userPosition.y * 8,
                z: this.userPosition.z * 8,
                volume: 1.0,
                pitch: 63
            });
        }
    }
}


module.exports = (proxyAPI) => {
    const anticheat = new AnticheatSystem(proxyAPI);

    proxyAPI.registerPlugin(PLUGIN_INFO);

    const buildConfigSchema = () => {
        const schema = [];
        
        const pluginEnabled = proxyAPI.isPluginEnabled('anticheat');

        schema.push({
            label: 'Plugin',
            resetAll: true,
            defaults: { enabled: true, debug: false },
            settings: [
                {
                    key: 'enabled',
                    type: 'toggle',
                    text: ['DISABLED', 'ENABLED'],
                    description: 'Globally enables or disables the Anticheat plugin.'
                },
                {
                    key: 'debug',
                    type: 'toggle',
                    displayLabel: 'Debug',
                    description: 'Toggles verbose logging for the anticheat system.'
                }
            ]
        });

        for (const checkName in DEFAULT_CHECKS_CONFIG) {
            const defaultCheckConfig = DEFAULT_CHECKS_CONFIG[checkName];
            
            schema.push({
                label: checkName,
                isEnabled: (cfg) => pluginEnabled && cfg.checks[checkName].enabled,
                defaults: defaultCheckConfig,
                settings: [
                    {
                        type: 'toggle',
                        key: `checks.${checkName}.enabled`,
                        text: ['OFF', 'ON'],
                        description: `Enables or disables the ${checkName} check.`
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
                            { text: ['(VL: ', '5', ')'], value: 5 },
                            { text: ['(VL: ', '10', ')'], value: 10 },
                            { text: ['(VL: ', '15', ')'], value: 15 },
                            { text: ['(VL: ', '20', ')'], value: 20 },
                            { text: ['(VL: ', '30', ')'], value: 30 }
                        ],
                        condition: (cfg) => cfg.checks[checkName].enabled,
                        description: 'Sets the violation level to trigger an alert.'
                    },
                    {
                        type: 'cycle',
                        key: `checks.${checkName}.cooldown`,
                        values: [
                            { text: ['(CD: ', '1s', ')'], value: 1000 },
                            { text: ['(CD: ', '2s', ')'], value: 2000 },
                            { text: ['(CD: ', '5s', ')'], value: 5000 }
                        ],
                        condition: (cfg) => cfg.checks[checkName].enabled,
                        description: 'Sets the cooldown between alerts for this check.'
                    }
                ]
            });
        }
        return schema;
    };


    proxyAPI.registerCommands('anticheat', (registry) => {
        
        registry.registerConfig({
            displayName: PLUGIN_INFO.displayName,
            configObject: anticheat.config,
            schemaBuilder: buildConfigSchema,
            saveHandler: () => anticheat.saveConfig()
        });
    });

    return PLUGIN_INFO;
};
