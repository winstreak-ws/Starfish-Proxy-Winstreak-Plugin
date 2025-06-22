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

- `/anticheat config` - Show current anticheat configuration

Available checks: `NoSlowA`, `AutoBlockA`, `EagleA`, `ScaffoldA`, `ScaffoldB`, `TowerA`

### Denicker Commands

Detects nicked (disguised) players by analyzing skin data:

- `/denicker config` - Show current denicker configuration

### Help System

Each module supports `/help` commands:
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

Basic plugin structure:

```javascript
module.exports = (proxyAPI) => {
    // Register plugin info
    proxyAPI.registerPlugin({
        name: 'MyPlugin',
        displayName: 'MyPlugin',
        prefix: '§cMP'
        version: '1.0.0',
        auther: 'Me'
        description: 'Custom plugin description'
    });
    
    // TODO
};
```

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
