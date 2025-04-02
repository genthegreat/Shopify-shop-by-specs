require("dotenv").config();
const axios = require("axios");
const { setTimeout } = require('timers/promises');

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

// Tracking for rate limiting
let lastRequestTime = 0;
const minRequestInterval = 500; // 500ms between requests = max 2 requests per second
let retryQueue = [];
let isProcessingQueue = false;

/**
 * Run a GraphQL query with rate limiting and retry logic
 * @param {String} query - GraphQL query
 * @param {Object} variables - Query variables
 * @param {Number} attempt - Current attempt number (used for retries)
 * @returns {Object} Query result
 */
async function runGraphQLQuery(query, variables = {}, attempt = 1) {
  // Wait if needed to respect rate limits
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < minRequestInterval) {
    await setTimeout(minRequestInterval - timeSinceLastRequest);
  }
  
  // Update last request time
  lastRequestTime = Date.now();
  
  try {
    const response = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    // Handle rate limiting
    if (response.status === 429) {
      console.log(`Rate limited! Attempt ${attempt} - waiting before retry...`);
      
      // Exponential backoff: wait longer for each retry
      const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await setTimeout(retryDelay);
      
      // Retry with incremented attempt counter (up to max of 5 attempts)
      if (attempt < 5) {
        return runGraphQLQuery(query, variables, attempt + 1);
      } else {
        throw new Error('Max retry attempts reached after rate limiting');
      }
    }

    const result = await response.json();
    
    // Check for GraphQL errors
    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      
      // Check if any error is a throttling error
      const hasThrottleError = result.errors.some(error => 
        error.message && error.message.includes('Throttled'));
      
      if (hasThrottleError && attempt < 5) {
        console.log(`Throttled! Attempt ${attempt} - waiting before retry...`);
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await setTimeout(retryDelay);
        return runGraphQLQuery(query, variables, attempt + 1);
      }
      
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }
    
    return result.data;
  } catch (error) {
    console.error(`Error in GraphQL request (attempt ${attempt}):`, error.message);
    
    // General retry for network errors
    if (error.message.includes('fetch') && attempt < 5) {
      console.log(`Network error! Attempt ${attempt} - retrying...`);
      const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await setTimeout(retryDelay);
      return runGraphQLQuery(query, variables, attempt + 1);
    }
    
    throw error;
  }
}

/**
 * Create a new smart collection using GraphQL
 * @param {Object} collectionDetails - Collection title and rules
 * @returns {Object} Created collection or null if error
 */
async function createSmartCollectionGraphQL(collectionDetails) {
  try {
    console.log(`Attempting to create collection: ${collectionDetails.title}`);
    console.log(`Rules: ${JSON.stringify(collectionDetails.rules, null, 2)}`);

    // First, get all active publications
    const publications = await getShopPublications();
    if (!publications || publications.length === 0) {
      console.error("No publications found to publish collection to");
      return null;
    }

    // Format rules for GraphQL
    const graphqlRules = collectionDetails.rules.map(rule => {
      // Convert REST API rule format to GraphQL format
      const graphqlRule = {
        column: rule.column.toUpperCase(),
        relation: rule.relation.toUpperCase(),
        condition: rule.condition
      };

      // Add condition object ID for metafield rules
      if (rule.column === "product_metafield_definition" && rule.definition_id) {
        graphqlRule.conditionObjectId = `gid://shopify/MetafieldDefinition/${rule.definition_id}`;
      }

      return graphqlRule;
    });

    const query = `
      mutation CollectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          userErrors {
            field
            message
          }
          collection {
            id
            title      
            handle
            sortOrder
            ruleSet {
              appliedDisjunctively
              rules {
                column
                relation
                condition
              }
            }    
          }
        }
      }
    `;

    // Create publication connections array
    const publicationConnections = publications.map(pub => ({
      publicationId: pub.id
    }));

    const variables = {
      "input": {
        "title": collectionDetails.title,
        "handle": collectionDetails.handle || undefined,
        "ruleSet": {
          "appliedDisjunctively": false,
          "rules": graphqlRules
        },
        "publications": publicationConnections
      }
    };
    
    const result = await runGraphQLQuery(query, variables);

    if (result.collectionCreate.userErrors && result.collectionCreate.userErrors.length > 0) {
      console.error("GraphQL errors creating collection:", result.collectionCreate.userErrors);
      return null;
    }

    return result.collectionCreate.collection;
    
  } catch (error) {
    console.error(
      `Error creating smart collection "${collectionDetails.title}":`,
      error.message
    );
    console.error(`Collection details that caused the error:`);
    console.error(`Title: ${collectionDetails.title}`);
    console.error(`Rules: ${JSON.stringify(collectionDetails.rules, null, 2)}`);
    return null;
  }
}

/**
 * Get all shop publications using GraphQL
 * @returns {Array} Array of publication objects
 */
async function getShopPublications() {
  try {
    const query = `
      query GetPublications {
        publications(first: 10) {
          edges {
            node {
              id
              name
              supportsFuturePublishing
            }
          }
        }
      }
    `;

    const result = await runGraphQLQuery(query);
    
    if (!result.publications || !result.publications.edges) {
      return [];
    }

    // Filter to only active publications
    return result.publications.edges
      .map(edge => edge.node)
      .filter(pub => pub.supportsFuturePublishing);

  } catch (error) {
    console.error("Error fetching publications:", error);
    return [];
  }
}

/**
 * Get all existing smart collections using GraphQL
 * @returns {Array} List of smart collections
 */
async function getExistingSmartCollectionsGraphQL() {
  try {
    let hasNextPage = true;
    let cursor = null;
    let collections = [];

    while (hasNextPage) {
      const query = `
        {
          collections(query: "collection_type:smart", first: 50 ${
            cursor ? `, after: "${cursor}"` : ""
          }) {
            pageInfo {
                hasNextPage
                endCursor
              }
            edges {
              node {
                id
                title
                handle
                products(first: 1){
                    edges{
                        node{
                            featuredMedia{
                                preview{
                                    image{
                                        url
                                        altText
                                    }
                                }
                            }
                        }
                    }
                }
                ruleSet{
                    appliedDisjunctively
                    rules{
                        column
                        condition
                        relation
                        conditionObject{
                            ...on CollectionRuleMetafieldCondition{
                                metafieldDefinition{
                                    id
                                    key
                                }
                            }
                        }
                    }
                }
              }
            }
          }
        }
      `;
      const result = await runGraphQLQuery(query);

      if (!result || !result.collections || !result.collections.edges) {
        console.error("Error fetching collections: Invalid response structure");
        break;
      }

      // Push the collections from this page to our array
      collections.push(...result.collections.edges.map((edge) => edge.node));

      // Update pagination info for next iteration
      hasNextPage = result.collections.pageInfo.hasNextPage;
      cursor = result.collections.pageInfo.endCursor;
    }

    return collections;
  } catch (error) {
    console.error(
      "Error fetching smart collections:",
      error.response?.data || error.message
    );
    return [];
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

/**
 * Delete a smart collection
 * @param {String} collectionId - The ID of the collection to delete
 * @returns {Object} Response data
 */
async function deleteSmartCollection(collectionId) {
  try {
    const response = await axios.delete(
      `${shopifyApiUrl}/smart_collections/${collectionId}.json`,
      { headers: shopifyHeaders }
    );
    return true;
  } catch (error) {
    console.error(
      `Error deleting collection ${collectionId}:`,
      error.response?.data || error.message
    );
    return false;
  }
}

/**
 * Get a collection by its handle
 * @param {String} handle - Collection handle
 * @returns {Object} Collection object or null if not found
 */
async function getCollectionByHandle(handle) {
  try {
    // Try by GraphQL first
    const graphqlResponse = await runGraphQLQuery(
      `
      {
        collectionByHandle(handle: "${handle}") {
          id
          title
          handle
          image{
            url
            altText
          }
          products(first: 1){
            edges{
              node{
                featuredMedia{
                  preview{
                    image{
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
          ruleSet{
            appliedDisjunctively
            rules{
                column
                condition
                relation
                conditionObject{
                  ...on CollectionRuleMetafieldCondition{
                      metafieldDefinition{
                          id
                          key
                      }
                  }
              }
            }
          }
        }
      }
    `
    );

    if (graphqlResponse && graphqlResponse.collectionByHandle) {
      return graphqlResponse.collectionByHandle;
    }

    // Try to find the collection in smart collections first
    const smartResponse = await axios.get(
      `${shopifyApiUrl}/smart_collections.json?handle=${handle}`,
      { headers: shopifyHeaders }
    );

    if (
      smartResponse.data.smart_collections &&
      smartResponse.data.smart_collections.length > 0
    ) {
      return smartResponse.data.smart_collections[0];
    }

    // If not found in smart collections, try custom collections
    const customResponse = await axios.get(
      `${shopifyApiUrl}/custom_collections.json?handle=${handle}`,
      { headers: shopifyHeaders }
    );

    if (
      customResponse.data.custom_collections &&
      customResponse.data.custom_collections.length > 0
    ) {
      return customResponse.data.custom_collections[0];
    }

    // Collection not found
    console.log(`Collection with handle ${handle} not found`);
    return null;
  } catch (error) {
    console.error(
      `Error fetching collection by handle ${handle}:`,
      error.response?.data || error.message
    );
    return null;
  }
}

module.exports = {
  createSmartCollectionGraphQL,
  getExistingSmartCollectionsGraphQL,
  getProductByIdGraphQL,
  getProducts,
  registerProductCreationWebhook,
  runGraphQLQuery,
  getProductsGraphQL,
  deleteSmartCollection,
  getCollectionByHandle,
};
