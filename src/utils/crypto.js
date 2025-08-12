const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getConfigDir } = require('./paths');

const ALGORITHM = 'aes-256-cbc';
const KEY_FILE = '.encryption.key';
const IV_LENGTH = 16;

class CryptoManager {
    constructor() {
        this.key = null;
        this.keyPath = path.join(getConfigDir(), KEY_FILE);
        this._ensureKey();
    }

    _ensureKey() {
        try {
            // Ensure config directory exists
            const configDir = getConfigDir();
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            if (fs.existsSync(this.keyPath)) {
                // Load existing key
                const keyData = fs.readFileSync(this.keyPath);
                this.key = keyData;
            } else {
                // Generate new key
                this.key = crypto.randomBytes(32);
                
                // Save key with restricted permissions (only readable by owner)
                fs.writeFileSync(this.keyPath, this.key, { mode: 0o600 });
                
                console.log('[Crypto] Generated new encryption key for secure settings');
            }
        } catch (error) {
            console.error('[Crypto] Failed to initialize encryption key:', error.message);
            // Generate temporary key in memory as fallback
            this.key = crypto.randomBytes(32);
        }
    }

    /**
     * Encrypt a string value
     * @param {string} text - The text to encrypt
     * @returns {string} - Base64 encoded encrypted data
     */
    encrypt(text) {
        if (typeof text !== 'string') {
            throw new Error('Can only encrypt string values');
        }

        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Combine IV + encrypted data
            const combined = iv.toString('hex') + ':' + encrypted;
            return Buffer.from(combined).toString('base64');
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt a string value
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @returns {string} - The decrypted text
     */
    decrypt(encryptedData) {
        if (typeof encryptedData !== 'string') {
            throw new Error('Encrypted data must be a string');
        }

        try {
            const combined = Buffer.from(encryptedData, 'base64').toString();
            const parts = combined.split(':');
            
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted data format');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];

            const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Check if a value appears to be encrypted
     * @param {any} value - The value to check
     * @returns {boolean} - True if the value looks encrypted
     */
    isEncrypted(value) {
        if (typeof value !== 'string') return false;
        
        try {
            // Try to decode as base64 and check format
            const decoded = Buffer.from(value, 'base64').toString();
            return decoded.includes(':') && decoded.split(':').length === 2;
        } catch {
            return false;
        }
    }
}

// Singleton instance
let cryptoManager = null;

function getCryptoManager() {
    if (!cryptoManager) {
        cryptoManager = new CryptoManager();
    }
    return cryptoManager;
}

module.exports = {
    getCryptoManager,
    CryptoManager
};
