# Starfish Proxy

A personal Minecraft proxy server with Microsoft authentication, dynamic server switching, and advanced plugin system.

## TODO

#### Minor
- Finish config menu (common color theme, fix ugly tooltips)
- Config version system for plugins(?)
- Make a real dev clean up code

#### Major
- Urchin integration plugin (auto-blacklisting, blacklisted player alerts)
- Hypixel utils plugin (auto /who, client tags in tab, session tracking)

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

- `/anticheat config` - Show current anticheat configuration
- `/anticheat debug` - Toggle debug mode
- `/anticheat toggle <check_name>` - Enable/disable specific checks
- `/anticheat sound <check_name>` - Toggle alert sounds for specific checks
- `/anticheat vl <check_name> <level>` - Set violation level threshold
- `/anticheat cooldown <check_name> <seconds>` - Set alert cooldown
- `/anticheat info <check_name>` - Show detailed check information
- `/anticheat reset <check_name>` - Reset check to default settings

Available checks: `NoSlowA`, `AutoBlockA`, `RotationA`, `ScaffoldA`, `ScaffoldB`, `ScaffoldC`, `TowerA`

### Denicker Commands

Detects nicked (disguised) players by analyzing skin data:

- `/denicker config` - Show current denicker configuration
- `/denicker debug` - Toggle debug mode
- `/denicker allnicks` - Toggle alerts for all detected nicks
- `/denicker delay <milliseconds>` - Set alert delay

### Help System

Each module supports `/help` commands:
- `/proxy help` - Show proxy commands
- `/anticheat help` - Show anticheat commands  
- `/denicker help` - Show denicker commands

## Configuration

The proxy creates a `proxy-config.json` file with your settings:

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
├── src/                    # Core proxy files
│   ├── proxy.js           # Main proxy server
│   ├── auth.js            # Microsoft authentication
│   ├── command-handler.js # Command processing
│   └── plugin-manager.js  # Plugin system
├── scripts/               # Plugin files
│   ├── anticheat.js      # Anticheat system
│   └── denicker.js       # Nick detection
├── auth_cache/           # Authentication cache
└── proxy-config.json     # Configuration file
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
- **RotationA**: Detects impossible head/body rotations (invalid pitch values)
- **ScaffoldA**: Detects diagonal double-shifting scaffold patterns
- **ScaffoldB**: Detects blatant scaffold with fast movement and snappy rotations
- **ScaffoldC**: Detects high-speed backward bridging with air time (keep-y behavior)
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
[Starfish-DN] BluePlayer is nicked as BlueRealName.
[Starfish-AC] RedPlayer flagged ScaffoldA (VL: 15)
```

## Custom Plugins

The proxy supports custom plugins placed in the `scripts/` directory. Each `.js` file is automatically loaded.

Basic plugin structure:

```javascript
module.exports = (proxyAPI) => {
    // Register plugin info
    proxyAPI.registerPlugin({
        name: 'MyPlugin',
        displayName: '§eMyPlugin',
        version: '1.0.0',
        description: 'Custom plugin description'
    });
    
    // Register commands
    proxyAPI.registerCommands('myplugin', {
        test: {
            description: 'Test command',
            handler: (client, args) => {
                proxyAPI.sendChatMessage('Test successful!');
            }
        }
    });
    
    // Event handlers
    proxyAPI.on('playerJoin', ({ username, player }) => {
        console.log(`Player ${username} joined`);
    });
    
    proxyAPI.on('serverPacketMonitor', ({ username, player, data, meta }) => {
        // Passive packet monitoring (zero latency)
    });
    
    proxyAPI.on('serverPacketIntercept', ({ username, player, data, meta }) => {
        // Can cancel packets: event.cancelled = true
    });
    
};
```

### Available Events
- `playerJoin` / `playerLeave` - Player connection events
- `serverPacketMonitor` / `clientPacketMonitor` - Passive packet monitoring
- `serverPacketIntercept` / `clientPacketIntercept` - Packet interception (can cancel)

### Plugin Utilities
- `proxyAPI.sendChatMessage(message)` - Send chat to current player
- `proxyAPI.sendToClient(packet, data)` - Send packet to client
- `proxyAPI.sendToServer(packet, data)` - Send packet to server
- `proxyAPI.currentPlayer` - Access current player object
- `proxyAPI.proxyPrefix` / `proxyAPI.proxyName` - Consistent branding

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
