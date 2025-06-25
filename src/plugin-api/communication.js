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
}

module.exports = Communication; 