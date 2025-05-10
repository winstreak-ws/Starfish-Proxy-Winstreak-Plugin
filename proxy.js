const path = require('path');
const mc = require('minecraft-protocol');
const EventEmitter = require('events');
const fs = require('fs');

// Configuration
const proxyPort = 25565; // Port for the proxy to listen on
const targetHost = 'anticheat-test.com'; // Target server hostname
const targetPort = 25565; // Target server port

class ProxyAPI extends EventEmitter {
    constructor() {
        super();
        this.client = null; // Will hold the client connection
        this.targetClient = null; // Will hold the target server connection
    }

    sendToClient(metaName, data) {
        try {
            if (this.client) {
                this.client.write(metaName, data);
                // console.log(`Sent packet to client: ${metaName}`);
            } else {
                console.error('No client connected to send data to.');
            }
        } catch (err) {
            console.error(`Error sending packet to client: ${err.message}`);
        }
    }

    sendToServer(metaName, data) {
        try {
            if (this.targetClient) {
                this.targetClient.write(metaName, data);
                // console.log(`Sent packet to server: ${metaName}`);
            } else {
                console.error('No target server connected to send data to.');
            }
        } catch (err) {
            console.error(`Error sending packet to server: ${err.message}`);
        }
    }
}

const proxyAPI = new ProxyAPI();

// Load all scripts from the "scripts" folder
const scriptsFolder = path.join(__dirname, 'scripts');
fs.readdirSync(scriptsFolder).forEach((file) => {
    if (file.endsWith('.js')) {
        require(path.join(scriptsFolder, file))(proxyAPI);
    }
});

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

        // Assign the client and targetClient to proxyAPI
        proxyAPI.client = client;
        proxyAPI.targetClient = targetClient;

        targetClient.on('session', () => {
            console.log('Login to target server successful.');
        });

        // Handle compression
        let clientCompressionEnabled = false;
        let targetCompressionEnabled = false;

        // Pipe data between the client and the target server
        client.on('packet', (data, meta) => {
            proxyAPI.emit('clientPacket', { data, meta });

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
            proxyAPI.emit('serverPacket', { data, meta });

            if (client.state === mc.states.PLAY && targetClient.state === mc.states.PLAY) {
                try {
                    client.write(meta.name, data);
                    if (meta.name === 'set_compression') {
                        client.compressionThreshold = data.threshold;
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
            proxyAPI.client = null;
            proxyAPI.targetClient = null;
        });

        targetClient.on('end', () => {
            console.log(`Connection to target server ended for ${client.username}.`);
            client.end();
            proxyAPI.client = null;
            proxyAPI.targetClient = null;
        });

        client.on('error', (err) => {
            console.error(`Client error: ${err.message}`);
            targetClient.end();
            proxyAPI.client = null;
            proxyAPI.targetClient = null;
        });

        targetClient.on('error', (err) => {
            console.error(`Target server error: ${err.message}`);
            client.end();
            proxyAPI.client = null;
            proxyAPI.targetClient = null;
        });
    } catch (err) {
        console.error(`Authentication failed for ${client.username}: ${err.message}`);
        client.end('Failed to authenticate with Microsoft.');
    }
});

console.log(`Proxy server is running on port ${proxyPort}`);
