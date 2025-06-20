const mc = require('minecraft-protocol');
const { exec } = require('child_process');
const path = require('path');

class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.loginPacket = null;
        this.playerInfo = new Map();
        this.teamData = new Map();
        this.playerTeams = new Map();
        this.entityData = new Map();
    }

    setLoginPacket(packet) {
        this.loginPacket = packet;
    }

    updateFromServerPacket(metaName, data) {
        switch (metaName) {
            case 'player_info':
                if (data.data && Array.isArray(data.data)) {
                    for (const entry of data.data) {
                        const existing = this.playerInfo.get(entry.UUID) || {};
                        if (entry.name) existing.name = entry.name;
                        if (entry.displayName) existing.displayName = entry.displayName;
                        this.playerInfo.set(entry.UUID, existing);
                    }
                }
                break;
            case 'scoreboard_team':
                this._handleScoreboardTeam(data);
                break;
            case 'named_entity_spawn':
                this.entityData.set(data.entityId, {
                    uuid: data.playerUUID,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    yaw: data.yaw,
                    pitch: data.pitch,
                    onGround: true
                });
                break;
            case 'entity_destroy':
                if (Array.isArray(data.entityIds)) {
                    for (const id of data.entityIds) this.entityData.delete(id);
                }
                break;
            case 'rel_entity_move':
            case 'entity_move_look':
            case 'entity_look':
                this._updateEntityMovement(metaName, data);
                break;
            case 'entity_teleport':
                this._teleportEntity(data);
                break;
        }
    }

    _handleScoreboardTeam(data) {
        const { mode, team: teamName, players, prefix, suffix } = data;
        if (mode === 0 || mode === 2) {
            this.teamData.set(teamName, { prefix: prefix || '', suffix: suffix || '' });
            if (Array.isArray(players)) {
                for (const p of players) {
                    const clean = p.replace(/§./g, '');
                    this.playerTeams.set(clean, teamName);
                }
            }
        }
        if (mode === 3 && Array.isArray(players)) {
            for (const p of players) {
                const clean = p.replace(/§./g, '');
                this.playerTeams.set(clean, teamName);
            }
        }
        if (mode === 4 && Array.isArray(players)) {
            for (const p of players) {
                const clean = p.replace(/§./g, '');
                this.playerTeams.delete(clean);
            }
        }
        if (mode === 1) {
            this.teamData.delete(teamName);
            for (const [playerName, team] of Array.from(this.playerTeams.entries())) {
                if (team === teamName) this.playerTeams.delete(playerName);
            }
        }
    }

    _updateEntityMovement(type, data) {
        const ent = this.entityData.get(data.entityId);
        if (!ent) return;
        if (type === 'rel_entity_move' || type === 'entity_move_look') {
            ent.position.x += data.dX / 32;
            ent.position.y += data.dY / 32;
            ent.position.z += data.dZ / 32;
            ent.onGround = data.onGround;
        }
        if (type === 'entity_move_look' || type === 'entity_look') {
            ent.yaw = (data.yaw / 256) * 360;
            ent.pitch = (data.pitch / 256) * 360;
        }
    }

    _teleportEntity(data) {
        const ent = this.entityData.get(data.entityId);
        if (!ent) return;
        ent.position = { x: data.x / 32, y: data.y / 32, z: data.z / 32 };
        ent.yaw = (data.yaw / 256) * 360;
        ent.pitch = (data.pitch / 256) * 360;
        ent.onGround = data.onGround;
    }

    getPlayerInfo(uuid) { return this.playerInfo.get(uuid); }
    getTeamData(teamName) { return this.teamData.get(teamName); }
    getPlayerTeam(playerName) { return this.playerTeams.get(playerName); }
    getEntityData(entityId) { return this.entityData.get(entityId); }
    getDisplayName(uuid) {
        const info = this.playerInfo.get(uuid);
        if (!info) return null;

        let name = info.name || uuid;
        if (info.displayName) {
            try {
                const parsed = JSON.parse(info.displayName);
                name = this._extractTextFromJSON(parsed);
            } catch (e) { name = info.displayName; }
        }

        const clean = name.replace(/§./g, '');
        const teamName = this.playerTeams.get(clean);
        const team = teamName ? this.teamData.get(teamName) : null;

        return team ? `${team.prefix}${name}${team.suffix}` : name;
    }

    _extractTextFromJSON(node) {
        if (typeof node === 'string') return node;
        if (!node) return '';
        let result = node.text || '';
        if (Array.isArray(node.extra)) {
            for (const child of node.extra) {
                result += this._extractTextFromJSON(child);
            }
        }
        return result;
    }

    getSnapshot() {
        return {
            loginPacket: this.loginPacket,
            playerInfo: Array.from(this.playerInfo.entries()),
            teamData: Array.from(this.teamData.entries()),
            playerTeams: Array.from(this.playerTeams.entries()),
            entityData: Array.from(this.entityData.entries())
        };
    }
}


class PlayerSession {
    constructor(proxyManager, client) {
        this.proxyManager = proxyManager;
        this.client = client;
        this.targetClient = null;
        this.username = client.username;
        this.entityId = null;
        this.joinTime = Date.now();
        this.gameState = new GameState();
        this.authKeepAliveInterval = null;
        this.forceNextAuth = proxyManager.forceNextAuth;
        if (proxyManager.forceNextAuth) proxyManager.forceNextAuth = false;

        this.connect();
    }

    connect() {
        console.log(`Player ${this.username} connected. Authenticating and connecting to target...`);

        this.targetClient = mc.createClient({
            host: this.proxyManager.config.targetHost,
            port: this.proxyManager.config.targetPort,
            username: this.username,
            version: this.proxyManager.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: path.join(this.proxyManager.BASE_DIR, 'auth_cache', this.username),
            forceRefresh: this.forceNextAuth,
            onMsaCode: (data) => {
                this.authKeepAliveInterval = this._createAuthWorld(data);
            }
        });

        const onAuthHandled = () => {
            if (this.authKeepAliveInterval) {
                clearInterval(this.authKeepAliveInterval);
                this.authKeepAliveInterval = null;
            }
        };

        this.targetClient.on('session', () => {
            const realUsername = this.targetClient.session.selectedProfile.name;
            console.log(`Authenticated as ${realUsername}.`);
            if (this.authKeepAliveInterval) {
                this.proxyManager.sendChatMessage(this.client, `§a✓ Authenticated as ${realUsername}`);
            }
        });

        this.targetClient.on('error', (err) => {
            onAuthHandled();
            console.error(`Target connection error: ${err.message}`);
            this.targetClient = null;
            this.createLimboWorld();

            const messages = [
                '§6========================================',
                '   §6S§eta§fr§bfi§3sh §5P§5roxy §e- Connection Failed',
                '§6========================================',
                `§cFailed to connect to the target server.`,
                `§cReason: ${err.message}`,
                `§7You are now in limbo. Use §b/proxy server§7 to try another server.`,
                '§6========================================'
            ];
            this.proxyManager.sendChatMessage(this.client, messages.join('\n'));

            this.client.removeAllListeners('packet');
            this.client.on('packet', (data, meta) => {
                if (meta.name === 'chat' && data.message.startsWith('/')) {
                    if (this.proxyManager.commandHandler.handleCommand(data.message, this.client)) {
                        return;
                    }
                }
            });

            this.client.once('end', () => this.proxyManager.clearSession());
        });

        this.targetClient.once('login', (packet) => {
            onAuthHandled();
            this.setupPacketForwarding(packet);
        });
    }

    setupPacketForwarding(loginPacket) {
        this.gameState.reset();
        this.gameState.setLoginPacket(loginPacket);
        let cleanupDone = false;

        const doFinalCleanup = () => {
            if (cleanupDone) return;
            cleanupDone = true;
            this.proxyManager.proxyAPI.emit('playerLeave', { username: this.username, player: this });
            this.proxyManager.clearSession();
            this.gameState.reset();
        };

        this.client.on('end', () => {
            console.log(`Player ${this.username} disconnected.`);
            if (this.targetClient && this.targetClient.state !== mc.states.DISCONNECTED) {
                this.targetClient.end('Client disconnected');
            }
            doFinalCleanup();
        });

        this.client.on('error', (err) => {
            console.log(`Player ${this.username} error: ${err.message}`);
            if (this.targetClient && this.targetClient.state !== mc.states.DISCONNECTED) {
                this.targetClient.end('Client error');
            }
            doFinalCleanup();
        });

        this.targetClient.removeAllListeners('end');
        this.targetClient.removeAllListeners('error');

        this.targetClient.on('end', () => {
            if (this.client && this.client.state !== mc.states.DISCONNECTED) {
                this.client.end('Server disconnected');
            }
            doFinalCleanup();
        });

        this.targetClient.on('error', (err) => {
            if (this.client && this.client.state !== mc.states.DISCONNECTED) {
                this.client.end('Server error');
            }
            doFinalCleanup();
        });

        console.log(`Joined ${this.proxyManager.config.targetHost} as ${this.username}.`);
        this.entityId = loginPacket.entityId;

        this.client.write('login', loginPacket);
        this.proxyManager.proxyAPI.emit('playerJoin', { username: this.username, player: this });

        this.client.removeAllListeners('packet');
        this.client.on('packet', (data, meta) => {
            if (meta.name === 'chat' && this.proxyManager.commandHandler.handleCommand(data.message, this.client)) {
                return;
            }

            const passiveEvent = { username: this.username, player: this, data, meta };
            this.proxyManager.proxyAPI.emit('clientPacketMonitor', passiveEvent);

            const interceptEvent = { username: this.username, player: this, data, meta, cancelled: false };
            this.proxyManager.proxyAPI.emit('clientPacketIntercept', interceptEvent);

            if (!interceptEvent.cancelled && this.targetClient.state === mc.states.PLAY) {
                this.targetClient.write(meta.name, data);
            }
        });

        this.targetClient.removeAllListeners('packet');
        this.targetClient.on('packet', (data, meta) => {
            this.gameState.updateFromServerPacket(meta.name, data);
            const passiveEvent = { username: this.username, player: this, data, meta };
            this.proxyManager.proxyAPI.emit('serverPacketMonitor', passiveEvent);

            const interceptEvent = { username: this.username, player: this, data, meta, cancelled: false };
            this.proxyManager.proxyAPI.emit('serverPacketIntercept', interceptEvent);

            if (!interceptEvent.cancelled && this.client.state === mc.states.PLAY) {
                this.client.write(meta.name, data);
            }
        });
    }

    _createAuthWorld(msaData) {
        this.createLimboWorld();

        const keepAliveInterval = setInterval(() => {
            if (this.client.state === mc.states.PLAY) {
                this.client.write('keep_alive', { keepAliveId: Math.floor(Math.random() * 2147483647) });
            }
        }, 15000);

        const url = `${msaData.verification_uri}?otc=${msaData.user_code}`;
        const platform = process.platform;
        const cmd = platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;

        const messages = [
            '§6========================================',
            '       §6S§eta§fr§bfi§3sh §5P§5roxy §e- Authentication',
            '§6========================================',
            '§eMicrosoft Auth Required!',
            '§7A new tab should have opened in your browser.',
            `§7If not, visit: §b${url}`,
            '§6========================================'
        ];
        this.proxyManager.sendChatMessage(this.client, messages.join('\n'));

        try { exec(cmd); } catch (e) { console.error('Failed to open browser automatically.', e); }

        return keepAliveInterval;
    }

    createLimboWorld() {
        if (!this.client || this.client.state !== mc.states.PLAY) return;

        this.client.write('login', {
            entityId: 1, gameMode: 1, dimension: 0, difficulty: 0,
            maxPlayers: 1, levelType: 'flat', reducedDebugInfo: false
        });

        this.client.write('position', {
            x: 0.5, y: 3000, z: 0.5, yaw: 0, pitch: 0, flags: 0
        });
    }

    end(reason) {
        if (this.client && this.client.state !== mc.states.DISCONNECTED) {
            this.client.end(reason);
        }
    }
}

module.exports = { PlayerSession }; 