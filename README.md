# Starfish Proxy

A personal Minecraft proxy server designed for use with Hypixel, with an advanced plugin system.

## TODO

**Things to be finished before release- DM me (@hexze) if you'd like to cross something off the list, and make a pull request**

### Proxy
- Test and complete plugin API
   - Add versioning
- Exitlag compat(?)

### Plugins

#### Anticheat
**Chat alerts for blatant cheaters**
- Rewrite all checks
- Certainty threshold
   - Automatic blacklisting with Urchin plugin
   - Automatic /wdr button in chat
   - If Urchin is not installed, just add an icon to their display name

#### Urchin
**Integration with Urchin API, including automatic blacklisting, client tags and cheater gtags displayed next to player names, and more**
- Haven't started

#### Denicker
**Chat/tab indicators for nicks (resolves nicks when the player uses their player skin)**
- COMPLETE

#### BW-Stats
**Chat/tab stats for players at the start of your bedwars game**
- Haven't started


## Quick Start

1. Install latest from Releases tab

2. Extract the .zip and run the executable

3. Connect with any Minecraft 1.8.9 Client:
   - Add server: `localhost:25565` 
   - Connect to trigger authentication
   - Complete Microsoft login in the browser that opens automatically
   - Reconnect after authentication completes

### Development

1. Install Node.js
```bash
npm install
```

2. Start the proxy:
```bash
node src/proxy.js
```

3. Connect with any Minecraft 1.8.9 Client:
   - Add server: `localhost:25565` 
   - Connect to trigger authentication
   - Complete Microsoft login in the browser that opens automatically
   - Reconnect after authentication completes

### Building

1. Install Node.js
```bash
npm install
```

2. Start the proxy:
```bash
node build.js
```

3. Connect with any Minecraft 1.8.9 Client:
   - Add server: `localhost:25565` 
   - Connect to trigger authentication
   - Complete Microsoft login in the browser that opens automatically
   - Reconnect after authentication completes

## Commands

All commands are used in-game via chat. Commands use module prefixes:

### Proxy Commands

- `/proxy server` - List available servers and show current target
- `/proxy server <name>` - Switch to a predefined server  
- `/proxy server <host:port>` - Connect to any server by address
- `/proxy addserver <name> <host:port>` - Add a server to your saved list
- `/proxy removeserver <name>` - Remove a server from your saved list
- `/proxy reauth` - Clear authentication cache and re-authenticate
- `/proxy plugins` - List all loaded plugins and their command prefix

### Help & Config System

Each plugin automatically gets standardized help and config commands:
- `/plugin-name help` - Show all commands with pagination
- `/plugin-name config` - Interactive config menu with pagination
- `/proxy help` - Show proxy commands

## Configuration

The proxy creates a `starfish-config.json` file with your settings:

```json
{
  "proxyPort": 25565,
  "targetHost": "mc.hypixel.net",
  "targetPort": 25565,
  "version": "1.8.9",
  "servers": {
    "hypixel": { "host": "mc.hypixel.net", "port": 25565 },
    "ac-test": { "host": "anticheat-test.com", "port": 25565 }
  }
}
```

Server changes made via `/proxy server` commands are automatically saved.

## File Structure

```
todo
```

## Custom Plugins

The proxy supports custom plugins placed in the `plugins/` directory. Each `.js` file is automatically loaded.

### Basic Plugin Structure

```javascript
module.exports = (api) => {
    // register plugin metadata
    api.metadata({
        name: 'my-plugin',
        displayName: 'My Plugin',
        prefix: '§cMP', // [Starfish-MP]
        version: 'x.y.z', // minor version (y) must match proxy
        author: 'Your Name',
        description: 'Plugin description'
    });
    
    // define config schema for plugin-specific settings
    api.configSchema([
        {
            label: 'My Plugin Settings',
            settings: [
                {
                    key: 'myFeature.enabled',
                    type: 'toggle',
                    description: 'Enable my custom feature'
                }
            ],
            defaults: {
                myFeature: { enabled: true }
            }
        }
    ]);
    
    // config command will automatically be created based on provided schema
    
    // register additionalcommands
    api.commands((registry) => {
        const { command } = registry;
        
        command('status')
            .description('Show plugin status')
            .handler((ctx) => {
                ctx.send('§aMy Plugin is running!');
            });
            
    });
    
    // observe player events
    api.on('player.move', (data) => {
        api.log(`Player ${data.player.name} moved to ${data.position.x}, ${data.position.y}, ${data.position.z}`);
    });
    
    // observe chat events
    api.on('chat', (data) => {
        if (data.text && data.text.includes('hello')) {
            api.chat('Hello back!');
        }
    });
    
    // handle plugin restoration (re-enabled after being disabled)
    api.on('plugin.restored', (data) => {
        if (data.pluginName === 'my-plugin') {
            // plugin was just re-enabled, access current world state
            const { players, gameState, teams } = data.currentState;
            api.log('Plugin re-enabled! Current players: ' + players.length);
        }
    });
};
```

### Plugin API

When you need to **listen, modify, or cancel packets**, use the plugin packet API.
Safe packets can be modified or cancelled, but many packets are read-only to ensure the proxy and its plugins are safe to use on Hypixel.

```javascript
module.exports = (api) => {
    api.metadata({
        name: 'packet-modifier',
        displayName: 'Packet Modifier'
    });
    
    // intercept server→client chat packets
    const unsubscribe = api.interceptPackets({
        direction: 'server',  // 'server' or 'client'
        packets: ['chat']     // array of packet names
    }, (event) => {
        // cancel packet
        if (event.data.message.includes('BLOCKED')) {
            event.cancel();
            return;
        }
        
        // modify packet
        if (event.data.message.includes('MODIFY')) {
            event.modify({
                ...event.data,
                message: event.data.message.replace('MODIFY', '[MODIFIED]')
            });
        }
    });
    
    // observe movement packets (read-only)
    const observeMovement = api.interceptPackets({
        direction: 'client',
        packets: ['position', 'look'] // can listen to ANY packet
    }, (event) => {
        // observe position data (always works)
        api.log(`Player moved to: ${event.data.x}, ${event.data.y}, ${event.data.z}`);
        
        // event.cancel(); // would throw error - movement packets are read-only
        // event.modify({}); // would throw error - movement packets are read-only
    });
    
    // cleanup when plugin unloads
    return { cleanup: () => unsubscribe() };
};
```

#### Security Restrictions

**Plugins can LISTEN to any packet, but can only MODIFY safe packets:**

**Safe for Modification:**
- **Server→Client**: `chat`, `title`, `subtitle`, `sound_effect`, `named_sound_effect`, `player_list_item`, `teams`, `scoreboard_*`
- **Client→Server**: `chat` (only)

**Read-Only (Cannot Modify/Cancel):**
- **Movement**: `position`, `position_look`, `look`, `entity_action` 
- **Combat**: `arm_animation`, `use_entity`, `entity_status`
- **Blocks**: `block_place`, `block_dig`, `player_digging`
- **Inventory**: `held_item_slot`, `window_click`, `set_slot` // TODO: remove safe packets from restricted list
- **Entity/World State**: `entity_teleport`, `map_chunk`, `block_change`
- **And many others**

Attempting to call `event.cancel()` or `event.modify()` on restricted packets will throw an error.

### API Reference

**Observation Events (Use for Most Cases):**
- `api.on(event, handler)` - Listen to game events without affecting packet flow
- Events: `'player.move'`, `'player.action'`, `'chat'`, `'player.join'`, `'player.leave'`, etc.

**Packet Interception (Use Only When Needed):**
- `api.interceptPackets(options, handler)` - Intercept packets for modification/cancellation
- `options.direction`: `'server'` (server→client) or `'client'` (client→server)  
- `options.packets`: Array of packet names to intercept
- `handler(event)`: Function called for each intercepted packet
  - `event.data`: Packet data object
  - `event.meta`: Packet metadata (name, etc.)
  - `event.cancel()`: Cancel the packet (won't be forwarded)
  - `event.modify(newData)`: Modify packet data before forwarding
  - Returns unsubscribe function for cleanup

**Command Registration:**
- `api.commands((registry) => { ... })` - Register plugin commands using command builder pattern
  - `registry.command(name)` - Create a command builder
  - `.description(text)` - Set command description
  - `.argument(name, options)` - Add command arguments
  - `.handler((ctx) => { ... })` - Set command handler function
  - `ctx.send(message)` - Send message to player
  - `ctx.sendSuccess(message)` - Send success message
  - `ctx.sendError(message)` - Send error message

**Config System:**
- `api.metadata(object)` - **Required** - Register plugin metadata (name, version, etc.)
- `api.configSchema(array)` - **Optional** - Define custom config options that appear in config menu
- **Automatic config command** - Every plugin gets `/plugin-name config` with enable/disable/debug/reset

**Automatic Plugin Management:**
- **Plugins cannot execute code when disabled**
- **Plugins cannot access proxy internals**
- **Automatic cleanup on disable**: Removes display names, packet interceptors, and modifications
- **State restoration on enable**: Plugins receive current world state via `plugin.restored` event

**Other Methods:**
- `api.chat(message)` - Send chat message to player
- `api.log(message)` - Log message with plugin prefix
- `api.debugLog(message)` - Debug logging (only when debug enabled)
- `api.getPlayer(uuid)` - Get player information
- `api.players` - Array of all players

### Best Practices

1. **Use observation events by default** - Only intercept packets when you actually need to modify/cancel them
2. **Handle errors** - Always wrap interceptor handlers in try/catch blocks
3. **Minimize intercepted packets** - Only specify the exact packet types you need to modify
4. **Clean up properly** - Store unsubscribe functions and call them when your plugin unloads
5. **Test thoroughly** - Packet modification can break game functionality if done incorrectly

### Example Plugins

See `plugins/example-plugin.js` for a complete example demonstrating both observation and interception patterns.

## Plugin API Reference

### Configuration & Metadata

```javascript
api.metadata({ name: 'MyPlugin', version: '1.0.0', description: 'Plugin description' })
api.configSchema(schemaArray)
api.config.get(key)           // Get config value
api.config.set(key, value)    // Set config value
api.initializeConfig(schema)
api.saveCurrentConfig()

// Properties
api.debug                     // Boolean - debug mode state
```

### Events & Communication

```javascript
// Events
api.on(event, handler)
api.emit(event, data)
api.interceptPackets({ direction: 'server'|'client', packets: [...] }, handler) // observe ANY packet, modify safe only
api.everyTick(callback)
api.onWorldChange(callback)

// Chat & Communication
api.chat(message)
api.sound(name, x, y, z, volume?, pitch?)
api.sendTitle(title, subtitle?, fadeIn?, stay?, fadeOut?)
api.sendActionBar(text)
api.sendParticle(particleId, longDistance, x, y, z, offsetX?, offsetY?, offsetZ?, particleData?, particleCount?, data?)

// Logging
api.log(message)
api.debugLog(message)
```

### Player Data Access

```javascript
// Properties
api.players                   // Array of all players

// Query Methods
api.getPlayer(uuid)
api.getPlayerByName(name)
api.getPlayerInfo(uuid)
api.calculateDistance(pos1, pos2)
api.getPlayersWithinDistance(position, distance)
api.getPlayersInTeam(teamName)
```

### World Data Access

```javascript
api.getTeams()               // Array of team objects
api.getPlayerTeam(playerName) // Team object or null
```

### Packet Sending Methods

**Most methods are disabled by safe mode, to prevent the possibility of illegal modifications.**

#### Server Administration
```javascript
api.kick(reason)                                    // disabled by safe mode
api.sendKeepAlive(keepAliveId)
api.sendTabComplete(matches)
api.sendCustomPayload(channel, data)
api.sendLogin(entityId, gameMode, dimension, ...)   // disabled by safe mode
```

#### Player State
```javascript
api.sendHealth(health, food, foodSaturation)       // disabled by safe mode
api.sendExperience(experienceBar, level, total)    // disabled by safe mode
api.sendPosition(x, y, z, yaw, pitch, flags?)      // disabled by safe mode
api.sendAbilities(flags, flyingSpeed?, walkSpeed?) // disabled by safe mode
api.sendPlayerInfo(action, data)
```

#### Entity Management
```javascript
// Spawning (disabled by safe mode)
api.spawnPlayer(entityId, playerUUID, x, y, z, yaw, pitch, currentItem, metadata?)
api.spawnLiving(entityId, type, x, y, z, yaw, pitch, headPitch, vX?, vY?, vZ?, metadata?)
api.spawnObject(entityId, type, x, y, z, pitch, yaw, objectData, vX?, vY?, vZ?)
api.spawnExperienceOrb(entityId, x, y, z, count)

// Movement (disabled by safe mode)
api.setEntityVelocity(entityId, velocityX, velocityY, velocityZ)
api.teleportEntity(entityId, x, y, z, yaw, pitch, onGround?)
api.moveEntity(entityId, dX, dY, dZ, onGround?)
api.setEntityLook(entityId, yaw, pitch, onGround?)
api.setEntityLookAndMove(entityId, dX, dY, dZ, yaw, pitch, onGround?)
api.setEntityHeadRotation(entityId, headYaw)

// State (disabled by safe mode)
api.setEntityEquipment(entityId, slot, item)
api.addEntityEffect(entityId, effectId, amplifier, duration, hideParticles?)
api.removeEntityEffect(entityId, effectId)
api.setEntityStatus(entityId, entityStatus)
api.setEntityMetadata(entityId, metadata)
api.animateEntity(entityId, animation)
api.collectEntity(collectedEntityId, collectorEntityId)
api.attachEntity(entityId, vehicleId, leash?)
```

#### Inventory/GUI Management
```javascript
// Windows (disabled by safe mode)
api.openWindow(windowId, inventoryType, windowTitle, slotCount)
api.closeWindow(windowId)
api.setSlot(windowId, slot, item)
api.setWindowItems(windowId, items)
api.sendTransaction(windowId, action, accepted)
api.sendCraftProgress(windowId, property, value)
api.setHeldItemSlot(slot)
api.creativeInventoryAction(slot, item)
api.enchantItem(windowId, enchantment)

// Helpers (disabled by safe mode)
api.createChest(title, size?)
api.createHopper(title)
api.createDispenser(title)
api.fillWindow(windowId, item)
api.clearWindow(windowId)
```

#### World Manipulation
```javascript
// World (disabled by safe mode)
api.sendExplosion(x, y, z, radius, records?, playerMotionX?, playerMotionY?, playerMotionZ?)
api.sendBlockChange(location, type)
api.sendMultiBlockChange(chunkX, chunkZ, records)
api.sendWorldEvent(effectId, location, data, disableRelativeVolume?)
api.sendTimeUpdate(age, time)
api.sendSpawnPosition(x, y, z)
api.sendGameStateChange(reason, gameMode)

// Scoreboard
api.sendScoreboardObjective(objectiveName, mode, objectiveValue?, type?)
api.sendScoreboardScore(itemName, action, scoreName, value?)
api.sendScoreboardDisplay(position, scoreName)
api.sendTeams(team, mode, name?, prefix?, suffix?, friendlyFire?, nameTagVisibility?, color?, players?)
```

### Display Names & UI

```javascript
api.setCustomDisplayName(uuid, displayName)
api.clearCustomDisplayName(uuid)
api.updatePlayerList()
api.clearAllCustomDisplayNames()
```

### Commands

```javascript
api.commands({
    'mycommand': {
        description: 'Command description',
        action: (args, player, api) => {
            // Command logic
        }
    }
})
```

module.exports = { init };
```
