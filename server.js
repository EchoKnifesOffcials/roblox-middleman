const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const app = express();
const PORT = process.env.PORT || 3000;

// ============ CACHE SETUP ============
// Cache user data for 1 hour to reduce API calls (faster responses)
const userCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const avatarCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// ============ MIDDLEWARE ============
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============ HELPER FUNCTIONS ============

// Rate limiting tracker
const rateLimit = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 30; // 30 requests per minute
    
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, []);
    }
    
    const timestamps = rateLimit.get(ip).filter(t => now - t < windowMs);
    timestamps.push(now);
    rateLimit.set(ip, timestamps);
    
    return timestamps.length <= maxRequests;
}

// Fast parallel requests
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Roblox-Middleman/2.0',
                'Accept': 'application/json',
                ...options.headers
            }
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Get user ID from username (with caching)
async function getUserId(username) {
    // Check cache first
    const cacheKey = `userid_${username.toLowerCase()}`;
    const cached = userCache.get(cacheKey);
    if (cached) {
        console.log(`[CACHE HIT] User ID for ${username}: ${cached.userId}`);
        return cached;
    }
    
    try {
        const response = await fetchWithTimeout('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        }, 8000);
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            return null;
        }
        
        const user = data.data[0];
        const result = {
            userId: user.id,
            username: user.name,
            displayName: user.displayName
        };
        
        // Cache the result
        userCache.set(cacheKey, result);
        
        return result;
    } catch (error) {
        console.error(`Error fetching user ID for ${username}:`, error.message);
        return null;
    }
}

// Get avatar URL (with caching)
async function getAvatarUrl(userId) {
    const cacheKey = `avatar_${userId}`;
    const cached = avatarCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    
    try {
        // Use multiple sizes for better compatibility
        const response = await fetchWithTimeout(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
            {},
            5000
        );
        
        const data = await response.json();
        
        let avatarUrl = null;
        if (data.data && data.data.length > 0 && data.data[0].imageUrl) {
            avatarUrl = data.data[0].imageUrl;
        }
        
        // Cache the avatar URL
        if (avatarUrl) {
            avatarCache.set(cacheKey, avatarUrl);
        }
        
        return avatarUrl;
    } catch (error) {
        console.error(`Error fetching avatar for ${userId}:`, error.message);
        return null;
    }
}

// ============ API ENDPOINTS ============

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Roblox Middleman is running',
        timestamp: new Date().toISOString(),
        cacheStats: {
            userCacheSize: userCache.keys().length,
            avatarCacheSize: avatarCache.keys().length
        }
    });
});

// Clear cache endpoint (admin only - add your admin key)
app.post('/api/clear-cache', (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== 'echoknives_admin_2024') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    userCache.flushAll();
    avatarCache.flushAll();
    res.json({ success: true, message: 'Cache cleared' });
});

// Main API: Get Roblox user data and avatar (OPTIMIZED)
app.get('/api/roblox/:username', async (req, res) => {
    const username = req.params.username;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Validate input
    if (!username || username.trim().length < 1) {
        return res.status(400).json({ success: false, error: 'Username required' });
    }
    
    // Rate limiting
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ success: false, error: 'Too many requests. Please wait a moment.' });
    }
    
    console.log(`[REQUEST] Looking up: ${username}`);
    
    try {
        // Step 1: Get user ID (with cache)
        const userInfo = await getUserId(username.trim());
        
        if (!userInfo) {
            console.log(`[NOT FOUND] ${username}`);
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        console.log(`[FOUND] ${userInfo.username} (ID: ${userInfo.userId})`);
        
        // Step 2: Get avatar URL (with cache) - runs in parallel with any future requests
        const avatarUrl = await getAvatarUrl(userInfo.userId);
        
        // Step 3: Return combined data
        const responseData = {
            success: true,
            username: userInfo.username,
            displayName: userInfo.displayName,
            userId: userInfo.userId,
            avatarUrl: avatarUrl || 'https://www.roblox.com/headshot-thumbnail/avatar?userId=' + userInfo.userId,
            profileUrl: `https://www.roblox.com/users/${userInfo.userId}/profile`,
            cached: userCache.get(`userid_${username.toLowerCase()}`) !== undefined
        };
        
        res.json(responseData);
        
    } catch (error) {
        console.error(`[ERROR] ${username}: ${error.message}`);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
});

// Batch lookup - get multiple users at once (FASTER for multiple lookups)
app.post('/api/roblox/batch', async (req, res) => {
    const { usernames } = req.body;
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
        return res.status(400).json({ success: false, error: 'Array of usernames required' });
    }
    
    if (usernames.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 usernames per batch' });
    }
    
    try {
        const results = await Promise.all(
            usernames.map(async (username) => {
                const userInfo = await getUserId(username);
                if (!userInfo) return null;
                
                const avatarUrl = await getAvatarUrl(userInfo.userId);
                return {
                    username: userInfo.username,
                    displayName: userInfo.displayName,
                    userId: userInfo.userId,
                    avatarUrl: avatarUrl,
                    profileUrl: `https://www.roblox.com/users/${userInfo.userId}/profile`
                };
            })
        );
        
        res.json({ success: true, users: results.filter(r => r !== null) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cache stats endpoint
app.get('/api/cache-stats', (req, res) => {
    res.json({
        userCache: {
            size: userCache.keys().length,
            keys: userCache.keys()
        },
        avatarCache: {
            size: avatarCache.keys().length,
            keys: avatarCache.keys()
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'alive', 
        name: 'ECHOKNIVES Roblox Middleman',
        version: '2.1.0',
        features: {
            caching: true,
            rateLimiting: true,
            batchLookup: true
        },
        endpoints: {
            'GET /health': 'Check server status',
            'GET /api/roblox/:username': 'Get single user info (cached)',
            'POST /api/roblox/batch': 'Get multiple users at once',
            'GET /api/cache-stats': 'View cache statistics',
            'POST /api/clear-cache': 'Clear cache (admin only)'
        }
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════════╗
    ║     🚀 ECHOKNIVES ROBLOX MIDDLEMAN - OPTIMIZED VERSION 2.1       ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║  ✅ Port: ${PORT}                                                      ║
    ║  ⚡ Caching: ENABLED (1 hour TTL)                                   ║
    ║  🔒 Rate Limiting: 30 req/min                                       ║
    ║  📦 Batch Lookup: UP TO 10 users                                    ║
    ║                                                                     ║
    ║  📱 Test single: /api/roblox/Builderman                            ║
    ║  📱 Test batch:  POST /api/roblox/batch                             ║
    ║                                                                     ║
    ║  💡 First request may take ~1-2 seconds                            ║
    ║  💡 Subsequent requests are INSTANT (cached)                       ║
    ╚══════════════════════════════════════════════════════════════════╝
    `);
});
