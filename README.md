# Zuma Shop by Specs

This repository contains a Shopify theme extension and API for creating and managing "Shop by Specs" related collections on a Shopify store. The system provides a smart way to navigate through collections based on product attributes like manufacturer, height, specs, and more.

## Features

- **Smart Collection Navigation**: Navigate through related collections in a tabbed interface
- **Dynamic Collection Discovery**: Automatically shows related collections based on the current collection
- **SEO-Friendly URLs**: Each collection has its own URL for better SEO than standard collection filtering
- **Consistent Handles**: Collections are created with consistent handles regardless of filter order
- **Fallback Support**: Works even if the API is unavailable by using liquid template fallbacks

## Components

This project has two main components:

1. **Shopify App Extension**: Located in `/shop-by-specs` - This is the UI component that appears on collection pages
2. **Web API Service**: Located in `/web` - This provides the backend API for related collections

## Setup

### Prerequisites

- Node.js (v14+)
- Shopify CLI (v2+)
- Shopify Partner Account
- A Shopify store with API access

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/genthegreat/Shopify-shop-by-specs.git
   cd Shopify-shop-by-specs
   ```

2. Install dependencies for both components:
   ```
   # Install web API dependencies
   cd web
   npm install
   
   # Install Shopify extension dependencies
   cd ../shop-by-specs
   npm install
   ```

3. Configure your environment variables:
   ```
   # In the /web directory
   cp .env.example .env
   ```
   Then edit the `.env` file with your Shopify API credentials and settings.

4. Configure the extension with your API URL:
   ```
   # In the /web directory
   node configure-extension.js
   ```

5. Deploy the web API service to a hosting platform like Render or Heroku.

6. Deploy the Shopify extension:
   ```
   # In the /shop-by-specs directory
   shopify extension push
   ```

## Usage

Once deployed, the "Shop by Specs" tabs will appear on collection pages with the following tabs:

1. **Search By Category**: Navigate to related categories
2. **Search By Manufacturer**: Filter by manufacturer (Genie, JLG, Skyjack, etc.)
3. **Search By Height**: Filter by equipment height
4. **Search By Specs**: Filter by specs like condition, fuel type, etc.
5. **Search Parts**: Quick links to parts collections

## Development

### Local Development

1. Start the API server locally:
   ```
   cd web
   npm start
   ```

2. Use ngrok or a similar tool to create a public URL:
   ```
   ngrok http 3000
   ```

3. Update the API URL in the extension:
   ```
   # Update RENDER_EXTERNAL_URL in .env to your ngrok URL
   node configure-extension.js
   ```

4. Start the Shopify CLI development server:
   ```
   cd ../shop-by-specs
   shopify extension serve
   ```

### Collection Generation

The API includes endpoints for collection generation:

- `GET /process-existing-products`: Process all existing products and create collections
- `GET /process-product/:productId`: Process a specific product
- `GET /register-webhooks`: Register webhooks for product changes
- `GET /delete-duplicate-collections`: Clean up duplicate collections

## Smart Collection Relationships

The system creates relationships between collections based on product attributes:

- Products are grouped by type, vendor, condition, size, and fuel type
- Collections are created with standardized handles
- Collection relationships are established based on shared attributes
- The API endpoint `/related-collections/:collectionHandle` provides structured data about related collections

## Troubleshooting

If the tabs do not appear or show incorrect collections:

1. Check that the extension is properly installed and active
2. Verify that the API service is running and accessible
3. Check the browser console for any JavaScript errors
4. Ensure collections have been properly generated with the expected handles
5. Check the network tab to see if the API requests are successful

## License

This project is licensed under the terms of the included LICENSE file. 