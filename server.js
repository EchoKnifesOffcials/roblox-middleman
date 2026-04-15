const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Store orders temporarily (in production, use a database)
const orders = new Map();

// ========== API ENDPOINTS ==========

// Receive order from shop site
app.post('/api/create-order', (req, res) => {
    const orderData = req.body;
    const orderId = orderData.orderId || 'ORD-' + Date.now();
    
    orders.set(orderId, {
        ...orderData,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📦 Order received: ${orderId}`);
    console.log(`   Items: ${orderData.items?.length || 0}`);
    console.log(`   Total: ₱${orderData.subtotal}`);
    console.log(`   Roblox: ${orderData.robloxUser}`);
    
    res.json({ success: true, orderId: orderId });
});

// Get order status
app.get('/api/order/:orderId', (req, res) => {
    const order = orders.get(req.params.orderId);
    if (order) {
        res.json({ success: true, order });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Payment success callback
app.post('/api/payment-success', (req, res) => {
    const { orderId, transactionId } = req.body;
    
    if (orders.has(orderId)) {
        const order = orders.get(orderId);
        order.status = 'completed';
        order.transactionId = transactionId;
        order.completedAt = new Date().toISOString();
        orders.set(orderId, order);
        
        console.log(`✅ Payment completed: ${orderId}`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// ========== PAYMENT PAGE ==========
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECHOKNIVES | Secure Checkout</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #1a1a3e);
            color: white;
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(15,12,41,0.95);
            border-radius: 30px;
            border: 1px solid #6c5ce7;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .header {
            background: linear-gradient(135deg, #6c5ce7, #a855f7);
            padding: 25px;
            text-align: center;
        }
        .header h2 { font-size: 28px; }
        .content { padding: 30px; }
        .roblox-info {
            background: rgba(108,92,231,0.2);
            padding: 15px;
            border-radius: 15px;
            margin-bottom: 20px;
            text-align: center;
            border: 1px solid rgba(108,92,231,0.3);
        }
        .order-items { margin: 20px 0; }
        .cart-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 15px;
            margin-bottom: 10px;
        }
        .cart-item strong { font-size: 16px; }
        .total {
            display: flex;
            justify-content: space-between;
            font-size: 24px;
            font-weight: bold;
            padding: 20px;
            background: rgba(0,0,0,0.3);
            border-radius: 15px;
            margin-top: 20px;
        }
        .pay-btn {
            background: linear-gradient(135deg, #10b981, #059669);
            width: 100%;
            padding: 18px;
            font-size: 18px;
            font-weight: bold;
            border: none;
            border-radius: 50px;
            color: white;
            cursor: pointer;
            margin-top: 20px;
            transition: transform 0.2s;
        }
        .pay-btn:hover { transform: scale(1.02); }
        .pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .back-link {
            display: block;
            text-align: center;
            margin-top: 20px;
            color: #a855f7;
            text-decoration: none;
        }
        .loading { text-align: center; padding: 50px; }
        .error-box {
            background: rgba(239,68,68,0.2);
            border: 1px solid #ef4444;
            padding: 15px;
            border-radius: 15px;
            text-align: center;
            margin: 20px 0;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid white;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h2><i class="fas fa-lock"></i> Secure Checkout</h2>
        <p>ECHOKNIVES Premium MM2 Shop</p>
    </div>
    <div class="content" id="content">
        <div class="loading"><i class="fas fa-spinner fa-pulse"></i> Loading your order...</div>
    </div>
</div>

<script>
    // ========== GET ORDER DATA FROM URL (SENT BY SHOP) ==========
    const urlParams = new URLSearchParams(window.location.search);
    const cartParam = urlParams.get('cart');
    const robloxUser = urlParams.get('roblox');
    const orderId = urlParams.get('order_id');
    const returnUrl = urlParams.get('return') || 'https://echoknives.onrender.com';
    
    let orderData = null;
    
    // Parse cart data from URL
    if (cartParam) {
        try {
            const items = JSON.parse(decodeURIComponent(cartParam));
            const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            orderData = { items, subtotal, robloxUser, orderId };
            console.log('✅ Order loaded from URL:', orderData);
        } catch(e) {
            console.error('Parse error:', e);
        }
    }
    
    // If no data in URL, check sessionStorage (fallback)
    if (!orderData) {
        const saved = sessionStorage.getItem('echoknives_order');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                orderData = { 
                    items: data.items, 
                    subtotal: data.subtotal, 
                    robloxUser: data.robloxUser, 
                    orderId: data.orderId 
                };
                console.log('✅ Order loaded from sessionStorage');
            } catch(e) {}
        }
    }
    
    // Demo fallback (for testing)
    if (!orderData || !orderData.items || orderData.items.length === 0) {
        orderData = {
            items: [
                { id: 1, name: "Batwing", price: 152, quantity: 1 },
                { id: 3, name: "Icewing", price: 72, quantity: 2 }
            ],
            subtotal: 296,
            robloxUser: "DemoUser",
            orderId: "DEMO-" + Date.now()
        };
        document.getElementById('content').innerHTML += '<div class="error-box">⚠️ Demo Mode - No cart data received from shop. Make sure you came from the shop site.</div>';
    }
    
    function displayOrder() {
        const itemsHtml = orderData.items.map(item => `
            <div class="cart-item">
                <div>
                    <strong>${item.name}</strong>
                    <div style="font-size:12px; color:#aaa;">Quantity: ${item.quantity}</div>
                </div>
                <div>₱${(item.price * item.quantity).toFixed(2)}</div>
            </div>
        `).join('');
        
        document.getElementById('content').innerHTML = `
            <div class="roblox-info">
                <i class="fab fa-roblox"></i> <strong>Delivering to:</strong> @${orderData.robloxUser || 'Not specified'}
                <div style="font-size:12px; margin-top:5px;">Order ID: ${orderData.orderId}</div>
            </div>
            <div class="order-items">${itemsHtml}</div>
            <div class="total">
                <span>Total:</span>
                <span>₱${orderData.subtotal.toFixed(2)}</span>
            </div>
            <button class="pay-btn" onclick="processPayment()">
                <i class="fas fa-credit-card"></i> Complete Payment (Demo)
            </button>
            <a href="${returnUrl}" class="back-link">
                <i class="fas fa-arrow-left"></i> Return to Shop
            </a>
        `;
    }
    
    async function processPayment() {
        const btn = document.querySelector('.pay-btn');
        btn.innerHTML = '<span class="spinner"></span> Processing Payment...';
        btn.disabled = true;
        
        // Simulate payment processing
        setTimeout(async () => {
            // Send payment success to backend
            try {
                await fetch('/api/payment-success', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        orderId: orderData.orderId, 
                        transactionId: 'TXN-' + Date.now() 
                    })
                });
            } catch(e) { console.error('API error:', e); }
            
            // Redirect back to shop with success parameter
            const separator = returnUrl.includes('?') ? '&' : '?';
            window.location.href = `${returnUrl}${separator}payment=success&order_id=${orderData.orderId}`;
        }, 2000);
    }
    
    displayOrder();
</script>
</body>
</html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║     ECHOKNIVES PAYMENT SITE - FULLY LINKED              ║
    ╠══════════════════════════════════════════════════════════╣
    ║  ✅ Server running on port ${PORT}                            ║
    ║  📱 Payment URL: http://localhost:${PORT}                   ║
    ║  🔗 Linked to shop: https://echoknives.onrender.com       ║
    ║                                                          ║
    ║  📦 Ready to receive orders from shop!                   ║
    ╚══════════════════════════════════════════════════════════╝
    `);
});
