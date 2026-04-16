const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for ALL origins (this fixes the connection error)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Middleman is running', timestamp: new Date().toISOString() });
});

// Main API: Get Roblox user data and avatar
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    
    console.log(`[${new Date().toISOString()}] Looking up: ${username}`);
    
    if (!username || username.trim().length < 1) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }
    
    try {
        // STEP 1: Get user ID using Roblox API
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox-Middleman/1.0'
            },
            body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: true })
        });
        
        const userData = await userResponse.json();
        
        if (!userData.data || userData.data.length === 0) {
            console.log(`[${new Date().toISOString()}] User not found: ${username}`);
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const user = userData.data[0];
        const userId = user.id;
        
        console.log(`[${new Date().toISOString()}] Found: ${user.name} (ID: ${userId})`);
        
        // STEP 2: Get avatar URL using Roblox Thumbnail API
        const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`, {
            headers: { 'User-Agent': 'Roblox-Middleman/1.0' }
        });
        
        const avatarData = await avatarResponse.json();
        
        let avatarUrl = null;
        if (avatarData.data && avatarData.data.length > 0 && avatarData.data[0].imageUrl) {
            avatarUrl = avatarData.data[0].imageUrl;
        }
        
        // STEP 3: Return the data
        res.json({
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: userId,
            avatarUrl: avatarUrl,
            profileUrl: `https://www.roblox.com/users/${userId}/profile`
        });
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'alive', 
        message: 'Roblox Middleman is running!',
        endpoints: {
            'GET /health': 'Check server status',
            'GET /api/roblox/:username': 'Get Roblox user info and avatar'
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     ROBLOX MIDDLEMAN - FIXED VERSION                     ║
    ╠══════════════════════════════════════════════════════════╣
    ║  ✅ Running on port ${PORT}                                  ║
    ║  📱 Test: /api/roblox/Builderman                        ║
    ║  🔗 CORS enabled for all origins                         ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
