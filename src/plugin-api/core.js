const fs = require('fs');
const path = require('path');
const { getPluginConfigDir } = require('../utils/paths');

class Core {
    constructor(proxy, metadata) {
        this.proxy = proxy;
        this.metadata = metadata;
        this.enabled = true;
        this.debug = false;
        
        this._initializeConfig();
    }
    
    _initializeConfig() {
        if (!this.metadata?.path) {
            this.config = {
                get: () => ({}),
                set: () => true
            };
            return;
        }
        
        const configPath = path.join(getPluginConfigDir(), `${this.metadata.name}.config.json`);
        
        const defaultConfig = {
            enabled: true,
            debug: false
        };
        
        let config = defaultConfig;
        if (fs.existsSync(configPath)) {
            try {
                const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config = { ...defaultConfig, ...saved };
            } catch (e) {
                this.log(`Failed to load config: ${e.message}`);
            }
        }
        
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (e) {
            this.log(`Failed to save config: ${e.message}`);
        }
        
        this.enabled = config.enabled;
        this.debug = config.debug;
        this.hypixelSafeMode = true; // hardcoded for production version
        
        this.config = {
            get: (key) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    return key ? this._getNestedValue(current, key) : current;
                } catch (e) {
                    return key ? this._getNestedValue(defaultConfig, key) : defaultConfig;
                }
            },
            
            set: (key, value) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this._setNestedValue(current, key, value);
                    fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
                    
                    if (key === 'enabled') this.enabled = value;
                    if (key === 'debug') this.debug = value;
                    
                    return true;
                } catch (e) {
                    this.log(`Failed to save config: ${e.message}`);
                    return false;
                }
            }
        };
    }
    
    _getNestedValue(obj, path) {
        if (!path) return obj;
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        return current;
    }
    
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }
    
        log(message) {
        const pluginName = this.metadata?.name || 'Proxy';
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${pluginName}] ${message}`);
    }

    debugLog(message) {
        if (this.debug) {
            const pluginName = this.metadata?.displayName || 'Proxy';
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [${pluginName}] [DEBUG] ${message}`);
        }
    }
    
    initializeConfig(schema) {
        this.configSchema = schema;
        
        if (schema && Array.isArray(schema)) {
            const current = this.config.get();
            
            schema.forEach(section => {
                if (section.defaults) {
                    this._mergeDefaults(current, section.defaults);
                }
            });
            
            const configPath = path.join(getPluginConfigDir(), `${this.metadata.name}.config.json`);
            try {
                fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
            } catch (e) {
                this.log(`Failed to save config: ${e.message}`);
            }
        }
    }
    
    _mergeDefaults(current, defaults) {
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in current)) {
                current[key] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (typeof current[key] !== 'object' || current[key] === null) {
                    current[key] = {};
                }
                this._mergeDefaults(current[key], value);
            }
        }
    }
    
    saveCurrentConfig() {
        const current = this.config.get();
        Object.keys(current).forEach(key => {
            this.config.set(key, current[key]);
        });
        return true;
    }
    
    isHypixelSafe(methodName) {
        if (!this.hypixelSafeMode) return true;
        
        const unsafeMethods = new Set([
            // player state manipulation
            'sendPosition', 'sendHealth', 'sendExperience', 'sendAbilities',
            
            // entity manipulation
            'spawnPlayer', 'spawnLiving', 'spawnObject', 'spawnExperienceOrb',
            'setEntityVelocity', 'teleportEntity', 'moveEntity', 'setEntityLook',
            'setEntityLookAndMove', 'setEntityHeadRotation', 'setEntityEquipment',
            'addEntityEffect', 'removeEntityEffect', 'setEntityStatus', 
            'setEntityMetadata', 'animateEntity', 'collectEntity', 'attachEntity',
            
            // inventory manipulation
            'openWindow', 'closeWindow', 'setSlot', 'setWindowItems', 'sendTransaction',
            'sendCraftProgress', 'setHeldItemSlot', 'creativeInventoryAction', 'enchantItem',
            'createChest', 'createHopper', 'createDispenser', 'fillWindow', 'clearWindow',
            
            // world manipulation
            'sendExplosion', 'sendBlockChange', 'sendMultiBlockChange', 'sendWorldEvent',
            'sendTimeUpdate', 'sendSpawnPosition', 'sendGameStateChange',
            
            // server administration
            'kick', 'sendLogin'
        ]);
        
        return !unsafeMethods.has(methodName);
    }
    
    logHypixelBlock(methodName) {
        if (this.debug) {
            this.log(`Method '${methodName}' blocked by safe mode.`);
        }
    }
}

module.exports = Core; 