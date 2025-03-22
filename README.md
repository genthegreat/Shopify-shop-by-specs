# Shop by Specs - Shopify App

This Node.js application automatically creates "Shop by Attributes" smart collections for Shopify products based on five key attributes:

- Condition
- Vendor
- Product Type
- Size
- Fuel Type

## Features

- Creates smart collections for all possible combinations of product attributes (up to 31 combinations per product)
- Avoids creating duplicate collections by checking existing collections against new ones
- Processes new products via Shopify webhooks
- Can process all existing products in the store
- Uses Shopify's Smart Collection API to create rules-based collections

## Requirements

- Node.js 14.x or later
- npm or yarn
- A Shopify store with Admin API access

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/genthegreat/shop-by-specs.git
   cd shop-by-specs
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your Shopify credentials:
   ```
   SHOPIFY_STORE=your-store-name
   SHOPIFY_ACCESS_TOKEN=your-access-token
   PORT=3000 # optional, defaults to 3000
   ```

## Usage

### Start the server:

```
node index.js
```

### Process all existing products:

Send a GET request to `/process-existing-products` to start processing all existing products in your store:

```
curl http://localhost:3000/process-existing-products
```

### Set up webhook for new products:

In your Shopify admin:
1. Go to Settings > Notifications
2. Scroll down to "Webhooks"
3. Create a new webhook:
   - Event: Product creation
   - Format: JSON
   - URL: https://your-server-url.com/webhooks/products/create

## How It Works

1. The app extracts five attributes from each product:
   - Condition (from tags with format "condition:value")
   - Vendor (from product vendor field)
   - Product Type (from product type field)
   - Size (from variant options)
   - Fuel Type (from tags with format "fuel_type:value")

2. It generates all possible combinations of these attributes (2^5 - 1 = 31 combinations)

3. For each combination, it:
   - Creates a title in the format "Shop by attribute1: value1, attribute2: value2, ..."
   - Creates appropriate rules for the Shopify Smart Collection
   - Checks if a similar collection already exists
   - Creates the collection if it doesn't exist

## Data Structure

### Product Attributes

The app extracts product attributes as follows:

- `condition`: From custom metafield definitions where the name "condition"
- `vendor`: From the product's vendor field
- `product_type`: From the product's product_type field
- `size`: From custom metafield definitions where the name is "Size"
- `fuel_type`: From custom metafield definitions where the name "fuel_type"

### Smart Collection Rules

Smart collections are created with rules based on these attributes:

- Vendor: Matches the vendor field
- Product Type: Matches the product type field
- Condition/Fuel/Size Type: Matches specific custom metafield definitions

## Troubleshooting

- **API Rate Limits**: Shopify has API rate limits. If processing many products, the app may hit these limits.
- **Missing Collections**: Ensure products have the expected attributes in the correct format.
- **Webhook Errors**: Verify your server is publicly accessible and the webhook URL is correct.

## License

ISC 