const { Authflow } = require('prismarine-auth');
const path = require('path');

// Replace 'J0nahG' with the Microsoft account username
const username = 'J0nahG';

// Create an Authflow instance with the correct authTitle and flow
const authflow = new Authflow(username, path.join(__dirname, 'auth-cache'), { authTitle: '00000000402b5328', flow: 'live' });

// Authenticate and cache credentials
authflow.getMinecraftJavaToken().then((token) => {
    console.log('Successfully authenticated and cached credentials:', token);
}).catch((err) => {
    console.error('Authentication failed:', err.message);
});
