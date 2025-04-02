require("dotenv").config();
const axios = require("axios");
const { setTimeout } = require("timers/promises");

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

module.exports = {
  createSmartCollection,
  getExistingSmartCollections,
};
