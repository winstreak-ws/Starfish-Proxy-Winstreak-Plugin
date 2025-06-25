const EventEmitter = require('events');

class Events extends EventEmitter {
    constructor(proxy, core) {
        super();
        this.proxy = proxy;
        this.core = core;
        this.eventHandlers = new Map();
        this.eventChains = new Map();
        
        this.packetInterceptors = new Map();
        this.packetInterceptors.set('server', new Map());
        this.packetInterceptors.set('client', new Map());
        
        // packets that are restricted from interception to prevent anticheat flags and other bad things
        this.restrictedPackets = {
            client: new Set([
                'position',
                'position_look', 
                'look',
                'entity_action',
                
                'arm_animation',
                'use_entity',

                'block_place',
                'block_dig',
                'player_digging',

                'held_item_slot',
                'window_click',
                'creative_inventory_action',
                'enchant_item',

                'client_command',
                'spectate',
                'steer_vehicle',
                'flying',
                'abilities'
            ]),
            server: new Set([
                'entity_teleport',
                'rel_entity_move',
                'entity_look',
                'entity_look_and_move',
                'entity_velocity',
                'entity_head_rotation',
                
                'map_chunk',
                'block_change',
                'multi_block_change',
                'explosion',
                'world_border',
                'spawn_position',
                
                'position',
                'abilities',
                'game_state_change',
                'experience',
                'health',
                
                'entity_status',
                'entity_effect',
                'remove_entity_effect',
                
                'set_slot',
                'window_items',
                'entity_equipment',
                
                'login',
                'respawn',
                'keep_alive'
            ])
        };
    }
    
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
        
        return {
            on: (nextEvent, nextHandler) => {
                this.on(nextEvent, nextHandler);
                return this.on(nextEvent, nextHandler);
            }
        };
    }
    
    emit(event, data) {
        if (!this.core.enabled) return;
        
        if (!data || typeof data !== 'object') {
            this.core.log(`Warning: Event '${event}' emitted with invalid data: ${typeof data}`);
            return;
        }
        
        data.api = this.proxy.pluginAPI;
        
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (error) {
                    this.core.log(`Error in event handler for ${event}: ${error.message}`);
                    if (this.core.debug) {
                        console.error(error);
                    }
                }
            }
        }
        
        super.emit(event, data);
    }
    
    registerPacketInterceptor(direction, packetNames, handler) {
        if (!this.packetInterceptors.has(direction)) {
            throw new Error(`Invalid direction: ${direction}. Must be 'server' or 'client'`);
        }
        
        const restrictedSet = this.restrictedPackets[direction];
        for (const packetName of packetNames) {
            if (restrictedSet.has(packetName)) {
                throw new Error(`Packet '${packetName}' is restricted and cannot be intercepted for security reasons (prevents anticheat flags)`);
            }
        }
        
        const directionMap = this.packetInterceptors.get(direction);
        
        for (const packetName of packetNames) {
            if (!directionMap.has(packetName)) {
                directionMap.set(packetName, new Set());
            }
            directionMap.get(packetName).add(handler);
        }
    }
    
    unregisterPacketInterceptor(direction, packetNames, handler) {
        if (!this.packetInterceptors.has(direction)) {
            return;
        }
        
        const directionMap = this.packetInterceptors.get(direction);
        
        for (const packetName of packetNames) {
            if (directionMap.has(packetName)) {
                directionMap.get(packetName).delete(handler);
                
                if (directionMap.get(packetName).size === 0) {
                    directionMap.delete(packetName);
                }
            }
        }
    }
    
    hasPacketInterceptors(direction, packetName) {
        const directionMap = this.packetInterceptors.get(direction);
        return directionMap && directionMap.has(packetName) && directionMap.get(packetName).size > 0;
    }
    
    getPacketInterceptors(direction, packetName) {
        const directionMap = this.packetInterceptors.get(direction);
        if (!directionMap || !directionMap.has(packetName)) {
            return [];
        }
        return Array.from(directionMap.get(packetName));
    }
    
    // allowed packets for interception
    getAllowedPackets(direction) {
        const commonSafePackets = {
            client: ['chat'],
            server: ['chat', 'title', 'subtitle', 'actionbar', 'player_list_item', 'teams', 'scoreboard_objective', 'scoreboard_score', 'sound_effect', 'named_sound_effect']
        };
        
        return commonSafePackets[direction] || [];
    }
}

module.exports = Events; 