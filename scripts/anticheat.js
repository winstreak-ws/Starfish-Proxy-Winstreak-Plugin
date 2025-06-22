// Advanced Anticheat System
// Adapted from Pug's Custom Anticheat Raven script (github.com/PugrillaDev)

module.exports = (api) => {
    api.metadata({
        name: 'anticheat',
        displayName: 'Anticheat',
        prefix: '§cAC',
        version: '0.0.5',
        author: 'Hexze',
        description: 'Advanced cheater detector system (Inspired by github.com/PugrillaDev)'
    });

    api.initializeConfig(generateConfigSchema());
    const anticheat = new AnticheatSystem(api);

    api.commands((registry) => {
        registry.registerConfig({
            displayName: 'Anticheat',
            configObject: api.getConfig(),
            schemaBuilder: () => generateConfigSchema(),
            saveHandler: () => api.saveCurrentConfig()
        });
    });

    api.on('playerMove', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerMove(data);
    });

    api.on('playerSwing', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerSwing(data);
    });

    api.on('playerCrouch', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerCrouch(data);
    });

    api.on('playerSprint', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerSprint(data);
    });

    api.on('playerUseItem', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerUseItem(data);
    });

    api.on('playerHeldItemChange', (data) => {
        if (!api.isEnabled()) return;
        anticheat.onPlayerHeldItemChange(data);
    });

    api.on('tick', () => {
        if (!api.isEnabled()) return;
        anticheat.onTick();
    });

    return anticheat;
};

const generateConfigSchema = () => {
    const schema = [];
    const checkDefinitions = getCheckDefinitions();
    
    for (const checkName in checkDefinitions) {
        const defaultCheckConfig = checkDefinitions[checkName];
            
        schema.push({
            label: checkName,
            defaults: { [`checks.${checkName}`]: defaultCheckConfig },
            settings: [
                {
                    type: 'toggle',
                    key: `checks.${checkName}.enabled`,
                    text: ['OFF', 'ON'],
                    description: defaultCheckConfig.description || `Toggle ${checkName} check`
                },
                {
                    type: 'soundToggle',
                    key: `checks.${checkName}.sound`,
                    condition: (cfg) => cfg.checks?.[checkName]?.enabled,
                    description: 'Toggle sound alerts'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.vl`,
                    values: [
                        { text: '5', value: 5 },
                        { text: '10', value: 10 },
                        { text: '15', value: 15 },
                        { text: '20', value: 20 },
                        { text: '30', value: 30 }
                    ],
                    condition: (cfg) => cfg.checks?.[checkName]?.enabled,
                    description: 'Violations level before required for alert',
                    displayLabel: 'VL'
                },
                {
                    type: 'cycle',
                    key: `checks.${checkName}.cooldown`,
                    values: [
                        { text: '0s', value: 0 },
                        { text: '1s', value: 1000 },
                        { text: '2s', value: 2000 },
                        { text: '3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.checks?.[checkName]?.enabled,
                    description: 'Alert cooldown',
                    displayLabel: 'CD'
                }
            ]
        });
    }
    
    return schema;
};


const getCheckDefinitions = () => {return {
    NoSlowA: {
        enabled: true, 
        sound: true, 
        vl: 10, 
        cooldown: 2000, 
        description: "Detects moving at full speed while using items (eating/blocking/drawing bow)" 
    },
    
    AutoBlockA: {
        enabled: true, 
        sound: true, 
        vl: 10, 
        cooldown: 2000, 
        description: "Detects attacking while blocking with sword" 
    },
    
    ScaffoldA: {
        enabled: true, 
        sound: true, 
        vl: 10, 
        cooldown: 2000, 
        description: "Detects suspicious block placement patterns while bridging" 
    },
        
    TowerA: { 
        enabled: true, 
        sound: true, 
        vl: 10, 
        cooldown: 2000, 
        description: "Detects building upward faster than possible" 
    }
};};

const SWORDS = [267, 268, 272, 276, 283];
const FOOD_ITEMS = [260, 297, 319, 320, 322, 335, 349, 350, 354, 357, 360, 363, 364, 365, 366, 367, 373, 391, 392, 393, 394, 396, 400, 411, 412, 413, 423, 424];

const CHECKS = {
    NoSlowA: (anticheat, player, config) => {
        // detect moving at full speed while using items (eating/blocking/drawing bow)
    },
    
    AutoBlockA: (anticheat, player, config) => {
        // detect attacking while blocking with sword
    },
    
    ScaffoldA: (anticheat, player, config) => {
        // detect keep-y scaffold
    },
    
    TowerA: (anticheat, player, config) => {
        // detect tower scaffold
    }
};

const getDecayRate = (checkName) => {
    // different checks can have different decay rates
    switch (checkName) {
        case 'ScaffoldA':
            return 1;
        default:
            return 1;
    }
};

class AnticheatSystem {
    constructor(api) {
        this.api = api;
        this.playerDataMap = new Map();
        this.config = api.getConfig();
        this.pluginPrefix = api.getPrefix();
    }

    getConfig() {
        return this.config;
    }
    
    onPlayerMove(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;

        if (data.position) {
            player.updatePosition(data.position, data.onGround, data.rotation);
        }

        this.runChecks(player);
    }

    onPlayerSwing(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;
        player.onSwing();
    }

    onPlayerCrouch(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;
        player.updateCrouching(data.crouching);
    }

    onPlayerSprint(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;
        player.updateSprinting(data.sprinting);
    }

    onPlayerUseItem(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;
        player.updateUsingItem(data.using);
    }

    onPlayerHeldItemChange(data) {
        const player = this.getPlayerData(data.player);
        if (!player) return;
        
        if (data.item !== undefined && data.slot === 0) {
            player.updateHeldItem(data.item);
        }
    }

    onTick() {
        const currentPlayers = this.api.getPlayers();
        const currentPlayerUUIDs = new Set(currentPlayers.map(p => p.uuid));

        for (const uuid of this.playerDataMap.keys()) {
            if (!currentPlayerUUIDs.has(uuid)) {
                this.playerDataMap.delete(uuid);
            }
        }

        for (const player of this.playerDataMap.values()) {
            player.tick();
        }
    }

    getPlayerData(playerInfo) {
        if (!playerInfo) return null;

        if (playerInfo.username && playerInfo.gameState) {
            return null;
        }

        if (!playerInfo.uuid) return null;

        let player = this.playerDataMap.get(playerInfo.uuid);
        if (player) return player;
        
        if (playerInfo.username || playerInfo.name) {
            this.playerDataMap.set(playerInfo.uuid, new PlayerData(playerInfo));
            return this.playerDataMap.get(playerInfo.uuid);
        }

        return null;
    }

    runChecks(player) {
        const config = this.getConfig();
        if (!config.checks) return;

        this.decayViolations(player);

        for (const [checkName, checkFunc] of Object.entries(CHECKS)) {
            const checkConfig = config.checks[checkName];
            if (checkConfig && checkConfig.enabled) {
                checkFunc(this, player, checkConfig);
            }
        }
    }

    decayViolations(player) {
        for (const checkName in player.violations) {
            if (player.activeChecks.has(checkName)) {
                continue;
            }

            if (player.violations[checkName] > 0) {
                const decayRate = getDecayRate(checkName);
                player.violations[checkName] = Math.max(0, player.violations[checkName] - decayRate);
            }
        }
    }
    
    addViolation(player, checkName, amount = 1) {
        player.violations[checkName] = (player.violations[checkName] || 0) + amount;
        return player.violations[checkName];
    }

    flag(player, checkName, violations) {
        const config = this.getConfig();
        const checkConfig = config.checks?.[checkName];
        
        const now = Date.now();
        const lastAlert = player.lastAlerts[checkName] || 0;
        if ((now - lastAlert) < checkConfig.cooldown) return;
        
        const message = `${this.pluginPrefix} ${player.name} §7flagged §c${checkName} §7(VL: ${violations})`;
        this.api.sendChat(message);
        
        if (checkConfig?.sound) {
            this.api.playSound('note.pling', { pitch: 2.0 });
        }
        
        player.lastAlerts[checkName] = now;
        this.api.debugLog(`${player.name} flagged for ${checkName} (VL: ${violations})`);
    }
}


class PlayerData {
    constructor(data) {
        this.name = data.name || data.username;
        this.uuid = data.uuid;
        
        // position tracking with history buffer
        this.position = { x: 0, y: 0, z: 0 };
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.positionHistory = []; // last 20 positions
        this.onGround = true;
        this.lastMoveWasTeleport = false;
        
        // air time tracking
        this.airTicks = 0;
        this.totalAirTicks = 0;
        this.groundTicks = 0;
        this.lastGroundY = 0;
        
        // rotation tracking
        this.yaw = 0;
        this.pitch = 0;
        this.previousYaw = 0;
        this.previousPitch = 0;
        
        // movement analysis
        this.horizontalSpeed = 0;
        this.verticalSpeed = 0;
        this.yawChange = 0;
        
        // current states
        this.isCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.heldItem = null;
        
        // state change timing
        this.lastCrouchedTick = 0;
        this.lastStopCrouchingTick = 0;
        this.lastSprintingTick = 0;
        this.lastStopSprintingTick = 0;
        this.lastUsingTick = 0;
        this.lastStopUsingTick = 0;
        this.lastSwingTick = 0;
        this.lastItemChangeTick = 0;
        this.lastHeldItem = null;
        
        // timing
        this.ticksExisted = 0;
        
        // violations with proper decay
        this.violations = {};
        this.lastAlerts = {};
        
        // stateful checks
        this.activeChecks = new Set();
    }
    
    updatePosition(pos, onGround, rotation) {
        this.lastPosition = { ...this.position };
        this.position = { ...pos };
        
        const dx = this.position.x - this.lastPosition.x;
        const dy = this.position.y - this.lastPosition.y;
        const dz = this.position.z - this.lastPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const maxMovement = Math.max(Math.abs(dx), Math.abs(dz));
        this.lastMoveWasTeleport = distance > 1.5 || maxMovement > 0.8;
        
        // calculate speeds (blocks per second)
        if (!this.lastMoveWasTeleport) {
            this.horizontalSpeed = (Math.max(Math.abs(dx), Math.abs(dz)) * 10);
            this.verticalSpeed = dy;
        } else {
            this.horizontalSpeed = 0;
            this.verticalSpeed = 0;
        }
        
        // track air time
        if (onGround !== undefined) {
            if (onGround) {
                if (!this.onGround) {
                    this.groundTicks = 0;
                    this.lastGroundY = this.position.y;
                }
                this.groundTicks++;
                this.airTicks = 0;
                } else {
                if (this.onGround) {
                    this.airTicks = 0;
                    this.lastGroundY = this.lastPosition.y;
                }
                this.airTicks++;
                this.totalAirTicks++;
                this.groundTicks = 0;
            }
            this.onGround = onGround;
        } else {
            this.onGround = true;
        }
        
        this.positionHistory.unshift({ ...this.position });
        if (this.positionHistory.length > 20) {
            this.positionHistory.pop();
        }
        
        if (rotation) {
            this.previousYaw = this.yaw;
            this.previousPitch = this.pitch;
            
            if (rotation.yaw !== undefined) this.yaw = rotation.yaw;
            if (rotation.pitch !== undefined) this.pitch = rotation.pitch;
            
            let yawDiff = this.yaw - this.previousYaw;
            yawDiff = ((yawDiff % 360) + 540) % 360 - 180;
            this.yawChange = Math.abs(yawDiff);
        } else {
            this.yawChange = 0;
        }
        
        if (this.name === 'UrchinAPI') {
            const logData = {
                pos: `x:${this.position.x.toFixed(2)}, y:${this.position.y.toFixed(2)}, z:${this.position.z.toFixed(2)}`,
                onGround: this.onGround,
                rotation: `yaw:${(this.yaw || 0).toFixed(2)}, pitch:${(this.pitch || 0).toFixed(2)}`,
                speed: `h:${this.horizontalSpeed.toFixed(2)}, v:${this.verticalSpeed.toFixed(2)}`,
                teleport: this.lastMoveWasTeleport,
                yawChange: this.yawChange.toFixed(2)
            };
            console.log(`[Anticheat Debug] ${this.name}:`, JSON.stringify(logData));
        }
    }
    
    updateCrouching(crouching) {
        if (crouching && !this.lastCrouching) {
            this.lastCrouchedTick = this.ticksExisted;
        } else if (!crouching && this.lastCrouching) {
            this.lastStopCrouchingTick = this.ticksExisted;
        }
        this.lastCrouching = this.isCrouching;
        this.isCrouching = crouching;
    }
    
    updateSprinting(sprinting) {
        if (sprinting && !this.lastSprinting) {
            this.lastSprintingTick = this.ticksExisted;
        } else if (!sprinting && this.lastSprinting) {
            this.lastStopSprintingTick = this.ticksExisted;
        }
        this.lastSprinting = this.isSprinting;
        this.isSprinting = sprinting;
    }
    
    updateUsingItem(using) {
        if (using && !this.lastUsing) {
            this.lastUsingTick = this.ticksExisted;
        } else if (!using && this.lastUsing) {
            this.lastStopUsingTick = this.ticksExisted;
        }
        this.lastUsing = this.isUsingItem;
        this.isUsingItem = using;
    }
    
    updateHeldItem(item) {
        const oldItem = this.heldItem;
        this.heldItem = item;
        
        if ((oldItem === null && item !== null) || 
            (oldItem !== null && item === null) || 
            (oldItem !== null && item !== null && 
             (oldItem.blockId !== item.blockId || oldItem.meta !== item.meta))) {
            this.lastItemChangeTick = this.ticksExisted;
            this.lastHeldItem = oldItem;
        }
    }
    
    onSwing() {
        this.lastSwingTick = this.ticksExisted;
    }
    
    tick() {
        this.ticksExisted++;
    }
}