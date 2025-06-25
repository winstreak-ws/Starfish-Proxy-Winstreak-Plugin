class World {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }
    
    get gameState() {
        return this.proxy.currentPlayer?.gameState || null;
    }
    
    getTeams() {
        if (!this.proxy.currentPlayer?.gameState) return [];
        
        const teams = [];
        for (const [name, team] of this.proxy.currentPlayer.gameState.teams) {
            teams.push({
                name: name,
                displayName: team.displayName,
                prefix: team.prefix,
                suffix: team.suffix,
                color: team.color,
                players: Array.from(team.players)
            });
        }
        return teams;
    }
    
    getPlayerTeam(playerName) {
        if (!this.proxy.currentPlayer?.gameState) return null;
        
        const teamData = this.proxy.currentPlayer.gameState.getPlayerTeam(playerName);
        if (!teamData) return null;
        
        return {
            name: teamData.name,
            displayName: teamData.displayName,
            prefix: teamData.prefix,
            suffix: teamData.suffix,
            color: teamData.color,
            players: Array.from(teamData.players)
        };
    }
}

module.exports = World; 