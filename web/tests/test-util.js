require('dotenv').config();
const axios = require('axios');
const collectionGenerator = require('../collection-generator');

/**
 * Generate a test product with the provided attributes
 * @param {Object} attributes - Product attributes to set
 * @returns {Object} Mock product object
 */
function generateTestProduct(attributes = {}) {
  // Default attributes
  const defaultAttrs = {
    condition: 'New',
    vendor: 'TestVendor',
    product_type: 'TestType',
    size: 'Medium',
    fuel_type: 'Electric'
  };
  
  // Merge with provided attributes
  const mergedAttrs = { ...defaultAttrs, ...attributes };
  
  // Create tags for condition and fuel type
  const tags = `condition:${mergedAttrs.condition}, fuel_type:${mergedAttrs.fuel_type}`;
  
  // Create mock product
  return {
    id: Math.floor(Math.random() * 1000000),
    title: `Test Product ${Math.floor(Math.random() * 1000)}`,
    vendor: mergedAttrs.vendor,
    product_type: mergedAttrs.product_type,
    tags,
    options: [
      {
        name: 'Size',
        values: [mergedAttrs.size]
      }
    ],
    variants: [
      {
        id: Math.floor(Math.random() * 1000000),
        title: `${mergedAttrs.size}`,
        option1: mergedAttrs.size
      }
    ]
  };
}

/**
 * Test the collection generation for a single product
 * @param {Object} attributes - Product attributes to set
 */
async function testSingleProduct(attributes = {}) {
  try {
    console.log('Testing single product with attributes:', attributes);
    const product = generateTestProduct(attributes);
    
    console.log(`Generated test product: ${product.title}`);
    console.log('Product details:', JSON.stringify(product, null, 2));
    
    // Generate combinations
    const combinations = collectionGenerator.generateAttributeCombinations(product);
    console.log(`Generated ${combinations.length} combinations`);
    
    // Print first 5 combinations
    console.log('Sample combinations:');
    combinations.slice(0, 5).forEach((combo, i) => {
      console.log(`[${i + 1}] ${JSON.stringify(combo)}`);
      const details = collectionGenerator.createCollectionDetails(combo);
      if (details) {
        console.log(`   Title: ${details.title}`);
        console.log(`   Rules: ${JSON.stringify(details.rules)}`);
      }
    });
    
    return { product, combinations };
  } catch (error) {
    console.error('Error in test:', error);
  }
}

/**
 * Simulate a webhook call to process a product
 * @param {Object} product - Product object to process
 */
async function simulateWebhook(product) {
  try {
    const webhookUrl = `http://localhost:${process.env.PORT || 3000}/webhooks/products/create`;
    console.log(`Simulating webhook call to ${webhookUrl}`);
    
    const response = await axios.post(webhookUrl, product, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('Webhook response:', response.status, response.data);
  } catch (error) {
    console.error('Error simulating webhook:', error.response?.data || error.message);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  // Test with default attributes
  const { product } = await testSingleProduct();
  
  // Simulate webhook
  await simulateWebhook(product);
  
  // Test with custom attributes
  await testSingleProduct({
    condition: 'Used',
    vendor: 'CustomVendor',
    product_type: 'CustomType',
    size: 'Large',
    fuel_type: 'Gas'
  });
  
  // Test with missing attributes
  await testSingleProduct({
    condition: '',
    fuel_type: ''
  });
}

// If this script is run directly, run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  generateTestProduct,
  testSingleProduct,
  simulateWebhook,
  runTests
}; 