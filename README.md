# Starfish Proxy

A personal Minecraft proxy server with Microsoft authentication, dynamic server switching, and advanced plugin system.

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
- FEATURE COMPLETE
- Change config options

#### BW-Stats
**Chat/tab stats for players at the start of your bedwars game**
- Haven't started

## Features

- Single-player personal proxy (runs locally, supports one player)
- Automatic Microsoft account authentication with caching
- Dynamic server switching without restarting
- Advanced plugin system with anticheat and denicker included

## Quick Start

1. Install latest from Releases tab

2. Extract the .zip and run the executable

3. Connect with any Minecraft 1.8.9 Client:
   - Add server: `localhost:25565` 
   - Connect to trigger authentication
   - Complete Microsoft login in the browser that opens automatically
   - Reconnect after authentication completes

### Installation

```bash
npm install
```

### Usage

1. Start the proxy:
```bash
node src/proxy.js
```

2. Connect with any Minecraft 1.8.9 Client:
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
- `/proxy plugins` - List all loaded plugins and their status

### Anticheat Commands

Advanced cheater detection system with multiple behavioral checks:

- `/anticheat config` - Interactive config menu with enable/disable, debug, and all anticheat settings

Available checks: `NoSlowA`, `AutoBlockA`, `EagleA`, `ScaffoldA`, `ScaffoldB`, `TowerA`

### Denicker Commands

Detects nicked (disguised) players by analyzing skin data:

- `/denicker config` - Interactive config menu with enable/disable, debug, and denicker settings

### Help & Config System

Each plugin automatically gets standardized help and config commands:
- `/plugin-name help` - Show all commands with pagination
- `/plugin-name config` - Interactive config menu with pagination
- `/proxy help` - Show proxy commands
- `/anticheat help` - Show anticheat commands  
- `/denicker help` - Show denicker commands

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
starfish-proxy/
├── src/
│   ├── proxy.js
│   ├── session.js
│   ├── command-handler.js
│   ├── plugin-api.js
│   └── storage.js
├── scripts/
│   ├── anticheat.js
│   └── denicker.js
├── data/
│   └── config/
└── auth_cache/
```

## Server Switching

Example server switching workflow:

```
/proxy server hypixel                    # Switch to predefined server
/proxy server play.example.com:25565     # Switch to custom server
/proxy addserver myserver mc.test.com    # Save a server for later
/proxy server myserver                   # Use saved server
```

After switching, Starfish Proxy will disconnect you with a message to reconnect to the new target server.

## Included Plugins

### Anticheat System
Advanced behavioral analysis system that detects various cheating patterns:

**Detection Types:**
- **NoSlowA**: Detects sprinting while using items that should slow movement
- **AutoBlockA**: Detects attacking while blocking with sword
- **EagleA**: Detects diagonal double-shifting scaffold patterns
- **ScaffoldA**: Detects blatant scaffold with fast movement
- **ScaffoldB**: Detects high-speed backward bridging with air time (keep-y behavior)
- **TowerA**: Detects ascending faster than normal while placing blocks

**Features:**
- Configurable violation levels and alert cooldowns
- Sound notifications
- Per-check enable/disable controls

### Denicker System  
Detects nicked (disguised) players through skin data analysis:

**Features:**
- Automatic skin hash analysis against known nick skins
- Real username extraction from texture data

**Alert Format:**
```
[Starfish-DN] BlueRealName is nicked as BluePlayer.
[Starfish-AC] RedPlayer flagged ScaffoldA (VL: 15)
```

## Custom Plugins

The proxy supports custom plugins placed in the `scripts/` directory. Each `.js` file is automatically loaded.

### Basic Plugin Structure

```javascript
module.exports = (api) => {
    // register plugin metadata (this is all that's required!)
    api.metadata({
        name: 'my-plugin',
        displayName: 'My Plugin',
        prefix: '§cMP',
        version: '1.0.0',
        author: 'Your Name',
        description: 'Plugin description'
    });
    
    // optionally define config schema for plugin-specific settings
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
    
    // register commands (optional)
    api.commands((registry) => {
        const { command } = registry;
        
        command('status')
            .description('Show plugin status')
            .handler((ctx) => {
                ctx.send('§aMy Plugin is running!');
            });
            
        // Config command is automatic! Every plugin gets:
        // /my-plugin config - with enable/disable, debug, reset, and custom options
    });
    
    // observe player events (recommended for most plugins)
    api.on('player.move', (data) => {
        api.log(`Player ${data.player.name} moved to ${data.position.x}, ${data.position.y}, ${data.position.z}`);
    });
    
    // observe chat events
    api.on('chat', (data) => {
        if (data.text && data.text.includes('hello')) {
            api.chat('Hello back!');
        }
    });
    
    // handle plugin restoration (when re-enabled after being disabled)
    api.on('plugin.restored', (data) => {
        if (data.pluginName === 'my-plugin') {
            // plugin was just re-enabled, access current world state
            const { players, gameState, teams } = data.currentState;
            api.log('Plugin re-enabled! Current players: ' + players.length);
        }
    });
};
```

### Performance-First Design

**For best performance, most plugins should use observation-only events.** The proxy uses a fast-path forwarding system that immediately forwards packets to the client while handling plugin events asynchronously. This provides optimal latency for gameplay.

### Packet Interception API

When you need to **modify or cancel packets** (rare cases), use the packet interception API:

```javascript
module.exports = (api) => {
    api.metadata({
        name: 'packet-modifier',
        displayName: 'Packet Modifier'
    });
    
    // intercept server→client chat packets (safe)
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
    
    // cleanup when plugin unloads
    return { cleanup: () => unsubscribe() };
};
```

#### Security Restrictions

**For security and anticheat protection, most packets are restricted from interception.** Only cosmetic/safe packets can be intercepted:

**Allowed Packets:**
- **Server→Client**: `chat`, `title`, `subtitle`, `sound_effect`, `named_sound_effect`, `player_list_item`, `teams`, `scoreboard_*`
- **Client→Server**: `chat` (only)

**Restricted Packets (Will throw error if attempted):**
- **Movement**: `position`, `position_look`, `look`, `entity_action` 
- **Combat**: `arm_animation`, `use_entity`, `entity_status`
- **Blocks**: `block_place`, `block_dig`, `player_digging`
- **Inventory**: `held_item_slot`, `window_click`, `set_slot`
- **Entity/World State**: `entity_teleport`, `map_chunk`, `block_change`
- **And many others** - see console error for full list

These restrictions prevent plugins from triggering Hypixel's anticheat systems.

### API Reference

**Observation Events (Fast Path - Recommended):**
- `api.on(event, handler)` - Listen to game events without affecting packet flow
- Events: `'player.move'`, `'player.action'`, `'chat'`, `'player.join'`, `'player.leave'`, etc.

**Packet Interception (Slower - Use Only When Needed):**
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
- **No registration needed** - Config command appears automatically for all plugins

**Automatic Plugin Management:**
- **Global enable/disable works regardless of plugin code** - All API calls are blocked when disabled
- **Automatic cleanup on disable**: Removes display names, packet interceptors, and modifications
- **State restoration on enable**: Plugins receive current world state via `plugin.restored` event
- **No developer effort required** - Works for any plugin automatically

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

See `scripts/example-packet-interceptor.js` for a complete example demonstrating both observation and interception patterns.

## Authentication

- Authentication tokens are cached in `auth_cache/<username>/` directories
- Use `/proxy reauth` to clear cache and re-authenticate
- Browser opens automatically for Microsoft authentication
- Supports offline mode for initial authentication, then switches to online mode

## Building

To build a standalone executable:

```bash
node build.js
```

This creates a single executable file that includes all dependencies.
