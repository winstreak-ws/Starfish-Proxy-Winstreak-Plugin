const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    proxyPort: 25565,
    targetHost: 'mc.hypixel.net',
    targetPort: 25565,
    servers: {
        'hypixel': { host: 'mc.hypixel.net', port: 25565 },
        'ac-test': { host: 'anticheat-test.com', port: 25565 }
    }
};

class Storage {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.configDir = path.join(this.dataDir, 'config');
        this.pluginDataDir = this.configDir;
        
        this.ensureDirectories();
    }
    
    ensureDirectories() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }
    
    loadConfig() {
        const configFile = path.join(this.configDir, 'starfish-config.json');
        let config = { ...DEFAULT_CONFIG };
        if (fs.existsSync(configFile)) {
            try {
                const loadedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                Object.assign(config, loadedConfig);
            } catch (err) {
                console.error('Failed to load config:', err.message);
            }
        } else {
            this.saveConfig(config);
        }
        return config;
    }
    
    saveConfig(config) {
        const configFile = path.join(this.configDir, 'starfish-config.json');
        try {
            fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        } catch (err) {
            console.error('Failed to save config:', err.message);
        }
    }
    
    loadPluginData(pluginName) {
        const file = path.join(this.pluginDataDir, `${pluginName}.json`);
        if (fs.existsSync(file)) {
            try {
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch (err) {
                console.error(`Failed to load data for plugin ${pluginName}:`, err.message);
            }
        }
        return {};
    }
    
    savePluginData(pluginName, data) {
        const file = path.join(this.pluginDataDir, `${pluginName}.json`);
        try {
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`Failed to save data for plugin ${pluginName}:`, err.message);
        }
    }
    
    loadPluginConfig(pluginName) {
        const data = this.loadPluginData(pluginName);
        return data.config || {};
    }
    
    savePluginConfig(pluginName, config) {
        const data = this.loadPluginData(pluginName);
        data.config = config;
        this.savePluginData(pluginName, data);
    }
    
    getPluginStore(pluginName) {
        const data = this.loadPluginData(pluginName);
        return new PluginStore(pluginName, this, data.store || {});
    }
}

class PluginStore {
    constructor(pluginName, storage, initialData = {}) {
        this.pluginName = pluginName;
        this.storage = storage;
        this.data = { ...initialData };
    }
    
    get(key, defaultValue = undefined) {
        return this.data[key] !== undefined ? this.data[key] : defaultValue;
    }
    
    set(key, value) {
        this.data[key] = value;
        this.save();
    }
    
    delete(key) {
        delete this.data[key];
        this.save();
    }
    
    clear() {
        this.data = {};
        this.save();
    }
    
    has(key) {
        return key in this.data;
    }
    
    keys() {
        return Object.keys(this.data);
    }
    
    values() {
        return Object.values(this.data);
    }
    
    entries() {
        return Object.entries(this.data);
    }
    
    save() {
        const fullData = this.storage.loadPluginData(this.pluginName);
        fullData.store = this.data;
        this.storage.savePluginData(this.pluginName, fullData);
    }
}

module.exports = { Storage };