const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all requests (this is the magic!)
app.use(cors());
app.use(express.json());

// Your middleman endpoint
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    
    console.log(`📱 Looking up Roblox user: ${username}`);
    
    try {
        // Step 1: Get user ID from username
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                usernames: [username], 
                excludeBannedUsers: true 
            })
        });
        
        const userData = await userResponse.json();
        
        if (!userData.data || userData.data.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const user = userData.data[0];
        const userId = user.id;
        
        console.log(`✅ Found user: ${user.name} (ID: ${userId})`);
        
        // Step 2: Get avatar URL
        const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const avatarData = await avatarResponse.json();
        
        const avatarUrl = avatarData.data?.[0]?.imageUrl || null;
        
        // Step 3: Send back to your shop
        res.json({
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: userId,
            avatarUrl: avatarUrl
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Server error: ' + error.message 
        });
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'alive', 
        message: 'Roblox Middleman is running! Use /api/roblox/USERNAME' 
    });
});

app.listen(PORT, () => {
    console.log(`✅ Middleman server running on port ${PORT}`);
    console.log(`📱 Test it: http://localhost:${PORT}/api/roblox/Builderman`);
});
