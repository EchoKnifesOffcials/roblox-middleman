const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Payment page that receives cart data from shop
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
        body { font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f0c29, #1a1a3e); color: white; min-height: 100vh; padding: 40px 20px; }
        .container { max-width: 900px; margin: 0 auto; background: rgba(15,12,41,0.95); border-radius: 30px; border: 1px solid #6c5ce7; overflow: hidden; }
        .header { background: linear-gradient(135deg, #6c5ce7, #a855f7); padding: 25px; text-align: center; }
        .header h2 { font-size: 28px; }
        .content { padding: 30px; }
        .roblox-info { background: rgba(108,92,231,0.2); padding: 15px; border-radius: 15px; margin-bottom: 20px; text-align: center; border: 1px solid rgba(108,92,231,0.3); }
        .cart-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 15px; margin-bottom: 10px; }
        .total { display: flex; justify-content: space-between; font-size: 24px; font-weight: bold; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 15px; margin-top: 20px; }
        .pay-btn { background: linear-gradient(135deg, #10b981, #059669); width: 100%; padding: 18px; font-size: 18px; font-weight: bold; border: none; border-radius: 50px; color: white; cursor: pointer; margin-top: 20px; transition: transform 0.2s; }
        .pay-btn:hover { transform: scale(1.02); }
        .back-link { display: block; text-align: center; margin-top: 20px; color: #a855f7; text-decoration: none; }
        .loading { text-align: center; padding: 50px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 8px; vertical-align: middle; }
    </style>
</head>
<body>
<div class="container">
    <div class="header"><h2>🔒 Secure Checkout</h2><p>ECHOKNIVES Premium MM2 Shop</p></div>
    <div class="content" id="content"><div class="loading">📦 Loading your order...</div></div>
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
        } catch(e) { console.error(e); }
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
            <button class="pay-btn" onclick="processPayment()">💳 Complete Payment (Demo)</button>
            <a href="\${returnUrl}" class="back-link">← Return to Shop</a>
        \`;
    }
    
    function processPayment() {
        const btn = document.querySelector('.pay-btn');
        btn.innerHTML = '<span class="spinner"></span> Processing Payment...';
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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', shopUrl: 'https://echoknives.onrender.com' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ ECHOKNIVES Payment Server running on port ${PORT}`);
    console.log(`🔗 Linked to shop: https://echoknives.onrender.com`);
});
