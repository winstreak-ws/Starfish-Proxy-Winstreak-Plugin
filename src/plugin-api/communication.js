class Communication {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    chat(message) {
        if (!this.proxy.currentPlayer?.client) return;
        
        try {
            this.proxy.currentPlayer.client.write('chat', {
                message: JSON.stringify({
                    text: message
                }),
                position: 0
            });
        } catch (error) {
            console.error('Failed to send chat message:', error.message);
        }
    }
    
    sound(name, x, y, z, volume = 1.0, pitch = 1.0) {
        if (!this.proxy.currentPlayer?.client) return;
        
        if (x === undefined || y === undefined || z === undefined) {
            const pos = this.proxy.currentPlayer?.gameState?.position;
            if (pos) {
                x = pos.x;
                y = pos.y;
                z = pos.z;
            } else {
                x = 0;
                y = 100;
                z = 0;
            }
        }
        
        try {
            this.proxy.currentPlayer.client.write('named_sound_effect', {
                soundName: name,
                x: Math.floor(x * 8),
                y: Math.floor(y * 8),
                z: Math.floor(z * 8),
                volume: volume,
                pitch: Math.floor(pitch * 63)
            });
        } catch (error) {
            console.error('Failed to play sound:', error.message);
        }
    }
    
    sendTitle(title, subtitle = '', fadeIn = 10, stay = 70, fadeOut = 20) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            const success = this.proxy.currentPlayer.client.write('title', {
                action: 0,
                text: JSON.stringify({ text: title })
            });
            
            if (subtitle) {
                this.proxy.currentPlayer.client.write('title', {
                    action: 1,
                    text: JSON.stringify({ text: subtitle })
                });
            }
            
            this.proxy.currentPlayer.client.write('title', {
                action: 2,
                fadeIn,
                stay,
                fadeOut
            });
            
            return success;
        } catch (error) {
            this.core.log(`Failed to send title: ${error.message}`);
            return false;
        }
    }
    
    sendActionBar(text) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('title', {
                action: 3,
                text: JSON.stringify({ text })
            });
        } catch (error) {
            this.core.log(`Failed to send actionbar: ${error.message}`);
            return false;
        }
    }
    
    sendParticle(particleId, longDistance, x, y, z, offsetX = 0, offsetY = 0, offsetZ = 0, particleData = 0, particleCount = 1, data = []) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('particle', {
                particleId,
                longDistance,
                x,
                y,
                z,
                offsetX,
                offsetY,
                offsetZ,
                particleData,
                particleCount,
                data
            });
        } catch (error) {
            this.core.log(`Failed to send particle: ${error.message}`);
            return false;
        }
    }
}

module.exports = Communication; 