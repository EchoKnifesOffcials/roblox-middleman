const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// Store verification codes
const verificationCodes = new Map();

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get user by username
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    try {
        const response = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await response.json();
        if (!data.data || data.data.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const user = data.data[0];
        res.json({ success: true, username: user.name, displayName: user.displayName, userId: user.id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get full user info with avatar
app.get('/api/user-full/:username', async (req, res) => {
    const username = req.params.username;
    try {
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const user = userData.data[0];
        const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`);
        const avatarData = await avatarResponse.json();
        let avatarUrl = null;
        if (avatarData.data && avatarData.data.length > 0) {
            avatarUrl = avatarData.data[0].imageUrl;
        }
        res.json({
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: user.id,
            avatarUrl: avatarUrl,
            profileUrl: `https://www.roblox.com/users/${user.id}/profile`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate verification code
app.post('/api/generate-verification', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }
    try {
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const user = userData.data[0];
        const code = `ECHOKNIVES-${user.id}-${Date.now().toString(36)}`;
        verificationCodes.set(user.id, { code: code, expires: Date.now() + 3600000, username: user.name });
        res.json({ success: true, verificationCode: code, userId: user.id, username: user.name });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify bio contains code
app.post('/api/verify-bio', async (req, res) => {
    const { username, verificationCode } = req.body;
    if (!username || !verificationCode) {
        return res.status(400).json({ success: false, error: 'Username and verification code required' });
    }
    try {
        const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const userData = await userResponse.json();
        if (!userData.data || userData.data.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const user = userData.data[0];
        const profileResponse = await fetch(`https://users.roblox.com/v1/users/${user.id}`);
        const profileData = await profileResponse.json();
        const userBio = profileData.description || "";
        const storedCode = verificationCodes.get(user.id);
        const isValidCode = storedCode && storedCode.code === verificationCode && storedCode.expires > Date.now();
        if (userBio.includes(verificationCode) && isValidCode) {
            verificationCodes.delete(user.id);
            res.json({ success: true, verified: true, message: 'Verification successful!' });
        } else if (!userBio.includes(verificationCode)) {
            res.json({ success: true, verified: false, message: `Code not found in bio. Add "${verificationCode}" to your Roblox profile description.` });
        } else {
            res.json({ success: true, verified: false, message: 'Invalid or expired code. Please try again.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ status: 'alive', name: 'ECHOKNIVES Roblox Middleman', endpoints: ['/api/roblox/:username', '/api/user-full/:username', '/api/generate-verification', '/api/verify-bio'] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Roblox Middleman running on port ${PORT}`);
});
