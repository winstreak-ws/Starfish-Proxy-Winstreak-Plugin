const path = require('path');
const mc = require('minecraft-protocol');
const EventEmitter = require('events');
const fs = require('fs');

class ProxyAPI extends EventEmitter {}
const proxyAPI = new ProxyAPI();

proxyAPI.sendToClient = (client, metaName, data) => {
    try {
        client.write(metaName, data);
        // console.log(`Sent packet to client: ${metaName}`);
    } catch (err) {
        console.error(`Error sending packet to client: ${err.message}`);
    }
};

proxyAPI.sendToServer = (targetClient, metaName, data) => {
    try {
        targetClient.write(metaName, data);
        // console.log(`Sent packet to server: ${metaName}`);
    } catch (err) {
        console.error(`Error sending packet to server: ${err.message}`);
    }
};

// Load all scripts from the "scripts" folder
const scriptsFolder = path.join(__dirname, 'scripts');
fs.readdirSync(scriptsFolder).forEach((file) => {
    if (file.endsWith('.js')) {
        require(path.join(scriptsFolder, file))(proxyAPI);
    }
});

// Configuration
const proxyPort = 25565; // Port for the proxy to listen on
const targetHost = 'anticheat-test.com'; // Target server hostname
const targetPort = 25565; // Target server port

// Create the proxy server
const server = mc.createServer({
    'online-mode': false, // Disable online mode for the proxy
    version: '1.8.9',
    port: proxyPort,
    keepAlive: false,
});

server.on('login', async (client) => {
    console.log(`Player ${client.username} connected to the proxy.`);

    try {
        // Create a connection to the target server with Microsoft authentication
        const targetClient = mc.createClient({
            host: targetHost,
            port: targetPort,
            username: client.username,
            version: '1.8.9',
            auth: 'microsoft', // Use built-in Microsoft authentication
        });

        targetClient.on('session', () => {
            console.log('Login to target server successful.');
        });

        // Handle compression
        let clientCompressionEnabled = false;
        let targetCompressionEnabled = false;

        // Pipe data between the client and the target server
        client.on('packet', (data, meta) => {
            proxyAPI.emit('clientPacket', { data, meta, client, targetClient });

            if (client.state === mc.states.PLAY && targetClient.state === mc.states.PLAY) {
                try {
                    targetClient.write(meta.name, data);
                } catch (err) {
                    console.error(`Error forwarding packet to target server: ${err.message}`);
                }
            } else {
                console.log(`Skipping packet ${meta.name} because one or both sides are not in PLAY state.`);
            }
        });

        targetClient.on('packet', (data, meta) => {
            proxyAPI.emit('serverPacket', { data, meta, client, targetClient });

            if (client.state === mc.states.PLAY && targetClient.state === mc.states.PLAY) {
                try {
                    client.write(meta.name, data);
                    if (meta.name === 'set_compression') {
                        client.compressionThreshold = data.threshold
                      }
                } catch (err) {
                    console.error(`Error forwarding packet to client: ${err.message}`);
                }
            } else {
                console.log(`Skipping packet ${meta.name} because one or both sides are not in PLAY state.`);
            }
        });

        // Handle disconnections
        client.on('end', () => {
            console.log(`Player ${client.username} disconnected from the proxy.`);
            targetClient.end();
        });

        targetClient.on('end', () => {
            console.log(`Connection to target server ended for ${client.username}.`);
            client.end();
        });

        client.on('error', (err) => {
            console.error(`Client error: ${err.message}`);
            targetClient.end();
        });

        targetClient.on('error', (err) => {
            console.error(`Target server error: ${err.message}`);
            client.end();
        });
    } catch (err) {
        console.error(`Authentication failed for ${client.username}: ${err.message}`);
        client.end('Failed to authenticate with Microsoft.');
    }
});

console.log(`Proxy server is running on port ${proxyPort}`);
