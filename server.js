const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// The payment page HTML - receives cart data from shop
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ECHOKNIVES | Secure Checkout</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #0f0c29, #1a1a3e); color: white; min-height: 100vh; padding: 40px 20px; }
        .container { max-width: 800px; margin: 0 auto; background: rgba(15,12,41,0.95); border-radius: 20px; border: 1px solid #6c5ce7; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h2 { color: #6c5ce7; }
        .cart-item { display: flex; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 10px; margin-bottom: 10px; }
        .total { font-size: 24px; font-weight: bold; text-align: right; padding: 20px; border-top: 2px solid #6c5ce7; margin-top: 20px; }
        button { background: #10b981; width: 100%; padding: 15px; font-size: 18px; font-weight: bold; border: none; border-radius: 10px; color: white; cursor: pointer; margin-top: 20px; }
        button:hover { opacity: 0.9; }
        .back-link { display: block; text-align: center; margin-top: 15px; color: #a855f7; text-decoration: none; }
        .roblox-info { background: rgba(108,92,231,0.2); padding: 15px; border-radius: 10px; margin-bottom: 20px; text-align: center; }
        .loading { text-align: center; padding: 50px; }
    </style>
</head>
<body>
<div class="container">
    <div class="header"><h2>🔒 Secure Checkout</h2><p>ECHOKNIVES Premium MM2 Shop</p></div>
    <div id="content" class="loading">📦 Loading your order...</div>
</div>
<script>
    const urlParams = new URLSearchParams(window.location.search);
    const cartParam = urlParams.get('cart');
    const robloxUser = urlParams.get('roblox');
    const orderId = urlParams.get('order_id');
    const returnUrl = urlParams.get('return') || 'https://echoknives.onrender.com';
    
    let orderData = null;
    if (cartParam) {
        try {
            const items = JSON.parse(decodeURIComponent(cartParam));
            const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            orderData = { items, subtotal, robloxUser, orderId };
        } catch(e) {}
    }
    if (!orderData) {
        orderData = { items: [{ name: "Batwing", price: 152, quantity: 1 }], subtotal: 152, robloxUser: robloxUser || "Guest", orderId: orderId || "DEMO" };
    }
    
    function displayOrder() {
        let itemsHtml = '';
        orderData.items.forEach(item => {
            itemsHtml += \`<div class="cart-item"><div><strong>\${item.name}</strong> x\${item.quantity}</div><div>₱\${(item.price * item.quantity).toFixed(2)}</div></div>\`;
        });
        document.getElementById('content').innerHTML = \`
            <div class="roblox-info">🎮 <strong>Delivering to:</strong> @\${orderData.robloxUser}<br><small>Order ID: \${orderData.orderId}</small></div>
            \${itemsHtml}
            <div class="total">Total: ₱\${orderData.subtotal.toFixed(2)}</div>
            <button onclick="processPayment()">💳 Complete Payment (Demo)</button>
            <a href="\${returnUrl}" class="back-link">← Return to Shop</a>
        \`;
    }
    
    function processPayment() {
        const btn = document.querySelector('button');
        btn.innerHTML = '⏳ Processing...';
        btn.disabled = true;
        setTimeout(() => {
            const separator = returnUrl.includes('?') ? '&' : '?';
            window.location.href = \`\${returnUrl}\${separator}payment=success&order_id=\${orderData.orderId}\`;
        }, 1500);
    }
    
    displayOrder();
</script>
</body>
</html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Payment site is running', shopUrl: 'https://echoknives.onrender.com' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ ECHOKNIVES Payment Server running on port ${PORT}`);
    console.log(`🔗 Linked to shop: https://echoknives.onrender.com`);
    console.log(`📱 Payment URL: https://echoknivesmm2.onrender.com`);
});
