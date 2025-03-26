/**
 * Configure Shop by Specs Collections Extension
 * 
 * This script sets up the Shop by Specs extension with the correct API URL.
 * Run this after deploying the web service to update the extension's JavaScript.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const shopifyApi = require("./shopify-api");

// External URL of the render app
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

// Paths to extension files
const EXTENSION_ROOT = path.resolve(__dirname, "../shop-by-specs/extensions/shop-by-specs-collections");
const JS_FILE_PATH = path.join(EXTENSION_ROOT, "assets/shop-by-tabs.js");

async function configureExtension() {
  try {
    console.log("Configuring Shop by Specs extension...");
    
    // 1. Read the JavaScript file
    console.log(`Reading JS file from: ${JS_FILE_PATH}`);
    let jsContent = fs.readFileSync(JS_FILE_PATH, "utf8");
    
    // 2. Update the API URL
    console.log(`Setting API URL to: ${RENDER_EXTERNAL_URL}`);
    jsContent = jsContent.replace(
      /const apiBaseUrl = ".*";/,
      `const apiBaseUrl = "${RENDER_EXTERNAL_URL}";`
    );
    
    // 3. Write the updated file
    fs.writeFileSync(JS_FILE_PATH, jsContent, "utf8");
    console.log("Updated JS file with correct API URL.");
    
    // 4. Verify our API endpoints are working
    console.log("Testing API endpoints...");
    
    // 5. Test the getCollectionByHandle function
    console.log("Testing getCollectionByHandle...");
    const testCollection = await shopifyApi.getCollectionByHandle("boom-lifts");
    if (testCollection) {
      console.log(`✅ Successfully retrieved collection: ${testCollection.title}`);
    } else {
      console.log("❌ Could not retrieve test collection.");
    }
    
    console.log("\nExtension configuration complete!");
    console.log(`\nAPI Base URL: ${RENDER_EXTERNAL_URL}`);
    console.log("\nNext steps:");
    console.log("1. Build and deploy the extension to your Shopify store");
    console.log("2. Ensure your web API is running and accessible");
    console.log("3. Test the related collections functionality on your store");
    
  } catch (error) {
    console.error("Error configuring extension:", error);
  }
}

// Run the configuration
configureExtension().catch(console.error); 