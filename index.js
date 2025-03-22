require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const collectionGenerator = require('./collection-generator');
const shopifyApi = require('./shopify-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Webhook endpoint for product creation
app.post('/webhooks/products/create', async (req, res) => {
  try {
    const product = req.body;
    console.log(`Received webhook for new product: ${product.id} - ${product.title}`);
    
    // Process the new product
    await collectionGenerator.processProduct(product.id);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Route to manually trigger processing all existing products
app.get('/process-existing-products', async (req, res) => {
  try {
    // Run in background
    collectionGenerator.processAllExistingProducts().catch(console.error);
    res.status(200).send("Processing started in background");
  } catch (error) {
    console.error('Error starting product processing:', error);
    res.status(500).send('Error starting product processing');
  }
});

// Route to manually process a specific product
app.get('/process-product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Run in background
    collectionGenerator.processProduct(productId).catch(console.error);
    res.status(200).send(`Processing product ${productId} started in background`);
  } catch (error) {
    console.error('Error starting product processing:', error);
    res.status(500).send('Error starting product processing');
  }
});

// Route to register webhooks
app.get('/register-webhooks', async (req, res) => {
  try {
    const baseUrl = req.query.url || `https://${req.headers.host}`;
    const webhookUrl = `${baseUrl}/webhooks/products/create`;
    
    const webhook = await shopifyApi.registerProductCreationWebhook(webhookUrl);
    
    if (webhook) {
      res.status(200).json({ success: true, webhook });
    } else {
      res.status(500).json({ success: false, error: 'Failed to register webhook' });
    }
  } catch (error) {
    console.error('Error registering webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check route
app.get('/', (req, res) => {
  res.status(200).send('Shop by Specs app is running!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/process-existing-products to process all existing products`);
  console.log(`Visit http://localhost:${PORT}/register-webhooks?url=YOUR_SERVER_URL to register webhooks`);
}); 