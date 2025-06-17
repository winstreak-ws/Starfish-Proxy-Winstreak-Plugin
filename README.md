# Minecraft Proxy

A local Minecraft proxy server with Microsoft authentication and dynamic server switching capabilities.

## Features

- Automatic Microsoft account authentication
- Dynamic server switching without restarting
- Plugin system for extensions

## Quick Start

### Installation

```bash
npm install
```

### Usage

1. Start the proxy:
```bash
node proxy.js
```

2. Connect with Minecraft:
   - Add server: `localhost:25565` 
   - Connect to trigger authentication
   - Complete Microsoft login in the browser that opens automatically
   - Reconnect after authentication completes

## Commands

All commands are used in-game via chat:

- `/server` - List available servers and show current target
- `/server <name>` - Switch to a predefined server
- `/server <host:port>` - Connect to any server by address
- `/addserver <name> <host:port>` - Add a server to your saved list
- `/removeserver <name>` - Remove a server from your saved list
- `/reauth` - Clear authentication cache and re-authenticate
- `/help` - Show all available commands

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

Server changes made via `/server` commands are automatically saved to this configuration.

## Server Switching

Example server switching workflow:

```
/server hypixel                    # Switch to predefined server
/server play.example.com:25565     # Switch to custom server
/addserver myserver mc.test.com    # Save a server for later
/server myserver                   # Use saved server
```

After switching, the proxy will disconnect you. Simply reconnect to connect to the new target server.

## Included Plugins

The proxy comes with two built-in plugins:

### Anticheat
Advanced cheater detection system that monitors other players for suspicious behavior patterns.

Features:
- NoSlow detection (sprinting while using items)
- AutoBlock detection (attacking while blocking)
- Rotation checks (impossible head movements)
- Scaffold detection (bridging cheats)
- Tower detection (rapid vertical scaffold)

Commands:
- `/anticheat help` - Show all anticheat commands
- `/anticheat toggle` - Enable/disable the system
- `/anticheat status` - View current settings and violations
- `/anticheat check <name> <on/off>` - Toggle specific checks

### Denicker
Detects nicked (disguised) players by analyzing their skin data and behavior patterns.

Features:
- Automatic skin hash analysis
- Profile name extraction from texture data
- Configurable alert system
- Debug mode for troubleshooting

Commands:
- `/denicker help` - Show all denicker commands
- `/denicker toggle` - Enable/disable the system
- `/denicker status` - View current settings
- `/denicker failed` - Toggle showing failed detection attempts

## Custom Plugins

The proxy supports custom plugins placed in the `scripts/` directory. Each `.js` file is automatically loaded as a plugin.

Basic plugin structure:

```javascript
module.exports = (proxyAPI) => {
    proxyAPI.registerPlugin({
        name: 'MyPlugin',
        description: 'Plugin description'
    });
    
    proxyAPI.on('playerJoin', (event) => {
        // Handle player join
    });
    
    proxyAPI.on('serverPacket', (event) => {
        // Handle server packets
        // Cancel with: event.cancelled = true;
    });
};
```

## Authentication

- Authentication tokens are cached in `auth_cache/` directory
- Use `/reauth` to clear cache and re-authenticate
- Browser will open automatically for Microsoft authentication
