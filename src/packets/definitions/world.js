module.exports = {
    client: {
        block_place: {
            safe: false,
            eventMapping: {
                name: 'client.blockPlace',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    location: data.location,
                    direction: data.direction,
                    heldItem: data.heldItem,
                    cursorX: data.cursorX,
                    cursorY: data.cursorY,
                    cursorZ: data.cursorZ
                })
            }
        },
        block_dig: {
            safe: false,
            eventMapping: {
                name: 'client.blockDig',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    status: data.status,
                    location: data.location,
                    face: data.face
                })
            }
        }
    },
    server: {
        map_chunk: {
            safe: false,
            updatesState: true
        },
        map_chunk_bulk: {
            safe: false,
            updatesState: true
        },
        block_change: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'world.blockChange',
                extractor: (data) => ({
                    location: data.location,
                    type: data.type
                })
            }
        },
        multi_block_change: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'world.multiBlockChange',
                extractor: (data) => ({
                    chunkX: data.chunkX,
                    chunkZ: data.chunkZ,
                    records: data.records
                })
            }
        },
        explosion: {
            safe: true,
            eventMapping: {
                name: 'world.explosion',
                extractor: (data) => ({
                    x: data.x,
                    y: data.y,
                    z: data.z,
                    radius: data.radius,
                    records: data.records,
                    playerMotionX: data.playerMotionX,
                    playerMotionY: data.playerMotionY,
                    playerMotionZ: data.playerMotionZ
                })
            }
        },
        sound_effect: {
            safe: true,
            eventMapping: {
                name: 'world.sound',
                extractor: (data) => ({
                    soundName: data.soundName,
                    x: data.x / 8,
                    y: data.y / 8,
                    z: data.z / 8,
                    volume: data.volume,
                    pitch: data.pitch
                })
            }
        },
        named_sound_effect: {
            safe: true,
            eventMapping: {
                name: 'world.sound',
                extractor: (data) => ({
                    soundName: data.soundName,
                    x: data.x / 8,
                    y: data.y / 8,
                    z: data.z / 8,
                    volume: data.volume,
                    pitch: data.pitch
                })
            }
        },
        particle: {
            safe: true,
            eventMapping: {
                name: 'world.particle',
                extractor: (data) => ({
                    particleId: data.particleId,
                    longDistance: data.longDistance,
                    x: data.x,
                    y: data.y,
                    z: data.z,
                    offsetX: data.offsetX,
                    offsetY: data.offsetY,
                    offsetZ: data.offsetZ,
                    particleData: data.particleData,
                    particles: data.particles,
                    data: data.data
                })
            }
        },
        game_state_change: {
            safe: false,
            eventMapping: {
                name: 'world.gameStateChange',
                extractor: (data) => ({
                    reason: data.reason,
                    gameMode: data.gameMode
                })
            }
        },
        update_time: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'world.time',
                extractor: (data) => ({
                    age: data.age,
                    time: data.time
                })
            }
        }
    }
};