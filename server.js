const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const app = express();
const PORT = process.env.PORT || 3000;

// Cache setup
const userCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const avatarCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const bioCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min cache for bios

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// Rate limiting
const rateLimit = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const timestamps = rateLimit.get(ip) || [];
    const valid = timestamps.filter(t => now - t < 60000);
    valid.push(now);
    rateLimit.set(ip, valid);
    return valid.length <= 30;
}

// Helper: Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': 'Roblox-Middleman/2.0', ...options.headers } });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Get user info by username
async function getUserInfo(username) {
    const cacheKey = `user_${username.toLowerCase()}`;
    const cached = userCache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const response = await fetchWithTimeout('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await response.json();
        if (!data.data || data.data.length === 0) return null;
        
        const user = data.data[0];
        const result = { userId: user.id, username: user.name, displayName: user.displayName };
        userCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error(`Error getting user info for ${username}:`, error.message);
        return null;
    }
}

// Get user avatar (full body)
async function getUserAvatarFull(userId) {
    const cacheKey = `avatar_full_${userId}`;
    const cached = avatarCache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const response = await fetchWithTimeout(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`, {}, 5000);
        const data = await response.json();
        let avatarUrl = null;
        if (data.data && data.data.length > 0 && data.data[0].imageUrl) {
            avatarUrl = data.data[0].imageUrl;
        }
        if (avatarUrl) avatarCache.set(cacheKey, avatarUrl);
        return avatarUrl;
    } catch (error) {
        console.error(`Error fetching avatar for ${userId}:`, error.message);
        return null;
    }
}

// Get user's bio/description
async function getUserBio(userId) {
    const cacheKey = `bio_${userId}`;
    const cached = bioCache.get(cacheKey);
    if (cached) return cached;
    
    try {
        const response = await fetchWithTimeout(`https://users.roblox.com/v1/users/${userId}`, {}, 5000);
        const data = await response.json();
        const bio = data.description || "";
        bioCache.set(cacheKey, bio);
        return bio;
    } catch (error) {
        console.error(`Error fetching bio for ${userId}:`, error.message);
        return "";
    }
}

// Generate verification code
function generateVerificationCode(username) {
    const timestamp = Date.now();
    const hash = Buffer.from(`${username}-${timestamp}-ECHOKNIVES`).toString('base64').substring(0, 16);
    return `ECHOKNIVES-${hash}`;
}

// ============ API ENDPOINTS ============

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Roblox Middleman is running', timestamp: new Date().toISOString() });
});

// Get user by username (basic info)
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    if (!username || username.trim().length < 1) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }
    if (!checkRateLimit(req.ip)) {
        return res.status(429).json({ success: false, error: 'Too many requests' });
    }
    
    try {
        const userInfo = await getUserInfo(username.trim());
        if (!userInfo) return res.status(404).json({ success: false, error: 'User not found' });
        
        const avatarUrl = await getUserAvatarFull(userInfo.userId);
        const bio = await getUserBio(userInfo.userId);
        
        res.json({
            success: true,
            username: userInfo.username,
            displayName: userInfo.displayName,
            userId: userInfo.userId,
            avatarUrl: avatarUrl,
            bio: bio,
            profileUrl: `https://www.roblox.com/users/${userInfo.userId}/profile`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate verification code for a user
app.post('/api/generate-verification', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });
    
    try {
        const userInfo = await getUserInfo(username);
        if (!userInfo) return res.status(404).json({ success: false, error: 'User not found' });
        
        const verificationCode = generateVerificationCode(username);
        const instructions = `Please add this code to your Roblox profile description/bio:\n\n"${verificationCode}"\n\nThen click Verify.`;
        
        res.json({
            success: true,
            userId: userInfo.userId,
            username: userInfo.username,
            verificationCode: verificationCode,
            instructions: instructions
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify if user has the code in their bio
app.post('/api/verify-bio', async (req, res) => {
    const { username, verificationCode } = req.body;
    if (!username || !verificationCode) {
        return res.status(400).json({ success: false, error: 'Username and verification code required' });
    }
    
    try {
        const userInfo = await getUserInfo(username);
        if (!userInfo) return res.status(404).json({ success: false, error: 'User not found' });
        
        const bio = await getUserBio(userInfo.userId);
        const hasCode = bio.includes(verificationCode);
        
        if (hasCode) {
            // Clear cache for this user's bio to force refresh next time
            bioCache.del(`bio_${userInfo.userId}`);
            res.json({ success: true, verified: true, message: 'Verification successful!' });
        } else {
            res.json({ success: true, verified: false, message: 'Verification code not found in bio. Please add the code to your Roblox profile description.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get full user details with avatar and bio (for verification popup)
app.get('/api/user-full/:username', async (req, res) => {
    const username = req.params.username;
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });
    
    try {
        const userInfo = await getUserInfo(username);
        if (!userInfo) return res.status(404).json({ success: false, error: 'User not found' });
        
        const [avatarUrl, bio] = await Promise.all([
            getUserAvatarFull(userInfo.userId),
            getUserBio(userInfo.userId)
        ]);
        
        res.json({
            success: true,
            username: userInfo.username,
            displayName: userInfo.displayName,
            userId: userInfo.userId,
            avatarUrl: avatarUrl,
            bio: bio,
            profileUrl: `https://www.roblox.com/users/${userInfo.userId}/profile`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'alive',
        name: 'ECHOKNIVES Roblox Middleman',
        version: '2.2.0',
        endpoints: {
            'GET /health': 'Check server status',
            'GET /api/roblox/:username': 'Get basic user info',
            'GET /api/user-full/:username': 'Get full user info with avatar',
            'POST /api/generate-verification': 'Generate verification code',
            'POST /api/verify-bio': 'Verify bio contains code'
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════════╗
    ║     🚀 ECHOKNIVES ROBLOX MIDDLEMAN - BIO VERIFICATION v2.2      ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  ✅ Port: ${PORT}                                                      ║
    ║  🔒 Bio Verification: ENABLED                                      ║
    ║  💾 Caching: 1 hour for users, 5 min for bios                     ║
    ╚══════════════════════════════════════════════════════════════════╝
    `);
});
