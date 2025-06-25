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

    const anticheat = new AnticheatSystem(api);
    
    const configSchema = [
        {
            label: 'NoSlowA',
            description: 'Detects moving at full speed while using items (eating/blocking/drawing bow)',
            defaults: { 
                noSlowA: { 
                    enabled: true, 
                    sound: true, 
                    vl: 10, 
                    cooldown: 2000 
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'noSlowA.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Toggle NoSlowA check'
                },
                {
                    type: 'soundToggle',
                    key: 'noSlowA.sound',
                    condition: (cfg) => cfg.noSlowA?.enabled,
                    description: 'Toggle sound alerts'
                },
                {
                    type: 'cycle',
                    key: 'noSlowA.vl',
                    values: [
                        { text: '5', value: 5 },
                        { text: '10', value: 10 },
                        { text: '15', value: 15 },
                        { text: '20', value: 20 },
                        { text: '30', value: 30 }
                    ],
                    condition: (cfg) => cfg.noSlowA?.enabled,
                    description: 'Violations level before required for alert',
                    displayLabel: 'VL'
                },
                {
                    type: 'cycle',
                    key: 'noSlowA.cooldown',
                    values: [
                        { text: '0s', value: 0 },
                        { text: '1s', value: 1000 },
                        { text: '2s', value: 2000 },
                        { text: '3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.noSlowA?.enabled,
                    description: 'Alert cooldown',
                    displayLabel: 'CD'
                }
            ]
        },
        {
            label: 'AutoBlockA',
            description: 'Detects attacking while blocking with sword',
            defaults: { 
                autoBlockA: { 
                    enabled: true, 
                    sound: true, 
                    vl: 10, 
                    cooldown: 2000 
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'autoBlockA.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Toggle AutoBlockA check'
                },
                {
                    type: 'soundToggle',
                    key: 'autoBlockA.sound',
                    condition: (cfg) => cfg.autoBlockA?.enabled,
                    description: 'Toggle sound alerts'
                },
                {
                    type: 'cycle',
                    key: 'autoBlockA.vl',
                    values: [
                        { text: '5', value: 5 },
                        { text: '10', value: 10 },
                        { text: '15', value: 15 },
                        { text: '20', value: 20 },
                        { text: '30', value: 30 }
                    ],
                    condition: (cfg) => cfg.autoBlockA?.enabled,
                    description: 'Violations level before required for alert',
                    displayLabel: 'VL'
                },
                {
                    type: 'cycle',
                    key: 'autoBlockA.cooldown',
                    values: [
                        { text: '0s', value: 0 },
                        { text: '1s', value: 1000 },
                        { text: '2s', value: 2000 },
                        { text: '3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.autoBlockA?.enabled,
                    description: 'Alert cooldown',
                    displayLabel: 'CD'
                }
            ]
        },
        {
            label: 'ScaffoldA',
            description: 'Detects suspicious block placement patterns while bridging',
            defaults: { 
                scaffoldA: { 
                    enabled: true, 
                    sound: true, 
                    vl: 10, 
                    cooldown: 2000 
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'scaffoldA.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Toggle ScaffoldA check'
                },
                {
                    type: 'soundToggle',
                    key: 'scaffoldA.sound',
                    condition: (cfg) => cfg.scaffoldA?.enabled,
                    description: 'Toggle sound alerts'
                },
                {
                    type: 'cycle',
                    key: 'scaffoldA.vl',
                    values: [
                        { text: '5', value: 5 },
                        { text: '10', value: 10 },
                        { text: '15', value: 15 },
                        { text: '20', value: 20 },
                        { text: '30', value: 30 }
                    ],
                    condition: (cfg) => cfg.scaffoldA?.enabled,
                    description: 'Violations level before required for alert',
                    displayLabel: 'VL'
                },
                {
                    type: 'cycle',
                    key: 'scaffoldA.cooldown',
                    values: [
                        { text: '0s', value: 0 },
                        { text: '1s', value: 1000 },
                        { text: '2s', value: 2000 },
                        { text: '3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.scaffoldA?.enabled,
                    description: 'Alert cooldown',
                    displayLabel: 'CD'
                }
            ]
        },
        {
            label: 'TowerA',
            description: 'Detects building upward faster than possible',
            defaults: { 
                towerA: { 
                    enabled: true, 
                    sound: true, 
                    vl: 10, 
                    cooldown: 2000 
                }
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'towerA.enabled',
                    text: ['OFF', 'ON'],
                    description: 'Toggle TowerA check'
                },
                {
                    type: 'soundToggle',
                    key: 'towerA.sound',
                    condition: (cfg) => cfg.towerA?.enabled,
                    description: 'Toggle sound alerts'
                },
                {
                    type: 'cycle',
                    key: 'towerA.vl',
                    values: [
                        { text: '5', value: 5 },
                        { text: '10', value: 10 },
                        { text: '15', value: 15 },
                        { text: '20', value: 20 },
                        { text: '30', value: 30 }
                    ],
                    condition: (cfg) => cfg.towerA?.enabled,
                    description: 'Violations level before required for alert',
                    displayLabel: 'VL'
                },
                {
                    type: 'cycle',
                    key: 'towerA.cooldown',
                    values: [
                        { text: '0s', value: 0 },
                        { text: '1s', value: 1000 },
                        { text: '2s', value: 2000 },
                        { text: '3s', value: 3000 }
                    ],
                    condition: (cfg) => cfg.towerA?.enabled,
                    description: 'Alert cooldown',
                    displayLabel: 'CD'
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);

    api.configSchema(configSchema);

    api.commands((registry) => {
    });
    
    anticheat.registerHandlers();
    return anticheat;
};

const SWORDS = [267, 268, 272, 276, 283];
const FOOD_ITEMS = [260, 297, 319, 320, 322, 335, 349, 350, 354, 357, 360, 363, 364, 365, 366, 367, 373, 391, 392, 393, 394, 396, 400, 411, 412, 413, 423, 424];

const CHECKS = {
    NoSlowA: (anticheat, player, config) => {
        // detect moving at full speed while using items
        if (!player.isUsingItem) {
            return;
        }

        if (!player.heldItem) return;

        const isSword = SWORDS.includes(player.heldItem.blockId);
        const isFood = FOOD_ITEMS.includes(player.heldItem.blockId);
        const isBow = player.heldItem.blockId === 261;

        if (!isSword && !isFood && !isBow) return;

        // get expected speed reduction
        let expectedSpeedMultiplier = 1.0;
        if (isSword) expectedSpeedMultiplier = 0.2;
        else if (isFood || isBow) expectedSpeedMultiplier = 0.2;

        // calculate movement speed from position changes
        const movementSpeed = anticheat.calculateMovementSpeed(player);
        
        // base walking speed is ~0.215, sprinting is ~0.281
        const maxAllowedSpeed = player.isSprinting ? 0.281 : 0.215;
        const expectedSpeed = maxAllowedSpeed * expectedSpeedMultiplier;
        
        // allow some tolerance
        const tolerance = 0.03;
        
        if (movementSpeed > expectedSpeed + tolerance) {
            anticheat.api.debugLog(`NoSlow detected for ${player.name}: speed=${movementSpeed.toFixed(3)}, expected=${expectedSpeed.toFixed(3)}`);
            const vl = anticheat.addViolation(player, 'NoSlowA', 1);
            if (vl >= config.vl) {
                anticheat.flag(player, 'NoSlowA', vl);
            }
        }
    },
    
    AutoBlockA: (anticheat, player, config) => {
        const state = anticheat.getLastState(player.uuid);
        const timeSinceSwing = Date.now() - state.lastSwingTime;
        
        if (timeSinceSwing > 250) { // 5 ticks
            return;
        }

        // player is blocking
        const isBlocking = player.isUsingItem && SWORDS.includes(player.heldItem?.blockId);
        if (!isBlocking) return;

        // player swung while blocking
        anticheat.api.debugLog(`AutoBlock detected for ${player.name}: swung while blocking with sword`);
        const vl = anticheat.addViolation(player, 'AutoBlockA', 1);
        if (vl >= config.vl) {
            anticheat.flag(player, 'AutoBlockA', vl);
        }
    },
    
    ScaffoldA: (anticheat, player, config) => {
        if (player.isCrouching) {
            return;
        }

        const movementSpeed = anticheat.calculateMovementSpeed(player);
        if (movementSpeed < 0.05) return; // not moving

        // get movement direction and Y change
        const yChange = anticheat.getYChange(player);
        const positions = anticheat.lastPositions.get(player.uuid);
        if (!positions || positions.length < 3) return;

        // consistent Y level
        const recent = positions.slice(-3);
        const yVariance = Math.max(...recent.map(p => p.position.y)) - Math.min(...recent.map(p => p.position.y));
        
        if (movementSpeed > 0.02 && movementSpeed < 0.3 && yVariance < 0.05) {
            anticheat.api.debugLog(`Scaffold detected for ${player.name}: speed=${movementSpeed.toFixed(3)}, yVar=${yVariance.toFixed(3)}`);
            const vl = anticheat.addViolation(player, 'ScaffoldA', 1);
            if (vl >= config.vl) {
                anticheat.flag(player, 'ScaffoldA', vl);
            }
        }
    },
    
    TowerA: (anticheat, player, config) => {
        if (player.isCrouching) {
            return;
        }

        // rapid upward movement
        const yChange = anticheat.getYChange(player);
        if (yChange > 0.5) {
            anticheat.api.debugLog(`Tower detected for ${player.name}: rapid Y change=${yChange.toFixed(3)}`);
            const vl = anticheat.addViolation(player, 'TowerA', 1);
            if (vl >= config.vl) {
                anticheat.flag(player, 'TowerA', vl);
            }
        }
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

// dont touch
class AnticheatSystem {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.violations = new Map();
        this.lastAlerts = new Map();
        this.lastStates = new Map();
        this.lastPositions = new Map();
    }
    
    registerHandlers() {
        this.api.on('player.move', this.onPlayerMove.bind(this));
        this.api.on('player.action', this.onPlayerAction.bind(this));
        this.api.on('player.equipment', this.onPlayerEquipment.bind(this));
        this.api.everyTick(this.onTick.bind(this));
    }

    onPlayerMove(event) {
        if (!this.api.isEnabled()) return;
        if (event.player.isCurrentPlayer) return;
        
        // get the full player object from the API
        const player = this.api.getPlayer(event.player.uuid);
        if (!player || !player.withinRenderDistance) {
            return; // can't track players outside render distance
        }
        
        this.updatePlayerPosition(player);
        this.runChecks(player);
    }

    onPlayerAction(event) {
        if (!this.api.isEnabled()) return;
        if (event.player.isCurrentPlayer) return;
        
        // get the full player object from the API
        const player = this.api.getPlayer(event.player.uuid);
        if (!player || !player.withinRenderDistance) {
            return; // can't track players outside render distance
        }
        
        if (event.type === 'swing') {
            this.updateLastState(event.player.uuid, { lastSwingTime: Date.now() });
            this.runChecks(player);
        } else if (event.type === 'crouch') {
            const state = this.getLastState(event.player.uuid);
            if (event.value && !state.lastCrouching) {
                this.updateLastState(event.player.uuid, { lastCrouchedTime: Date.now() });
            } else if (!event.value && state.lastCrouching) {
                this.updateLastState(event.player.uuid, { lastStopCrouchingTime: Date.now() });
            }
            this.updateLastState(event.player.uuid, { lastCrouching: event.value });
        } else if (event.type === 'sprint') {
            const state = this.getLastState(event.player.uuid);
            if (event.value && !state.lastSprinting) {
                this.updateLastState(event.player.uuid, { lastSprintingTime: Date.now() });
            } else if (!event.value && state.lastSprinting) {
                this.updateLastState(event.player.uuid, { lastStopSprintingTime: Date.now() });
            }
            this.updateLastState(event.player.uuid, { lastSprinting: event.value });
        } else if (event.type === 'useItem') {
            const state = this.getLastState(event.player.uuid);
            if (event.value && !state.lastUsing) {
                this.updateLastState(event.player.uuid, { lastUsingTime: Date.now() });
            } else if (!event.value && state.lastUsing) {
                this.updateLastState(event.player.uuid, { lastStopUsingTime: Date.now() });
            }
            this.updateLastState(event.player.uuid, { lastUsing: event.value });
        }
    }

    onPlayerEquipment(event) {
        if (!this.api.isEnabled()) return;
        if (event.player.isCurrentPlayer) return;
        
        this.updateLastState(event.player.uuid, { 
            lastItemChangeTime: Date.now(),
            lastHeldItem: event.player.heldItem 
        });
    }

    onTick() {
        if (!this.api.isEnabled()) return;
        
        const currentUUIDs = new Set(this.api.players.map(p => p.uuid));
        
        for (const uuid of this.violations.keys()) {
            if (!currentUUIDs.has(uuid)) {
                this.violations.delete(uuid);
                this.lastAlerts.delete(uuid);
                this.lastStates.delete(uuid);
                this.lastPositions.delete(uuid);
            }
        }

        for (const player of this.api.players) {
            if (player.isCurrentPlayer) continue;
            this.decayViolations(player);
        }
    }

    updatePlayerPosition(player) {
        if (!this.lastPositions.has(player.uuid)) {
            this.lastPositions.set(player.uuid, []);
        }
        
        const positions = this.lastPositions.get(player.uuid);
        positions.push({
            position: { ...player.position },
            time: Date.now()
        });
        
        if (positions.length > 10) {
            positions.shift();
        }
    }

    calculateMovementSpeed(player) {
        const positions = this.lastPositions.get(player.uuid);
        if (!positions || positions.length < 2) return 0;
        
        const recent = positions[positions.length - 1];
        const previous = positions[positions.length - 2];
        
        const dx = recent.position.x - previous.position.x;
        const dz = recent.position.z - previous.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const timeDiff = (recent.time - previous.time) / 1000;
        
        return timeDiff > 0 ? distance / timeDiff : 0;
    }

    getYChange(player) {
        const positions = this.lastPositions.get(player.uuid);
        if (!positions || positions.length < 2) return 0;
        
        const recent = positions[positions.length - 1];
        const previous = positions[positions.length - 2];
        
        return recent.position.y - previous.position.y;
    }



    getLastState(uuid) {
        if (!this.lastStates.has(uuid)) {
            this.lastStates.set(uuid, {
                lastCrouching: false,
                lastSprinting: false,
                lastUsing: false,
                lastSwingTime: 0,
                lastCrouchedTime: 0,
                lastStopCrouchingTime: 0,
                lastSprintingTime: 0,
                lastStopSprintingTime: 0,
                lastUsingTime: 0,
                lastStopUsingTime: 0,
                lastItemChangeTime: 0,
                lastHeldItem: null
            });
        }
        return this.lastStates.get(uuid);
    }

    updateLastState(uuid, updates) {
        const state = this.getLastState(uuid);
        Object.assign(state, updates);
    }

    runChecks(player) {
        const configMap = {
            'NoSlowA': 'noSlowA',
            'AutoBlockA': 'autoBlockA', 
            'ScaffoldA': 'scaffoldA',
            'TowerA': 'towerA'
        };
        
        for (const [checkName, checkFunc] of Object.entries(CHECKS)) {
            const configKey = configMap[checkName];
            const checkConfig = this.api.config.get(configKey);
            if (checkConfig && checkConfig.enabled) {
                checkFunc(this, player, checkConfig);
            }
        }
    }

    decayViolations(player) {
        const violations = this.violations.get(player.uuid);
        if (!violations) return;

        for (const checkName in violations) {
            if (violations[checkName] > 0) {
                const decayRate = getDecayRate(checkName);
                violations[checkName] = Math.max(0, violations[checkName] - decayRate);
            }
        }
    }
    
    addViolation(player, checkName, amount = 1) {
        if (!this.violations.has(player.uuid)) {
            this.violations.set(player.uuid, {});
        }
        
        const violations = this.violations.get(player.uuid);
        violations[checkName] = (violations[checkName] || 0) + amount;
        return violations[checkName];
    }

    flag(player, checkName, violations) {
        const configMap = {
            'NoSlowA': 'noSlowA',
            'AutoBlockA': 'autoBlockA', 
            'ScaffoldA': 'scaffoldA',
            'TowerA': 'towerA'
        };
        
        const configKey = configMap[checkName];
        const checkConfig = this.api.config.get(configKey);
        if (!checkConfig) return;
        
        const now = Date.now();
        if (!this.lastAlerts.has(player.uuid)) {
            this.lastAlerts.set(player.uuid, {});
        }
        
        const lastAlerts = this.lastAlerts.get(player.uuid);
        const lastAlert = lastAlerts[checkName] || 0;
        if ((now - lastAlert) < checkConfig.cooldown) return;
        
        const message = `${this.PLUGIN_PREFIX} ${player.name} §7flagged §c${checkName} §7(VL: ${violations})`;
        this.api.chat(message);
        
        if (checkConfig.sound) {
            this.api.sound('note.pling', { pitch: 2.0 });
        }
        
        lastAlerts[checkName] = now;
        this.api.debugLog(`${player.name} flagged for ${checkName} (VL: ${violations})`);
    }
}