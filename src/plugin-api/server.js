class Server {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    kick(reason) {
        if (!this.core.isHypixelSafe('kick')) {
            this.core.logHypixelBlock('kick');
            return false;
        }
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            const reasonText = typeof reason === 'string' 
                ? JSON.stringify({ text: reason })
                : JSON.stringify(reason);
            return this.proxy.currentPlayer.client.write('kick_disconnect', { reason: reasonText });
        } catch (error) {
            this.core.log(`Failed to kick player: ${error.message}`);
            return false;
        }
    }
    
    sendKeepAlive(keepAliveId) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('keep_alive', { keepAliveId });
        } catch (error) {
            this.core.log(`Failed to send keep alive: ${error.message}`);
            return false;
        }
    }
    
    sendTabComplete(matches) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('tab_complete', { matches });
        } catch (error) {
            this.core.log(`Failed to send tab complete: ${error.message}`);
            return false;
        }
    }
    
    sendCustomPayload(channel, data) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('custom_payload', {
                channel,
                data
            });
        } catch (error) {
            this.core.log(`Failed to send custom payload: ${error.message}`);
            return false;
        }
    }
    
    sendLogin(entityId, gameMode, dimension, difficulty, maxPlayers, levelType, reducedDebugInfo) {
        if (!this.core.isHypixelSafe('sendLogin')) {
            this.core.logHypixelBlock('sendLogin');
            return false;
        }
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('login', {
                entityId,
                gameMode,
                dimension,
                difficulty,
                maxPlayers,
                levelType,
                reducedDebugInfo
            });
        } catch (error) {
            this.core.log(`Failed to send login: ${error.message}`);
            return false;
        }
    }
}

module.exports = Server; 