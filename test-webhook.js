require('dotenv').config();
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Simulate a webhook received from webhook.site to your local server
 */
async function simulateWebhook() {
  try {
    // Ask for the JSON payload from webhook.site
    rl.question('Paste the webhook payload from webhook.site (JSON): ', async (jsonPayload) => {
      try {
        const payload = JSON.parse(jsonPayload);
        
        // Get local server port
        const port = process.env.PORT || 3000;
        const localEndpoint = `http://localhost:${port}/webhooks/products/create`;
        
        console.log(`Sending webhook payload to local endpoint: ${localEndpoint}`);
        
        // Send to local server
        const response = await axios.post(localEndpoint, payload, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Response from local server:');
        console.log(`Status: ${response.status}`);
        console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);
      } catch (parseError) {
        console.error('Error parsing JSON payload:', parseError);
      }
      
      rl.close();
    });
  } catch (error) {
    console.error('Error simulating webhook:', error);
    rl.close();
  }
}

// Run the simulation
simulateWebhook().catch(console.error); 