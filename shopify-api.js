require("dotenv").config();
const axios = require("axios");

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION;

// Shopify API base URL
const shopifyApiUrl = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}`;

// Headers for Shopify API requests
const shopifyHeaders = {
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
};

/**
 * Create a new smart collection
 * @param {Object} collectionDetails - Collection title and rules
 * @returns {Object} Created collection or null if error
 */
async function createSmartCollection(collectionDetails) {
  try {
    console.log(`Attempting to create collection: ${collectionDetails.title}`);
    console.log(`Rules: ${JSON.stringify(collectionDetails.rules, null, 2)}`);

    const response = await axios.post(
      `${shopifyApiUrl}/smart_collections.json`,
      {
        smart_collection: {
          title: collectionDetails.title,
          rules: collectionDetails.rules,
          disjunctive: true, // Products only need to match any rule
          published: true,
        },
      },
      { headers: shopifyHeaders }
    );

    console.log(`Created collection: ${collectionDetails.title}`);
    return response.data.smart_collection;
  } catch (error) {
    // Enhanced error logging
    console.error(
      `Error creating smart collection "${collectionDetails.title}":`
    );

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error(
        `Headers: ${JSON.stringify(error.response.headers, null, 2)}`
      );
      console.error(
        `Response data: ${JSON.stringify(error.response.data, null, 2)}`
      );

      // If there's a more detailed error structure, try to extract it
      if (error.response.data && error.response.data.errors) {
        if (typeof error.response.data.errors === "object") {
          // Handle case where errors is an object with specific field errors
          Object.entries(error.response.data.errors).forEach(
            ([field, messages]) => {
              console.error(
                `Field "${field}": ${
                  Array.isArray(messages) ? messages.join(", ") : messages
                }`
              );
            }
          );
        } else {
          // Handle case where errors is a string or other type
          console.error(`Errors: ${error.response.data.errors}`);
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error(`No response received. Request: ${error.request}`);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(`Error message: ${error.message}`);
    }

    // Log the collection details that caused the error
    console.error(`Collection details that caused the error:`);
    console.error(`Title: ${collectionDetails.title}`);
    console.error(`Rules: ${JSON.stringify(collectionDetails.rules, null, 2)}`);

    return null;
  }
}

/**
 * Get all existing smart collections
 * @returns {Array} List of smart collections
 */
async function getExistingSmartCollections() {
  try {
    const response = await axios.get(
      `${shopifyApiUrl}/smart_collections.json?limit=250`,
      { headers: shopifyHeaders }
    );

    return response.data.smart_collections || [];
  } catch (error) {
    console.error(
      "Error fetching smart collections:",
      error.response?.data || error.message
    );
    return [];
  }
}

/**
 * Run a GraphQL query against the Shopify API
 * @param {String} query - GraphQL query string
 * @param {Object} variables - Variables for the query
 * @returns {Object} Query result
 */
async function runGraphQLQuery(query, variables = {}) {
  try {
    console.log("Running GraphQL query...");

    const response = await axios.post(
      `${shopifyApiUrl}/graphql.json`,
      {
        query,
        variables,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    if (response.data.errors) {
      console.error("GraphQL errors:", response.data.errors);
      // Don't return null here - return the data even if there are errors
      // as the data might still contain usable information
    }

    if (!response.data.data) {
      console.error("No data returned from GraphQL query");
      console.log("Full response:", JSON.stringify(response.data, null, 2));
      return null;
    }

    return response.data.data;
  } catch (error) {
    console.error("Error running GraphQL query:");

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    } else if (error.request) {
      console.error("No response received from request");
    } else {
      console.error(`Error message: ${error.message}`);
    }

    return null;
  }
}

/**
 * Get product details by ID using GraphQL
 * @param {String} productId - Shopify product ID (can be gid or just the number)
 * @returns {Object} Product details
 */
async function getProductByIdGraphQL(productId) {
  console.log(`Getting product by ID: ${productId}`);
  // Ensure productId is in the proper format
  let formattedId = String(productId);
  if (!formattedId.startsWith("gid://")) {
    formattedId = `gid://shopify/Product/${formattedId}`;
  }

  console.log(`Formatted ID: ${formattedId}`);

  const query = `
    {
      product(id: "${formattedId}") {
        id
        title
        handle
        productType
        vendor
        status
        tags
        options {
          id
          name
          values
        }
        metafields(first: 10, namespace: "custom") {
          edges {
            node {
              key
              value
            }
          }
        }
      }
    }
  `;

  const result = await runGraphQLQuery(query);

  console.log(`Result: ${JSON.stringify(result, null, 2)}`);

  if (result && result.product) {
    // Transform the variants structure to match REST API format
    const transformedProduct = {
      ...result.product,
      product_type: result.product.productType,
      metafields: result.product.metafields.edges.map((edge) => edge.node),
    };

    return transformedProduct;
  }

  return null;
}

/**
 * Get all products (paginated)
 * @param {Number} page - Page number
 * @param {Number} limit - Number of products per page
 * @returns {Array} List of products
 */
async function getProducts(limit = 250, after = null) {
  try {
    const query = `
    {
        products(first: ${limit}, after: "${after}") {
            edges {
                node {
                    id
                    title
                    handle
                }
                cursor
            }
            pageInfo{
                hasNextPage
                endCursor
            }
        }
    }
  `;

    const result = await runGraphQLQuery(query);
    console.log(JSON.stringify(result, null, 2));

    return result.data.products || [];
  } catch (error) {
    console.error(
      "Error fetching products:",
      error.response?.data || error.message
    );
    return [];
  }
}

/**
 * Register a webhook for product creation
 * @param {String} callbackUrl - URL to receive webhook
 * @returns {Object} Webhook details or null if error
 */
async function registerProductCreationWebhook(callbackUrl) {
  try {
    const response = await axios.post(
      `${shopifyApiUrl}/webhooks.json`,
      {
        webhook: {
          topic: "products/create",
          address: callbackUrl,
          format: "json",
        },
      },
      { headers: shopifyHeaders }
    );

    console.log("Registered product creation webhook");
    return response.data.webhook;
  } catch (error) {
    console.error(
      "Error registering webhook:",
      error.response?.data || error.message
    );
    return null;
  }
}

/**
 * Get products using GraphQL (paginated)
 * @param {String} cursor - Pagination cursor
 * @param {Number} first - Number of products to fetch
 * @returns {Object} GraphQL response with products and pagination info
 */
async function getProductsGraphQL(cursor = null, first = 50) {
  const query = `
  {
    products(first: ${first}${cursor ? `, after: "${cursor}"` : ""}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          metafields(first: 10, namespace: "custom") {
            edges {
              node {
                key
                value
              }
            }
          }
        }
      }
    }
  }`;

  return await runGraphQLQuery(query);
}

module.exports = {
  createSmartCollection,
  getExistingSmartCollections,
  getProductByIdGraphQL,
  getProducts,
  registerProductCreationWebhook,
  runGraphQLQuery,
  getProductsGraphQL,
};
