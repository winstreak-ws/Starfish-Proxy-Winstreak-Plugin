class Commands {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    register(pluginName, commands) {
        return this.proxy.commandHandler.register(pluginName, commands);
    }
}

module.exports = Commands; 