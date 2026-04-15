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

// Store orders in memory (use database in production)
const orders = new Map();

// API endpoint to receive order data
app.post('/api/create-order', (req, res) => {
    const orderData = req.body;
    const orderId = orderData.orderId || 'ORD-' + Date.now();
    
    orders.set(orderId, {
        ...orderData,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    
    console.log(`📦 Order created: ${orderId}`);
    console.log(`   Items: ${orderData.items?.length || 0}`);
    console.log(`   Total: ${orderData.subtotal}`);
    console.log(`   Roblox: ${orderData.robloxUser}`);
    
    res.json({ success: true, orderId: orderId });
});

// API to get order status
app.get('/api/order/:orderId', (req, res) => {
    const order = orders.get(req.params.orderId);
    if (order) {
        res.json({ success: true, order });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

// Serve the payment page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment.html'));
});

// Payment success endpoint (called after demo payment)
app.post('/api/payment-success', (req, res) => {
    const { orderId, transactionId } = req.body;
    
    if (orders.has(orderId)) {
        const order = orders.get(orderId);
        order.status = 'completed';
        order.transactionId = transactionId;
        order.completedAt = new Date().toISOString();
        orders.set(orderId, order);
        
        console.log(`✅ Payment completed for order: ${orderId}`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Order not found' });
    }
});

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║     ECHOKNIVES PAYMENT SERVER                    ║
    ╠══════════════════════════════════════════════════╣
    ║  ✅ Running on port ${PORT}                           ║
    ║  📱 URL: http://localhost:${PORT}                    ║
    ║  🔗 Waiting for orders from shop...               ║
    ╚══════════════════════════════════════════════════╝
    `);
});
