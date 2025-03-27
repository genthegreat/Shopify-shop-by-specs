require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const collectionGenerator = require("./collection-generator");
const shopifyApi = require("./shopify-api");
const crypto = require("crypto");
const getRawBody = require("raw-body");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SHOPIFY_WEBHOOK_SECRET;
const SITE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middleware
app.use(cors({
  origin: [
    /\.myshopify\.com$/,  // Allow all Shopify store domains
    'https://prince-kwesi-dev.myshopify.com',  // Your specific store
    'https://cdn.shopify.com',
    /localhost:\d+$/  // Local development
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CORS middleware for all routes as a backup
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://prince-kwesi-dev.myshopify.com',
    'https://cdn.shopify.com'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || /\.myshopify\.com$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  next();
});

// Use body-parser for regular routes
app.use((req, res, next) => {
  // Skip body parsing for webhook routes and handle them specially
  if (req.path === '/webhooks/products/create') {
    return next();
  }
  
  bodyParser.json()(req, res, next);
});

// Webhook endpoint for product creation
app.post("/webhooks/products/create", async (req, res) => {
  try {
    // We'll compare the hmac to our own hash
    const hmac = req.get("X-Shopify-Hmac-Sha256");

    // Use raw-body to get the body (buffer)
    const body = await getRawBody(req);
    
    // Create a hash using the body and our key
    const hash = crypto
      .createHmac("sha256", SECRET_KEY || '')
      .update(body, "utf8")
      .digest("base64");

    // Use timing-safe comparison
    try {
      const hmacValid = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
      if (!hmacValid) {
        console.log("Danger! Not from Shopify!");
        return res.sendStatus(403);
      }
    } catch (e) {
      // This catches errors like when the strings are of different lengths
      console.log("HMAC validation error:", e);
      return res.sendStatus(403);
    }

    // Parse the raw body into JSON
    const product = JSON.parse(body);
    console.log(
      `Received webhook for new product: ${product.id} - ${product.title}`
    );

    res.status(200).send("OK");

    // Process the new product
    collectionGenerator.processProduct(product.id).catch(error => {
      console.error(`Error processing product: ${product.id}`, error);
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});

// Route to manually trigger processing all existing products
app.get("/process-existing-products", async (req, res) => {
  try {
    // Run in background
    collectionGenerator.processAllExistingProducts().catch(console.error);
    res.status(200).send("Processing started in background");
  } catch (error) {
    console.error("Error starting product processing:", error);
    res.status(500).send("Error starting product processing");
  }
});

// Route to manually process a specific product
app.get("/process-product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    // Run in background
    collectionGenerator.processProduct(productId).catch(console.error);
    res
      .status(200)
      .send(`Processing product ${productId} started in background`);
  } catch (error) {
    console.error("Error starting product processing:", error);
    res.status(500).send("Error starting product processing");
  }
});

// Route to register webhooks
app.get("/register-webhooks", async (req, res) => {
  try {
    const baseUrl = req.query.url || `https://${req.headers.host}`;
    const webhookUrl = `${baseUrl}/webhooks/products/create`;

    const webhook = await shopifyApi.registerProductCreationWebhook(webhookUrl);

    if (webhook) {
      res.status(200).json({ success: true, webhook });
    } else {
      res
        .status(500)
        .json({ success: false, error: "Failed to register webhook" });
    }
  } catch (error) {
    console.error("Error registering webhook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to delete all duplicate collections
app.get("/delete-duplicate-collections", async (req, res) => {
  try {
    await collectionGenerator.cleanupDuplicateCollections();
    res.status(200).send("Duplicate collections deleted successfully");
  } catch (error) {
    console.error("Error deleting duplicate collections:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to fetch related collections for a given collection
app.get("/related-collections/:collectionHandle", async (req, res) => {
  try {
    const { collectionHandle } = req.params;
    console.log(`Processing related collections request for: ${collectionHandle}`);
    
    // Set CORS headers specifically for this endpoint
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    const relatedCollections = await collectionGenerator.getRelatedCollections(collectionHandle);
    res.status(200).json(relatedCollections);
  } catch (error) {
    console.error(`Error fetching related collections:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check route
app.get("/", (req, res) => {
  res.status(200).send("Shop by Specs app is running!");
});

// Add OPTIONS route handler for CORS preflight requests
app.options('*', (req, res) => {
  // Set CORS headers manually for preflight requests
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(204).end();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);    
    console.log(
      `Visit ${SITE_URL}/process-existing-products to process all existing products`
    );
    console.log(
      `Visit ${SITE_URL}/register-webhooks?url=${SITE_URL} to register webhooks`
    );
    console.log(
      `Visit ${SITE_URL}/delete-duplicate-collections to delete duplicate collections`
    );
});
