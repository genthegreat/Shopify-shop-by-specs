require("dotenv").config();
const shopifyApi = require("./shopify-api");
const collectionGenerator = require("./collection-generator");

async function testGraphQLProduct() {
  try {
    // You can test with a product ID from your store
    const productId = process.argv[2] || "8436715487398";

    console.log(`Fetching product ${productId} using GraphQL...`);
    const product = await shopifyApi.getProductByIdGraphQL(productId);

    if (!product) {
      console.error("Product not found");
      return;
    }

    console.log("Product details:");
    console.log(`- Title: ${product.title}`);
    console.log(`- Type: ${product.productType}`);
    console.log(`- Vendor: ${product.vendor}`);

    // Show metafields
    if (product.metafields) {
      console.log("Metafields:");
      product.metafields.forEach((metafield) => {
        console.log(`- ${metafield.key}: ${metafield.value}`);
      });
    }

    // Extract and show attributes
    const attributes = collectionGenerator.extractProductAttributes(product);
    console.log("Extracted attributes:");
    Object.entries(attributes).forEach(([key, value]) => {
      console.log(`- ${key}: ${value}`);
    });

    // Generate combinations
    const combinations =
      collectionGenerator.generateAttributeCombinations(product);
    console.log(`Generated ${combinations.length} combinations`);

    // Get metafield definitions
    const metafieldDefinitions =
      await collectionGenerator.getProductMetafieldDefinitions();

    // Get existing collections to check for duplicates
    const existingCollections = await shopifyApi.getExistingSmartCollections();

    // Show a few combinations
    console.log("Sample combinations:");
    combinations.slice(0, 30).forEach((combo, i) => {
      console.log(`[${i + 1}] ${JSON.stringify(combo)}`);
      const details = collectionGenerator.createCollectionDetails(
        combo,
        metafieldDefinitions
      );
      if (details) {
        console.log(`   Title: ${details.title}`);

        // Check if similar collection already exists
        if (
          collectionGenerator.doesSimilarCollectionExist(
            details.rules,
            existingCollections
          )
        ) {
          console.log(`Collection already exists: ${details.title}`);
          return; // Changed continue to return since we can't continue across function boundaries
        }

        // Create new collection
        shopifyApi.createSmartCollection(details);
      }
    });
  } catch (error) {
    console.error("Error in test:", error);
  }
}

// Run the test
testGraphQLProduct().catch(console.error);
