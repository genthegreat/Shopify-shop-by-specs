require('dotenv').config();
const shopifyApi = require('./shopify-api');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Register the product creation webhook
 */
async function registerWebhook() {
  try {
    console.log('Registering product creation webhook...');
    
    // Ask for the webhook URL
    rl.question('Enter your webhook.site URL: ', async (webhookSiteUrl) => {
      if (!webhookSiteUrl) {
        console.error('Webhook URL is required');
        rl.close();
        return;
      }
      
      console.log(`Registering webhook to: ${webhookSiteUrl}`);
      
      // Register webhook with webhook.site URL
      const webhook = await shopifyApi.registerProductCreationWebhook(webhookSiteUrl);
      
      if (webhook) {
        console.log('Webhook registered successfully!');
        console.log('Webhook details:', JSON.stringify(webhook, null, 2));
      } else {
        console.error('Failed to register webhook');
      }
      
      rl.close();
    });
  } catch (error) {
    console.error('Error registering webhook:', error);
    rl.close();
  }
}

// If this script is run directly, register webhook
if (require.main === module) {
  registerWebhook().catch(console.error);
}

module.exports = { registerWebhook }; 