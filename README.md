# Minecraft Proxy with AntiCheat & Denicker

A powerful and user-friendly Minecraft proxy server with built-in anticheat detection and player denicking capabilities.

## Features

- **Easy Setup**: Automatic Microsoft account authentication on first connect
- **Server Switching**: Change servers without restarting the proxy
- **Plugin System**: Create your own plugin or use one of the provided ones

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Proxy

```bash
node proxy.js
```

### 3. Connect with Minecraft

1. Open Minecraft and add server `localhost`
2. You'll see the proxy MOTD show your currently selected server and plugins
3. Connect to the server
4. **Follow the authentication prompt** - a browser window will open automatically
5. Complete Microsoft login
6. You're connected!

## In-Game Commands

### 🌐 Server Management

- `/server` - List available servers and see current connection
- `/server <name>` - Quick switch to a predefined server
- `/server <host:port>` - Connect to any server
- `/addserver <name> <host:port>` - Save a server for quick access
- `/removeserver <name>` - Remove a saved server

### 📚 General

- `/help` or `/proxy` - Show all proxy commands

## Server Switching

The proxy makes it easy to switch between servers:

```
/server hypixel     # Switch to Hypixel
/server anticheat-test # Switch to the anticheat test server
/server play.example.com:25565  # Connect to custom server
```

When you switch servers, the proxy will:
1. Save your choice
2. Disconnect you with a message
3. Use the new server when you reconnect


## Extending the Proxy

Create new plugins in the `scripts/` directory:

```javascript
module.exports = (proxyAPI) => {
    // Listen for server packets
    proxyAPI.on('serverPacket', (event) => {
        const { username, data, meta } = event;
        // Process packets
    });
    
    // Listen for client packets
    proxyAPI.on('clientPacket', (event) => {
        const { username, data, meta } = event;
        // Cancel packet: event.cancelled = true;
    });
    
    // Send chat messages
    proxyAPI.sendToClient(username, 'chat', {
        message: JSON.stringify({ text: 'Hello!' }),
        position: 0
    });
};
```

## Security Notes

- Keep your `auth-cache/` directory secure - it contains auth tokens
