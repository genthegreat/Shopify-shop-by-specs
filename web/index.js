require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const collectionGenerator = require("./collection-generator");
const shopifyApi = require("./shopify-api");
const crypto = require("crypto");
const getRawBody = require("raw-body");
const Queue = require('better-queue');
const { setTimeout } = require('timers/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SHOPIFY_WEBHOOK_SECRET;
const SITE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Get allowed origins from environment variables
const envAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
const additionalOrigins = envAllowedOrigins ? envAllowedOrigins.split(',').map(origin => origin.trim()) : [];

// Middleware
app.use(cors({
  origin: [
    /\.myshopify\.com$/,  // Allow all Shopify store domains
    'https://prince-kwesi-dev.myshopify.com',  // Your specific store
    'https://cdn.shopify.com',
    /localhost:\d+$/,  // Local development
    ...additionalOrigins  // Add origins from environment variable
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// CORS middleware for all routes as a backup
app.use((req, res, next) => {  
  const allowedOrigins = [
    'https://prince-kwesi-dev.myshopify.com',
    'https://cdn.shopify.com',
    ...additionalOrigins
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

// Create a rate-limited queue for processing products
const productQueue = new Queue(async (productId, cb) => {
  try {
    console.log(`Processing product ${productId} from queue...`);
    await collectionGenerator.processProduct(productId);
    console.log(`Finished processing product ${productId}`);
    cb(null, { success: true, productId });
  } catch (error) {
    console.error(`Error processing product: ${productId}`, error);
    cb(error);
  }
}, {
  concurrent: 1, // Process one product at a time
  afterProcessDelay: 500, // Ensure 500ms between API calls (2 per second max)
  maxRetries: 3, // Retry failed tasks
  retryDelay: 1000, // Wait 1 second between retries
});

// Optional: Track queue statistics
productQueue.on('task_finish', (taskId, result, stats) => {
  console.log(`Task ${taskId} finished in ${stats.elapsed}ms. With result: ${JSON.stringify(result)}. Queue size: ${productQueue.length}`);
});

productQueue.on('task_failed', (taskId, err, stats) => {
  console.error(`Task ${taskId} failed after ${stats.elapsed}ms, attempt ${stats.attempts}`, err);
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

    // Respond to the webhook immediately to prevent timeouts
    res.status(200).send("OK");

    // Queue the product for processing
    productQueue.push(product.id);
    
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Error processing webhook");
  }
});

// Route to manually trigger processing all existing products
// app.get("/process-existing-products", async (req, res) => {
//   try {
//     // Respond immediately
//     res.status(200).send("Processing started in background");
    
//     // Function to fetch and queue products in batches
//     const fetchAndQueueProducts = async () => {
//       let hasNextPage = true;
//       let cursor = null;
//       let totalQueued = 0;
      
//       while (hasNextPage) {
//         try {
//           console.log(`Fetching batch of products${cursor ? " after " + cursor : ""}...`);
          
//           const result = await shopifyApi.getProductsGraphQL(cursor);
          
//           if (!result || !result.products || !result.products.edges) {
//             console.error("Error fetching products: Invalid response structure");
//             break;
//           }
          
//           const products = result.products.edges;
          
//           // Queue each product
//           for (const { node } of products) {
//             productQueue.push(node.id);
//             totalQueued++;
//           }
          
//           console.log(`Queued ${products.length} products (total: ${totalQueued})`);
          
//           // Update pagination for next batch
//           hasNextPage = result.products.pageInfo.hasNextPage;
//           cursor = result.products.pageInfo.endCursor;
          
//           // Add a small delay between batches to avoid hitting rate limits on the list API
//           if (hasNextPage) {
//             await setTimeout(550);
//           }
//         } catch (error) {
//           console.error("Error fetching products batch:", error);
//           // Wait a bit longer on error before trying again
//           await setTimeout(5000);
//         }
//       }
      
//       console.log(`Finished queuing ${totalQueued} products for processing`);
//     };
    
//     // Run in background
//     fetchAndQueueProducts().catch(error => {
//       console.error("Error in background processing:", error);
//     });
    
//   } catch (error) {
//     console.error("Error starting product processing:", error);
//   }
// });

// Route to manually process a specific product
app.get("/process-product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;

    // Add to queue
    productQueue.push(productId);
    
    res.status(200).send(`Product ${productId} added to processing queue. Current queue size: ${productQueue.length}`);
  } catch (error) {
    console.error("Error queueing product:", error);
    res.status(500).send("Error queueing product");
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
// app.get("/delete-duplicate-collections", async (req, res) => {
//   try {
//     await collectionGenerator.cleanupDuplicateCollections();
//     res.status(200).send("Duplicate collections deleted successfully");
//   } catch (error) {
//     console.error("Error deleting duplicate collections:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

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

// Route to fetch all collections
app.get("/all-collections", async (req, res) => {
  try {
    const collections = await shopifyApi.getExistingSmartCollectionsGraphQL();
    res.status(200).json(collections);
  } catch (error) {
    console.error(`Error fetching all collections:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to fetch a single collection
app.get("/collection/:collectionHandle", async (req, res) => {
  try {
    const { collectionHandle } = req.params;
    const collection = await shopifyApi.getCollectionByHandle(collectionHandle);
    res.status(200).json(collection);
  } catch (error) {
    console.error(`Error fetching collection:`, error.message);
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
    // console.log(
    //   `Visit ${SITE_URL}/process-existing-products to process all existing products`
    // );
    console.log(
      `Visit ${SITE_URL}/register-webhooks?url=${SITE_URL} to register webhooks`
    );
    console.log(
      `Visit ${SITE_URL}/related-collections/:collectionsHandle to get a collection's related collections`
    );
    // console.log(
    //   `Visit ${SITE_URL}/delete-duplicate-collections to delete duplicate collections`
    // );
});
