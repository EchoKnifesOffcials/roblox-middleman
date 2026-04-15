const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your shop website
app.use(cors({
    origin: ['https://echoknives.onrender.com', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'alive',
        message: 'Roblox Middleman is running! Use /api/roblox/USERNAME',
        endpoints: {
            'GET /api/roblox/:username': 'Get Roblox user info and avatar URL',
            'GET /health': 'Check server status'
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MAIN API: Get Roblox user data and avatar
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    
    console.log(`[${new Date().toISOString()}] Looking up: ${username}`);
    
    // Validate username
    if (!username || username.trim().length < 1) {
        return res.status(400).json({
            success: false,
            error: 'Username is required'
        });
    }
    
    try {
        // STEP 1: Get user ID from username using Roblox API
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Roblox-Middleman/1.0'
            },
            body: JSON.stringify({
                usernames: [username.trim()],
                excludeBannedUsers: true
            })
        });
        
        if (!userResponse.ok) {
            throw new Error(`Roblox API returned ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        
        // Check if user exists
        if (!userData.data || userData.data.length === 0) {
            console.log(`[${new Date().toISOString()}] User not found: ${username}`);
            return res.status(404).json({
                success: false,
                error: 'User not found',
                username: username
            });
        }
        
        const user = userData.data[0];
        const userId = user.id;
        
        console.log(`[${new Date().toISOString()}] Found: ${user.name} (ID: ${userId})`);
        
        // STEP 2: Get avatar URL using Roblox Thumbnail API
        const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, {
            headers: {
                'User-Agent': 'Roblox-Middleman/1.0'
            }
        });
        
        if (!avatarResponse.ok) {
            throw new Error(`Thumbnail API returned ${avatarResponse.status}`);
        }
        
        const avatarData = await avatarResponse.json();
        
        let avatarUrl = null;
        if (avatarData.data && avatarData.data.length > 0 && avatarData.data[0].imageUrl) {
            avatarUrl = avatarData.data[0].imageUrl;
        }
        
        // STEP 3: Send the data back to your shop
        const result = {
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: userId,
            avatarUrl: avatarUrl,
            profileUrl: `https://www.roblox.com/users/${userId}/profile`
        };
        
        console.log(`[${new Date().toISOString()}] Success for: ${user.name}`);
        res.json(result);
        
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message,
            username: username
        });
    }
});

// Batch lookup endpoint (for multiple usernames)
app.post('/api/roblox/batch', async (req, res) => {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Please provide an array of usernames'
        });
    }
    
    try {
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usernames: usernames.slice(0, 10),
                excludeBannedUsers: true
            })
        });
        
        const userData = await userResponse.json();
        
        const results = [];
        for (const user of (userData.data || [])) {
            const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`);
            const avatarData = await avatarResponse.json();
            
            results.push({
                username: user.name,
                displayName: user.displayName,
                userId: user.id,
                avatarUrl: avatarData.data?.[0]?.imageUrl || null
            });
        }
        
        res.json({ success: true, data: results });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║     ROBLOX MIDDLEMAN FOR ECHOKNIVES SHOP        ║
    ╠══════════════════════════════════════════════════╣
    ║  ✅ Server running on port ${PORT}                    ║
    ║  📱 Test: http://localhost:${PORT}/api/roblox/Builderman  ║
    ║  🔗 Linked to: https://echoknives.onrender.com    ║
    ╚══════════════════════════════════════════════════╝
    `);
});
