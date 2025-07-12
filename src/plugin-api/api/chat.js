class Chat {
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
    
    sendTabComplete(text) {
        if (!this.proxy.currentPlayer?.client) return false;
        
        try {
            return this.proxy.currentPlayer.client.write('tab_complete', {
                text
            });
        } catch (error) {
            this.core.log(`Failed to send tab complete: ${error.message}`);
            return false;
        }
    }
}

module.exports = Chat;