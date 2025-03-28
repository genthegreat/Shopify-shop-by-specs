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
          handle: collectionDetails.handle,
          rules: collectionDetails.rules,
          disjunctive: false, // Products must match all rules
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
    let collections = [];
    let nextPageUrl = `${shopifyApiUrl}/smart_collections.json?limit=250`;

    while (nextPageUrl) {
      const response = await axios.get(nextPageUrl, {
        headers: shopifyHeaders,
      });

      // Add the collections from this page to our array
      if (
        response.data.smart_collections &&
        response.data.smart_collections.length > 0
      ) {
        collections = collections.concat(response.data.smart_collections);
      }

      // Check if there's a next page in the Link header
      const linkHeader = response.headers.link || response.headers.Link;
      nextPageUrl = null;

      if (linkHeader) {
        // Use regex to extract the next page URL from the Link header
        const nextLinkMatch = linkHeader.match(
          /<([^>]+)>\s*;\s*rel=(?:"|')?next(?:"|')?/i
        );

        if (nextLinkMatch && nextLinkMatch[1]) {
          nextPageUrl = nextLinkMatch[1];
          console.log(`Pagination: Found next page URL`);
        }
      }
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
 * Run a GraphQL query against the Shopify API
 * @param {String} query - GraphQL query string
 * @param {Object} variables - Variables for the query
 * @returns {Object} Query result
 */
async function runGraphQLQuery(query, variables = {}) {
  try {
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
  createSmartCollection,
  getExistingSmartCollections,
  getExistingSmartCollectionsGraphQL,
  getProductByIdGraphQL,
  getProducts,
  registerProductCreationWebhook,
  runGraphQLQuery,
  getProductsGraphQL,
  deleteSmartCollection,
  getCollectionByHandle,
};
