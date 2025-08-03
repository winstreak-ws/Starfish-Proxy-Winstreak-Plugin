class DisplayNames {
    constructor(proxy, core, events) {
        this.proxy = proxy;
        this.core = core;
        this.events = events;
        this.customDisplayNames = new Map();
        this.originalDisplayNames = new Map();
        
        this.events.on('playerList.update', (data) => this._onPlayerListUpdate(data));
        this.events.on('teamUpdate', (data) => this._handleTeamUpdate(data));
        this.events.on('world.change', (data) => this._handleWorldChange(data));
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
            
            this._updatePlayerDisplayName(uuid);
        }
    }
    
    updatePlayerList() {
        if (!this.proxy.currentPlayer?.client || !this.proxy.currentPlayer?.gameState) return;
        
        for (const [uuid] of this.customDisplayNames) {
            this._updatePlayerDisplayName(uuid);
        }
    }
    
    clearAllCustomDisplayNames() {
        this._clearCustomDisplayNames();
    }
    
    clearCustomDisplayName(uuid) {
        if (!this.customDisplayNames.has(uuid)) return;
        
        this._restoreOriginalDisplayName(uuid);
        
        this.customDisplayNames.delete(uuid);
        this.originalDisplayNames.delete(uuid);
    }
    
    _onPlayerListUpdate(data) {
        if (data.action === 0) {
            for (const player of data.players) {
                if (this.customDisplayNames.has(player.uuid)) {
                    this._updatePlayerDisplayName(player.uuid);
                }
            }
        }
    }
    
    _updatePlayerDisplayName(uuid) {
        if (!this.proxy.currentPlayer?.client || !this.proxy.currentPlayer?.gameState) return;
        
        const customName = this.customDisplayNames.get(uuid);
        if (!customName) return;
        
        const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
        if (!playerInfo) return;
        
        const displayName = this._formatDisplayName(customName, playerInfo.name);
        this._sendDisplayNameUpdate(uuid, displayName);
    }
    
    _restoreOriginalDisplayName(uuid) {
        if (!this.proxy.currentPlayer?.client || !this.proxy.currentPlayer?.gameState) return;
        
        const originalName = this.originalDisplayNames.get(uuid);
        if (!originalName) return;
        
        const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
        if (!playerInfo) return;
        
        const displayName = this._formatDisplayName(originalName, playerInfo.name);
        this._sendDisplayNameUpdate(uuid, displayName);
    }
    
    _formatDisplayName(displayName, playerName) {
        const team = this.proxy.currentPlayer.gameState.getPlayerTeam(playerName);
        if (team) {
            return team.prefix + displayName + team.suffix;
        }
        return displayName;
    }
    
    _sendDisplayNameUpdate(uuid, displayName) {
        const displayNameJSON = JSON.stringify({ text: displayName });
        this.proxy.currentPlayer.client.write('player_info', {
            action: 3,
            data: [{ UUID: uuid, displayName: displayNameJSON }]
        });
    }
    
    _handleTeamUpdate(event) {
        if (!this.proxy.currentPlayer?.client || !this.proxy.currentPlayer?.gameState) return;
        
        const { name: teamName, mode } = event;
        if (!teamName || mode === undefined) return;
        
        setImmediate(() => {
            if (!this.proxy.currentPlayer?.gameState) return;
            
            switch (mode) {
                case 0:
                case 2:
                    this._updatePlayersInTeam(teamName);
                    break;
                case 1:
                    this._updateAllPlayers();
                    break;
                case 3:
                    if (event.players) {
                        this._updateSpecificPlayers(event.players);
                    }
                    break;
            }
        });
    }
    
    _updatePlayersInTeam(teamName) {
        const team = this.proxy.currentPlayer.gameState.teams.get(teamName);
        if (!team) return;
        
        for (const [uuid] of this.customDisplayNames) {
            const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
            if (playerInfo && team.players.has(playerInfo.name)) {
                this._updatePlayerDisplayName(uuid);
            }
        }
    }
    
    _updateAllPlayers() {
        for (const [uuid] of this.customDisplayNames) {
            this._updatePlayerDisplayName(uuid);
        }
    }
    
    _updateSpecificPlayers(playerNames) {
        const namesToUpdate = new Set(playerNames);
        
        for (const [uuid] of this.customDisplayNames) {
            const playerInfo = this.proxy.currentPlayer.gameState.playerInfo.get(uuid);
            if (playerInfo && namesToUpdate.has(playerInfo.name)) {
                this._updatePlayerDisplayName(uuid);
            }
        }
    }
    
    _clearCustomDisplayNames() {
        if (!this.proxy.currentPlayer?.client) return;
        
        for (const [uuid] of this.originalDisplayNames) {
            this._restoreOriginalDisplayName(uuid);
        }
        
        this.customDisplayNames.clear();
        this.originalDisplayNames.clear();
    }
    
    _handleWorldChange(reason) {
        const namesToRestore = new Map(this.customDisplayNames);
        
        this._clearCustomDisplayNames();
        
        if (namesToRestore.size > 0) {
            const restoreHandler = (data) => {
                if (data.action === 0) {
                    for (const player of data.players) {
                        if (namesToRestore.has(player.uuid)) {
                            this.setCustomDisplayName(player.uuid, namesToRestore.get(player.uuid));
                            namesToRestore.delete(player.uuid);
                            
                            if (namesToRestore.size === 0) {
                                this.events.off('playerList.update', restoreHandler);
                            }
                        }
                    }
                }
            };
            
            this.events.on('playerList.update', restoreHandler);
            
            for (const [uuid, name] of namesToRestore) {
                if (this.proxy.currentPlayer?.gameState?.playerInfo.has(uuid)) {
                    this.setCustomDisplayName(uuid, name);
                    namesToRestore.delete(uuid);
                }
            }
            
            if (namesToRestore.size === 0) {
                this.events.off('playerList.update', restoreHandler);
            }
        }
    }
}

module.exports = DisplayNames;