module.exports = {
    client: {
        keep_alive: {
            safe: false,
            eventMapping: {
                name: 'client.keepAlive',
                extractor: (data) => ({
                    keepAliveId: data.keepAliveId
                })
            }
        },
        custom_payload: {
            safe: true,
            eventMapping: {
                name: 'client.customPayload',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    channel: data.channel,
                    data: data.data
                })
            }
        },
        resource_pack_receive: {
            safe: false
        },
        steer_vehicle: {
            safe: false
        }
    },
    server: {
        keep_alive: {
            safe: false,
            eventMapping: {
                name: 'server.keepAlive',
                extractor: (data) => ({
                    keepAliveId: data.keepAliveId
                })
            }
        },
        custom_payload: {
            safe: true,
            eventMapping: {
                name: 'server.customPayload',
                extractor: (data) => ({
                    channel: data.channel,
                    data: data.data
                })
            }
        },
        combat_event: {
            safe: false,
            eventMapping: {
                name: 'combat',
                extractor: (data) => {
                    switch(data.event) {
                        case 0: // enter combat
                            return { event: 'enter' };
                        case 1: // end combat
                            return {
                                event: 'end',
                                duration: data.duration,
                                entityId: data.entityId
                            };
                        case 2: // entity dead
                            return {
                                event: 'death',
                                playerId: data.playerId,
                                entityId: data.entityId,
                                message: data.message
                            };
                    }
                }
            }
        },
        scoreboard_objective: {
            safe: true,
            eventMapping: {
                name: 'scoreboard.objective',
                extractor: (data) => ({
                    name: data.name,
                    action: data.action,
                    displayText: data.displayText,
                    type: data.type
                })
            }
        },
        scoreboard_score: {
            safe: true,
            eventMapping: {
                name: 'scoreboard.score',
                extractor: (data) => ({
                    itemName: data.itemName,
                    action: data.action,
                    scoreName: data.scoreName,
                    value: data.value
                })
            }
        },
        scoreboard_display_objective: {
            safe: true,
            eventMapping: {
                name: 'scoreboard.displayObjective',
                extractor: (data) => ({
                    position: data.position,
                    name: data.name
                })
            }
        },
        scoreboard_team: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'teamUpdate',
                extractor: (data) => {
                    if ((data.mode === 3 || data.mode === 4) && data.team && !data.name) {
                        data.name = data.team;
                    }
                    
                    if (data.mode === 1 && data.team && !data.name) {
                        data.name = data.team;
                    }
                    
                    return data;
                }
            }
        },
        resource_pack_send: {
            safe: true,
            eventMapping: {
                name: 'resourcePack',
                extractor: (data) => ({
                    url: data.url,
                    hash: data.hash
                })
            }
        },
        statistics: {
            safe: false,
            eventMapping: {
                name: 'statistics',
                extractor: (data) => ({
                    entries: data.entries
                })
            }
        },
        login: {
            safe: false,
            updatesState: true
        },
        success: {
            safe: false
        }
    }
};