class Commands {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    register(commands) {
        return this.proxy.commandHandler.register(this.core.metadata?.name || 'proxy', commands);
    }
}

module.exports = Commands; 