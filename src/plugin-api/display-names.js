class DisplayNames {
    constructor(proxy, core, events) {
        this.proxy = proxy;
        this.core = core;
        this.events = events;
        this.customDisplayNames = new Map();
        this.originalDisplayNames = new Map();
        
        this.events.on('player.join', (data) => this._onPlayerJoin(data));
        this.events.on('teamUpdate', (data) => this._handleTeamUpdate(data));
    }
    
    setCustomDisplayName(uuid, displayName) {
        this.customDisplayNames.set(uuid, displayName);
        
        if (this.proxy.currentPlayer?.gameState) {
            const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
            if (playerInfo && !this.originalDisplayNames.has(uuid)) {
                let originalName = playerInfo.displayName || playerInfo.name;
                if (originalName && typeof originalName === 'string' && originalName.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(originalName);
                        originalName = this.proxy.currentPlayer.gameState.extractText(parsed);
                    } catch (e) {
                    }
                }
                this.originalDisplayNames.set(uuid, originalName);
            }
            
            setTimeout(() => {
                this._updatePlayerDisplayName(uuid);
            }, 100);
        }
    }
    
    updatePlayerList() {
        if (!this.proxy.currentPlayer?.client || !this.proxy.currentPlayer?.gameState) return;
        
        for (const [uuid, customName] of this.customDisplayNames) {
            this._updatePlayerDisplayName(uuid);
        }
    }
    
    clearAllCustomDisplayNames() {
        this._clearCustomDisplayNames();
    }
    
    clearCustomDisplayName(uuid) {
        if (!this.customDisplayNames.has(uuid)) return;
        
        const originalName = this.originalDisplayNames.get(uuid);
        if (originalName && this.proxy.currentPlayer?.client) {
            const playerInfo = this.proxy.currentPlayer.gameState?.playerInfo.get(uuid);
            if (playerInfo) {
                const team = this.proxy.currentPlayer.gameState.getPlayerTeam(playerInfo.name);
                let formattedName = originalName;
                
                if (team) {
                    formattedName = team.prefix + originalName + team.suffix;
                }
                
                const displayNameJSON = JSON.stringify({ text: formattedName });
                
                this.proxy.currentPlayer.client.write('player_info', {
                    action: 3,
                    data: [{ UUID: uuid, displayName: displayNameJSON }]
                });
            }
        }
        
        this.customDisplayNames.delete(uuid);
        this.originalDisplayNames.delete(uuid);
    }
    
    _onPlayerJoin(data) {
        if (this.customDisplayNames.has(data.uuid)) {
            setTimeout(() => {
                if (!this.proxy.currentPlayer?.gameState) return;
                this._updatePlayerDisplayName(data.uuid);
            }, 100);
        }
    }
    
    _updatePlayerDisplayName(uuid) {
        if (!this.proxy.currentPlayer?.client) return;
        
        const customName = this.customDisplayNames.get(uuid);
        if (!customName) return;
        
        const playerInfo = this.proxy.currentPlayer.gameState?.playerInfo.get(uuid);
        if (!playerInfo) return;
        
        const team = this.proxy.currentPlayer.gameState.getPlayerTeam(playerInfo.name);
        let formattedName = customName;
        
        if (team) {
            formattedName = team.prefix + customName + team.suffix;
        }
        
        const displayNameJSON = JSON.stringify({ text: formattedName });
        
        this.proxy.currentPlayer.client.write('player_info', {
            action: 3,
            data: [{ UUID: uuid, displayName: displayNameJSON }]
        });
    }
    
    _handleTeamUpdate(event) {
        if (!this.proxy.currentPlayer?.client) return;
        
        const { team: teamName, mode } = event.data;
        
        if (mode >= 0 && mode <= 4) {
            setTimeout(() => {
                if (!this.proxy.currentPlayer?.gameState) return;
                
                if (mode === 1) {
                    for (const [uuid, customName] of this.customDisplayNames) {
                        this._updatePlayerDisplayName(uuid);
                    }
                } else {
                    const team = this.proxy.currentPlayer.gameState.teams.get(teamName);
                    if (!team) return;
                    
                    for (const [uuid, customName] of this.customDisplayNames) {
                        const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
                        if (playerInfo && team.players.has(playerInfo.name)) {
                            this._updatePlayerDisplayName(uuid);
                        }
                    }
                }
            }, 50);
        }
    }
    
    _clearCustomDisplayNames() {
        if (!this.proxy.currentPlayer?.client) return;
        
        for (const [uuid, originalName] of this.originalDisplayNames) {
            const displayNameJSON = JSON.stringify({ text: originalName });
            
            this.proxy.currentPlayer.client.write('player_info', {
                action: 3,
                data: [{ UUID: uuid, displayName: displayNameJSON }]
            });
        }
        
        this.customDisplayNames.clear();
        this.originalDisplayNames.clear();
    }
    
    _handleWorldChange(reason) {
        const namesToRestore = new Map(this.customDisplayNames);
        
        this._clearCustomDisplayNames();
        
        if (namesToRestore.size > 0) {
            setTimeout(() => {
                if (!this.proxy.currentPlayer?.gameState) return;
                
                for (const [uuid, name] of namesToRestore) {
                    this.setCustomDisplayName(uuid, name);
                }
            }, 1000);
        }
    }
}

module.exports = DisplayNames; 