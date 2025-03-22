const shopifyApi = require("./shopify-api");

/* FUNCTIONS NEED FIXING AS WE'RE USING CUSTOM METAFIELDS NOW */

// Attributes we're tracking for combinations
const PRODUCT_ATTRIBUTES = [
  "condition",
  "vendor",
  "product_type",
  "size",
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
        attributes.size = value;
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
    "size",
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
        case "size":
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

  return { title, rules };
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
    console.log(`Product: ${JSON.stringify(product, null, 2)}`);

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

      console.log(`Retrieved products ${JSON.stringify(products, null, 2)}`);

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
      console.error("Failed to fetch metafield definitions");
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
        definitionsMap.size = numericId;
      } else if (key === "fuel_type") {
        definitionsMap.fuel_type = numericId;
      } else {
        // For any other keys, use them as-is
        definitionsMap[key] = numericId;
      }
    });

    return definitionsMap;
  } catch (error) {
    console.error("Error fetching metafield definitions:", error);
    return {};
  }
}

module.exports = {
  processProduct,
  processAllExistingProducts,
  generateAttributeCombinations,
  createCollectionDetails,
  doesSimilarCollectionExist,
  extractProductAttributes,
  getProductMetafieldDefinitions,
};
