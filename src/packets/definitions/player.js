module.exports = {
    client: {
        client_settings: {
            safe: false,
            eventMapping: {
                name: 'client.settings',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    locale: data.locale,
                    viewDistance: data.viewDistance,
                    chatFlags: data.chatFlags,
                    chatColors: data.chatColors,
                    skinParts: data.skinParts
                })
            }
        },
        client_command: {
            modifiable: false,
            interceptable: false
        },
        spectate: {
            safe: false
        },
        abilities: {
            safe: false
        }
    },
    server: {
        player_info: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'playerList.update',
                extractor: (data, session) => {
                    const updates = [];
                    
                    for (const player of data.data) {
                        let update = {
                            uuid: player.UUID,
                            action: data.action
                        };
                        
                        switch(data.action) {
                            case 0: // add player
                                update = {
                                    ...update,
                                    name: player.name,
                                    properties: player.properties,
                                    gamemode: player.gamemode,
                                    ping: player.ping
                                };
                                break;
                            case 1: // update gamemode
                                update.gamemode = player.gamemode;
                                break;
                            case 2: // update latency
                                update.ping = player.ping;
                                break;
                            case 3: // update display name
                                update.displayName = player.displayName;
                                break;
                            case 4: // remove player
                                break;
                        }
                        
                        updates.push(update);
                    }
                    
                    return { action: data.action, players: updates };
                }
            }
        },
        spawn_position: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'world.spawnPosition',
                extractor: (data) => ({
                    location: data.location
                })
            }
        },
        respawn: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'player.respawn',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    dimension: data.dimension,
                    difficulty: data.difficulty,
                    gamemode: data.gamemode,
                    levelType: data.levelType
                })
            }
        },
        experience: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'player.experience',
                extractor: (data) => ({
                    experienceBar: data.experienceBar,
                    level: data.level,
                    totalExperience: data.totalExperience
                })
            }
        },
        update_health: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'player.health',
                extractor: (data) => ({
                    health: data.health,
                    food: data.food,
                    foodSaturation: data.foodSaturation
                })
            }
        },
        abilities: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'player.abilities',
                extractor: (data) => ({
                    flags: data.flags,
                    flyingSpeed: data.flyingSpeed,
                    walkingSpeed: data.walkingSpeed
                })
            }
        },
        position: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'player.teleport',
                extractor: (data) => ({
                    x: data.x,
                    y: data.y,
                    z: data.z,
                    yaw: data.yaw,
                    pitch: data.pitch,
                    flags: data.flags
                })
            }
        }
    }
};