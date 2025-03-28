const shopifyApi = require("./shopify-api");

// Attributes we're tracking for combinations
const PRODUCT_ATTRIBUTES = [
  "condition",
  "vendor",
  "product_type",
  "size_item",
  "fuel_type",
];

/**
 * Extract attributes from a product
 * @param {Object} product - Shopify product object
 * @returns {Object} Extracted attributes
 */
function extractProductAttributes(product) {
  // Initialize attributes with empty values
  const attributes = {
    condition: "",
    vendor: product.vendor || "",
    product_type: product.productType || product.product_type || "",
    size: "",
    fuel_type: "",
  };

  // Check if product has metafields
  if (product.metafields) {
    // Extract values from metafields
    product.metafields.forEach((metafield) => {
      const { key, value } = metafield;

      // Check for our specific attributes in metafields
      if (key === "Condition" || key.toLowerCase() === "condition") {
        attributes.condition = value;
      } else if (key === "size_item" || key.toLowerCase() === "size") {
        attributes.size_item = value;
      } else if (key === "fuel_type") {
        attributes.fuel_type = value;
      }
    });
  }

  return attributes;
}

/**
 * Generate all possible combinations of attributes for a product
 * @param {Object} product - Shopify product object
 * @returns {Array} Array of attribute combinations
 */
function generateAttributeCombinations(product) {
  // Extract attributes from product
  const attributes = extractProductAttributes(product);

  // Ensure product_type exists
  if (!attributes.product_type) {
    console.warn(
      "Product type is missing for product:",
      product.id || product.title
    );
    return []; // Can't proceed without product type
  }

  // Define which attributes are optional and which are required
  const REQUIRED_ATTRIBUTES = ["product_type"];
  const OPTIONAL_ATTRIBUTES = PRODUCT_ATTRIBUTES.filter(
    (attr) => !REQUIRED_ATTRIBUTES.includes(attr)
  );

  // Generate all possible combinations of optional attributes (2^n - 1, excluding empty combination)
  const combinations = [];
  const n = OPTIONAL_ATTRIBUTES.length;

  // Generate combinations of optional attributes, including empty set
  for (let i = 0; i < Math.pow(2, n); i++) {
    const combo = {};
    let bitMask = i;

    // Always include required attributes
    for (const reqAttr of REQUIRED_ATTRIBUTES) {
      combo[reqAttr] = attributes[reqAttr];
    }

    // Add optional attributes based on bit mask
    for (let j = 0; j < n; j++) {
      if (bitMask & 1) {
        const attrName = OPTIONAL_ATTRIBUTES[j];
        if (attributes[attrName]) {
          combo[attrName] = attributes[attrName];
        }
      }
      bitMask = bitMask >> 1;
    }

    // Add this combination if it has at least one optional attribute or is just the required attributes
    if (Object.keys(combo).length > REQUIRED_ATTRIBUTES.length || i === 0) {
      combinations.push(combo);
    }
  }

  return combinations;
}

/**
 * Create collection title and rules from attribute combination
 * @param {Object} combination - Attribute combination
 * @param {Object} metafieldDefinitions - Map of attribute names to definition IDs
 * @returns {Object} Collection details with title and rules
 */
function createCollectionDetails(combination, metafieldDefinitions = {}) {
  const attrEntries = Object.entries(combination).filter(([_, value]) => value);

  if (attrEntries.length === 0) return null;

  // Define the desired order of attributes
  const attributeOrder = [
    "condition",
    "size_item",
    "vendor",
    "fuel_type",
    "product_type",
  ];

  // Sort the attribute entries according to the defined order
  attrEntries.sort((a, b) => {
    const indexA = attributeOrder.indexOf(a[0]);
    const indexB = attributeOrder.indexOf(b[0]);

    // If both attributes are in our ordered list, use that order
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }

    // If only one attribute is in our ordered list, prioritize it
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // If neither attribute is in our ordered list, maintain original order
    return 0;
  });

  // Create title using the ordered values
  const title = attrEntries.map(([_, value]) => value).join(" ");

  // Create handle parts for easier construction of standardized handles
  const handleParts = {};
  
  // Process each attribute for the handle
  attrEntries.forEach(([attr, value]) => {
    // Convert the value to a handle-friendly format
    const handleValue = value.toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-')      // Remove consecutive hyphens
      .trim();                   // Trim whitespace
    
    // Store in our handle parts object
    handleParts[attr] = handleValue;
  });
  
  // Create a standardized handle that always follows our attribute order
  // This way we ensure consistent handles regardless of how collections are created
  const handle = attributeOrder
    .filter(attr => handleParts[attr]) // Only include attributes that exist
    .map(attr => handleParts[attr])    // Get the handle-friendly value
    .join('-');                        // Join with hyphens
  
  // Create rules for the smart collection
  const rules = attrEntries
    .map(([attr, value]) => {
      switch (attr) {
        case "vendor":
          return {
            column: "vendor",
            relation: "equals",
            condition: value,
          };
        case "product_type":
          return {
            column: "type",
            relation: "equals",
            condition: value,
          };
        case "condition":
        case "fuel_type":
        case "size_item":
          // Check if we have a metafield definition for this attribute
          if (metafieldDefinitions[attr]) {
            return {
              column: "product_metafield_definition",
              relation: "equals",
              condition: value,
              condition_object_id: metafieldDefinitions[attr],
            };
          }
        default:
          return null;
      }
    })
    .filter((rule) => rule !== null);

  return { title, handle, rules };
}

/**
 * Check if collection with similar rules already exists
 * @param {Array} rules - Collection rules to check
 * @param {Array} existingCollections - List of existing smart collections
 * @returns {Boolean} True if similar collection exists
 */
function doesSimilarCollectionExist(rules, existingCollections) {
  for (const collection of existingCollections) {
    if (!collection.rules) continue;

    // If rules length doesn't match, this isn't the same collection
    if (collection.rules.length !== rules.length) continue;

    // Check if all rules match
    const allRulesMatch = rules.every((newRule) => {
      return collection.rules.some(
        (existingRule) =>
          existingRule.column === newRule.column &&
          existingRule.relation === newRule.relation &&
          existingRule.condition === newRule.condition &&
          // If using metafield, also check condition_object_id
          (newRule.column !== "product_metafield_definition" ||
            existingRule.condition_object_id === newRule.condition_object_id)
      );
    });

    if (allRulesMatch) return true;
  }

  return false;
}

/**
 * Process a product to create attribute-based collections
 * @param {String|Object} productIdOrObj - Shopify product ID or product object
 */
async function processProduct(productIdOrObj) {
  try {
    // Get product details if only ID was provided
    let product;

    product = await shopifyApi.getProductByIdGraphQL(productIdOrObj);

    if (!product) {
      console.error("Product not found");
      return;
    }

    // Get metafield definitions for creating proper rules
    const metafieldDefinitions = await getProductMetafieldDefinitions();

    // Get existing collections to check for duplicates
    const existingCollections = await shopifyApi.getExistingSmartCollections();

    // Generate all attribute combinations
    const combinations = generateAttributeCombinations(product);
    console.log(
      `Generated ${combinations.length} combinations for product ${product.id}`
    );

    // For each combination, create a collection if it doesn't already exist
    for (const combination of combinations) {
      const collectionDetails = createCollectionDetails(
        combination,
        metafieldDefinitions
      );

      if (!collectionDetails) continue;

      // Check if similar collection already exists
      if (
        doesSimilarCollectionExist(collectionDetails.rules, existingCollections)
      ) {
        console.log(`Collection already exists: ${collectionDetails.title}`);
        continue;
      }

      // Create new collection
      await shopifyApi.createSmartCollection(collectionDetails);
    }

    console.log(`Finished processing product ${product.id}`);
  } catch (error) {
    console.error("Error processing product:", error);
  }
}


/**
 * Process all existing products to create attribute-based collections using GraphQL
 */
async function processAllExistingProducts() {
  try {
    let hasNextPage = true;
    let cursor = null;
    let productsProcessed = 0;

    while (hasNextPage) {
      const result = await shopifyApi.getProductsGraphQL(cursor);

      if (!result || !result.products || !result.products.edges) {
        console.error("Error fetching products: Invalid response structure");
        break;
      }

      const products = result.products.edges.map((edge) => {
        // Transform the product structure to match what our processing expects
        const product = edge.node;
        return {
          productId: product.id,
          productTitle: product.title,
        };
      });

      console.log(
        `Processing ${products.length} products (total processed: ${productsProcessed})`
      );

      // Process each product
      for (const product of products) {
        await processProduct(product.productId);
        productsProcessed++;
      }

      // Update pagination info for next iteration
      hasNextPage = result.products.pageInfo.hasNextPage;
      cursor = result.products.pageInfo.endCursor;
    }

    console.log(
      `Finished processing all ${productsProcessed} existing products`
    );
  } catch (error) {
    console.error("Error processing existing products:", error);
  }
}

/**
 * Get all metafield definitions for products
 * @returns {Object} Map of our internal attribute names to definition IDs
 */
async function getProductMetafieldDefinitions() {
  console.log(`Getting metafield definitions`);
  
  const query = `
  {
    metafieldDefinitions(
      first: 50,
      ownerType: PRODUCT,
      namespace: "custom"
    ) {
      edges {
        node {
          id
          name
          key
          type {
            name
          }
        }
      }
    }
  }
  `;

  try {
    const result = await shopifyApi.runGraphQLQuery(query);

    if (
      !result ||
      !result.metafieldDefinitions ||
      !result.metafieldDefinitions.edges
    ) {
      console.error(`Failed to fetch metafield definitions - invalid response structure`);
      return {};
    }

    // Create a map of our internal attribute names to metafield definition IDs
    const definitionsMap = {};

    result.metafieldDefinitions.edges.forEach((edge) => {
      const { key, id } = edge.node;
      
      // Extract numeric ID from GraphQL ID (format: gid://shopify/MetafieldDefinition/ID)
      const numericId = id.split("/").pop();

      // Map Shopify keys to our internal attribute names
      if (key === "Condition" || key.toLowerCase() === "condition") {
        definitionsMap.condition = numericId;
      } else if (key === "size_item") {
        definitionsMap.size_item = numericId;
      } else if (key === "fuel_type") {
        definitionsMap.fuel_type = numericId;
      } else {
        // For any other keys, use them as-is
        definitionsMap[key] = numericId;
      }
    });

    return definitionsMap;
  } catch (error) {
    console.error(`Error fetching metafield definitions:`, error);
    return {};
  }
}

/**
 * Find and remove duplicate smart collections
 */
async function cleanupDuplicateCollections() {
  try {
    console.log("Starting duplicate collection cleanup...");
    
    // Get all smart collections
    const allCollections = await shopifyApi.getExistingSmartCollections();
    console.log(`Found ${allCollections.length} smart collections total`);
    
    // Group collections by their rule configurations
    const collectionsByRules = {};
    
    // Process each collection
    for (const collection of allCollections) {
      // Skip collections without rules
      if (!collection.rules || collection.rules.length === 0) continue;
      
      // Create a unique key representing this rule set
      // Sort the rules to ensure consistent key generation
      const sortedRules = [...collection.rules].sort((a, b) => {
        // First sort by column
        if (a.column < b.column) return -1;
        if (a.column > b.column) return 1;
        
        // Then by condition
        if (a.condition < b.condition) return -1;
        if (a.condition > b.condition) return 1;
        
        return 0;
      });
      
      // Generate a string key from the rule set
      const ruleKey = sortedRules.map(rule => 
        `${rule.column}:${rule.relation}:${rule.condition}${rule.condition_object_id ? ':' + rule.condition_object_id : ''}`
      ).join('|');
      
      // Add to our grouping
      if (!collectionsByRules[ruleKey]) {
        collectionsByRules[ruleKey] = [];
      }
      collectionsByRules[ruleKey].push(collection);
    }
    
    // Find and remove duplicates
    const collectionsToDelete = [];
    
    for (const ruleKey in collectionsByRules) {
      const collectionsWithSameRules = collectionsByRules[ruleKey];
      
      // If there are multiple collections with the same rules
      if (collectionsWithSameRules.length > 1) {
        console.log(`Found ${collectionsWithSameRules.length} collections with identical rules:`);
        
        // Sort by creation date or ID to keep the oldest/first one
        collectionsWithSameRules.sort((a, b) => {
          // If we have created_at timestamps, use those
          if (a.created_at && b.created_at) {
            return new Date(a.created_at) - new Date(b.created_at);
          }
          // Otherwise sort by ID (assuming lower ID = older)
          return parseInt(a.id) - parseInt(b.id);
        });
        
        // Keep the first one, mark the rest for deletion
        const keepCollection = collectionsWithSameRules[0];
        console.log(`Keeping: "${keepCollection.title}" (ID: ${keepCollection.id})`);
        
        for (let i = 1; i < collectionsWithSameRules.length; i++) {
          const dupeCollection = collectionsWithSameRules[i];
          console.log(`Will delete: "${dupeCollection.title}" (ID: ${dupeCollection.id})`);
          collectionsToDelete.push(dupeCollection.id);
        }
      }
    }
    
    // Delete the duplicate collections
    if (collectionsToDelete.length > 0) {
      console.log(`\nDeleting ${collectionsToDelete.length} duplicate collections...`);
      
      // Delete collections one by one to avoid rate limits
      for (const collectionId of collectionsToDelete) {
        try {
          await shopifyApi.deleteSmartCollection(collectionId);
          console.log(`Deleted collection ID: ${collectionId}`);
          
          // Add a small delay to avoid hitting rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Error deleting collection ${collectionId}:`, error.message);
        }
      }
      
      console.log("Cleanup complete!");
    } else {
      console.log("No duplicate collections found!");
    }
    
  } catch (error) {
    console.error("Error cleaning up collections:", error);
  }
}

// Helper function to safely extract image URL from collection
function getCollectionImageUrl(collection) {
  try {
    // First try direct image URL if available
    if (collection.image && collection.image.url) {
      return collection.image.url;
    }
    
    // Then try to get from products if available
    if (collection.products && 
        collection.products.edges && 
        collection.products.edges.length > 0 &&
        collection.products.edges[0].node &&
        collection.products.edges[0].node.featuredMedia &&
        collection.products.edges[0].node.featuredMedia.preview &&
        collection.products.edges[0].node.featuredMedia.preview.image &&
        collection.products.edges[0].node.featuredMedia.preview.image.url) {
      return collection.products.edges[0].node.featuredMedia.preview.image.url;
    }
    
    // Return null if no image found
    return null;
  } catch (error) {
    console.log(`Error extracting image for collection ${collection.title}:`, error);
    return null;
  }
}

/**
 * Get related collections for a given collection handle
 * @param {String} collectionHandle - The handle of the current collection
 * @returns {Object} Related collections organized by tab category
 */
async function getRelatedCollections(collectionHandle) {
  try {
    console.log(`Getting related collections for: ${collectionHandle}`);
    
    // Step 1: Get the current collection details
    const collection = await shopifyApi.getCollectionByHandle(collectionHandle);
    
    if (!collection) {
      console.error(`Collection not found with handle: ${collectionHandle}`);
      throw new Error(`Collection not found with handle: ${collectionHandle}`);
    }

    // Fetch metafield definitions once - OPTIMIZATION
    const metafieldDefinitions = await getProductMetafieldDefinitions();

    // Step 2: Parse the collection attributes from title and rules
    const collectionAttributes = await parseCollectionAttributes(collection, metafieldDefinitions);
    
    // Step 3: Get all collections
    const allCollections = await shopifyApi.getExistingSmartCollectionsGraphQL();
    console.log(`Processing ${allCollections.length} collections`);
    
    // Step 4: Organize related collections by category
    const related = {
      byCategory: [],
      byManufacturer: [],
      bySizeItem: [],
      bySpecs: {
        condition: [],
        fuelType: []
      },
      parts: []
    };

    // Get product type (category)
    const productType = collectionAttributes.product_type || '';
    
    // Calculate parent category (remove most specific attribute)
    let parentCategory;
    if (productType) {
      // Basic parent is just the product type
      parentCategory = productType;
    }

    // Get collections by category
    let processedCount = 0;
    
    for (const otherCollection of allCollections) {
      processedCount++;
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount}/${allCollections.length} collections`);
      }
      
      // Pass metafield definitions to avoid refetching
      const otherAttributes = await parseCollectionAttributes(otherCollection, metafieldDefinitions);
      
      // Skip the current collection
      if (otherCollection.handle === collectionHandle) {
        continue;
      }
      
      // Get image URL safely
      const imageUrl = getCollectionImageUrl(otherCollection);
      
      // Category tab: collections that share the product type but have different attributes
      if (otherAttributes.product_type === productType) {
        related.byCategory.push({
          title: otherCollection.title,
          handle: otherCollection.handle,
          image: imageUrl
        });
      }
      
      // Manufacturer tab: if collection doesn't have a vendor filter but current collection has product type
      if (!collectionAttributes.vendor && productType && 
          otherAttributes.product_type === productType &&
          otherAttributes.vendor) {
        related.byManufacturer.push({
          title: otherCollection.title,
          handle: otherCollection.handle,
          image: imageUrl
        });
      }
      
      // Height tab: if collection doesn't have a size filter but current collection has product type
      if (!collectionAttributes.size_item && productType &&
          otherAttributes.product_type === productType &&
          otherAttributes.size_item) {
        related.bySizeItem.push({
          title: otherCollection.title,
          handle: otherCollection.handle,
          image: imageUrl
        });
      }
      
      // Specs - Condition: if collection doesn't have a condition filter but current collection has product type
      if (!collectionAttributes.condition && productType &&
          otherAttributes.product_type === productType &&
          otherAttributes.condition) {
        related.bySpecs.condition.push({
          title: otherCollection.title,
          handle: otherCollection.handle,
          image: imageUrl
        });
      }
      
      // Specs - Fuel Type: if collection doesn't have a fuel_type filter but current collection has product type
      if (!collectionAttributes.fuel_type && productType &&
          otherAttributes.product_type === productType &&
          otherAttributes.fuel_type) {
        related.bySpecs.fuelType.push({
          title: otherCollection.title,
          handle: otherCollection.handle,
          image: imageUrl
        });
      }
    }
    
    // Always include parts collections
    related.parts = [
      { title: "Genie Parts", handle: "genie-parts" },
      { title: "JLG Parts", handle: "jlg-parts" },
      { title: "Skyjack Parts", handle: "skyjack-parts" },
      { title: "Haulage Parts", handle: "haulage-parts" }
    ];
    
    console.log(`Completed finding related collections for: ${collectionHandle}`);
    return related;
  } catch (error) {
    console.error(`Error in getRelatedCollections for ${collectionHandle}:`, error);
    throw error;
  }
}

/**
 * Parse collection attributes from collection object
 * @param {Object} collection - Shopify collection object
 * @param {Object} [providedMetafieldDefinitions] - Optional metafield definitions to use instead of fetching
 * @returns {Object} Parsed attributes
 */
async function parseCollectionAttributes(collection, providedMetafieldDefinitions = null) {
  const attributes = {
    product_type: '',
    vendor: '',
    condition: '',
    size_item: '',
    fuel_type: ''
  };
  
  // Get metafield definitions mapping - use provided definitions or fetch them
  let metafieldDefinitions;
  if (providedMetafieldDefinitions) {
    metafieldDefinitions = providedMetafieldDefinitions;
  } else {
    metafieldDefinitions = await getProductMetafieldDefinitions();
  }
  
  // Create a reverse mapping from definition IDs to our attribute keys
  const definitionIdToAttribute = {};
  for (const [attrName, definitionId] of Object.entries(metafieldDefinitions)) {
    definitionIdToAttribute[definitionId] = attrName;
  }
  
  // Handle both REST API format (rules array) and GraphQL format (ruleSet)
  if (collection.rules && Array.isArray(collection.rules)) {
    // REST API format
    for (const rule of collection.rules) {
      if (rule.column === 'type') {
        attributes.product_type = rule.condition;
      } else if (rule.column === 'vendor') {
        attributes.vendor = rule.condition;
      } else if (rule.column === 'product_metafield_definition' && rule.condition_object_id) {
        // Extract the numeric ID from the GraphQL ID if needed
        const definitionId = rule.condition_object_id.includes('/') 
          ? rule.condition_object_id.split('/').pop() 
          : rule.condition_object_id;
        
        // Look up which attribute this definition ID corresponds to
        const attributeKey = definitionIdToAttribute[definitionId];
        if (attributeKey) {
          attributes[attributeKey] = rule.condition;
        }
      }
    }
  } else if (collection.ruleSet && collection.ruleSet.rules) {
    // GraphQL format
    for (const rule of collection.ruleSet.rules) {
      const column = rule.column.toLowerCase(); // GraphQL returns uppercase
      
      if (column === 'type') {
        attributes.product_type = rule.condition;
      } else if (column === 'vendor') {
        attributes.vendor = rule.condition;
      } else if (column === 'product_metafield_definition') {
        // Here we can now use the conditionObject that contains metafieldDefinition
        if (rule.conditionObject && rule.conditionObject.metafieldDefinition) {
          const metafieldDef = rule.conditionObject.metafieldDefinition;
          
          // Extract the ID from the GraphQL ID
          const definitionId = metafieldDef.id.split('/').pop();
          
          // First try to map using the definition ID
          let attributeKey = definitionIdToAttribute[definitionId];
          
          // If no mapping found by ID, try to map using the key name
          if (!attributeKey) {
            const key = metafieldDef.key.toLowerCase();
            
            if (key === 'condition' || key === 'Condition') {
              attributeKey = 'condition';
            } else if (key === 'size_item' || key === 'size') {
              attributeKey = 'size_item';
            } else if (key === 'fuel_type') {
              attributeKey = 'fuel_type';
            }
          }
          
          // If we found an attribute key, set the value
          if (attributeKey) {
            attributes[attributeKey] = rule.condition;
            continue;
          }
        }
        
        // Fallback to pattern matching if we couldn't determine the attribute from metadata
        const condition = rule.condition.toLowerCase();
        
        if (/\b(used|new|refurbished)\b/.test(condition)) {
          attributes.condition = rule.condition;
        } else if (/(\d+['"]|\d+ft|\d+-\d+|feet|\d+')/.test(condition)) {
          attributes.size_item = rule.condition;
        } else if (/\b(electric|diesel|gas|hybrid|propane)\b/.test(condition)) {
          attributes.fuel_type = rule.condition;
        }
      }
    }
  }
  
  return attributes;
}

module.exports = {
  processProduct,
  processAllExistingProducts,
  generateAttributeCombinations,
  createCollectionDetails,
  doesSimilarCollectionExist,
  extractProductAttributes,
  getProductMetafieldDefinitions,
  cleanupDuplicateCollections,
  getRelatedCollections
};
