import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const collectionDataSize = new Trend('collection_data_size');
const categoriesCount = new Trend('categories_count');
const manufacturersCount = new Trend('manufacturers_count');
const sizeItemCount = new Trend('size_item_count');
const failedRequests = new Counter('failed_requests');
const successRate = new Rate('success_rate');

// Configure the load test options
export const options = {
  cloud: {
    projectID: 3759493,
    name: 'Zuma Shopify API Test',
    tags: {
      env: 'test',
    },
  },
  // Load test scenarios
  scenarios: {
    // Constant load test
    constant_load: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '0s',
    },
    // Ramp-up test
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 10 },
        { duration: '10s', target: 15 },
        { duration: '20s', target: 0 },
      ],
      startTime: '30s',
    },
    // Stress test
    stress_test: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 70,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 10 },
        { duration: '10s', target: 15 },
        { duration: '10s', target: 0 },
      ],
      startTime: '90s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests can fail
    'success_rate': ['rate>0.99'],    // Success rate should be above 99%
  },
};

// Collection handles to test with
const COLLECTION_HANDLES = [
  'boom-lifts',
  'scissor-lifts',
  'genie-parts',
  'jlg-parts',
  'skyjack-parts',
  'haulotte-parts',
  'telehandler',
  'telehandler-attachments',
  'genie-boom-lifts',
  '12-ft-trailers',
  '30-46-diesel-boom-lifts',
  'new-genie-scissor-lifts',
  'new-jlg-scissor-lifts',
  'new-jlg-boom-lifts'  
];

// Your API URL - Update this with your actual API URL
const API_URL = __ENV.API_URL || 'https://zuma-dev.princekwesi.website';

export default function() {
  // Select a random collection handle
  const handle = randomItem(COLLECTION_HANDLES);
  
  // Set up request headers
  const params = {
    headers: {
      'Accept': 'application/json',
      'Origin': 'https://prince-kwesi-dev.myshopify.com'
    },
  };
  
  // Make the request
  const url = `${API_URL}/related-collections/${handle}`;
  const response = http.get(url, params);
  
  // Check if the request was successful
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response is JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
    'has byCategory': (r) => r.json('byCategory') !== undefined,
  });
  
  // Record success/failure
  successRate.add(success);
  
  if (!success) {
    failedRequests.add(1);
    console.log(`Failed request for ${handle}: ${response.status} ${response.body}`);
  } else {
    // Extract and record metrics from the response
    try {
      const data = response.json();
      
      // Record data size
      collectionDataSize.add(response.body.length);
      
      // Record category counts
      categoriesCount.add(data.byCategory?.length || 0);
      manufacturersCount.add(data.byManufacturer?.length || 0);
      sizeItemCount.add(data.bySizeItem?.length || 0);
      
      // Check data structure integrity
      if (!data.byCategory) {
        console.warn(`Missing byCategory in response for ${handle}`);
      }
      
      // Simulate user browsing behavior
      if (Math.random() < 0.3) {
        // 30% of the time, simulate a user clicking on a related collection
        if (data.byCategory && data.byCategory.length > 0) {
          const relatedHandle = data.byCategory[0].handle;
          const relatedResponse = http.get(`${API_URL}/related-collections/${relatedHandle}`, params);
          check(relatedResponse, {
            'related request status is 200': (r) => r.status === 200,
          });
          
          // Add a longer sleep after clicking through to a related collection
          sleep(Math.random() * 2 + 1);
        }
      }
    } catch (e) {
      console.error(`Error parsing response: ${e.message}`);
    }
  }
  
  // Sleep between requests to simulate real user behavior
  // Variable sleep times make the test more realistic
  sleep(Math.random() * 3 + 1); // Sleep between 1-4 seconds
}

// Helper to format a summary report
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: '→', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// Simple text summary formatter
function textSummary(data, options) {
  const { metrics, root_group } = data;
  const { http_req_duration, http_reqs, vus, http_req_failed } = metrics;
  
  return `
K6 Load Test Summary
===================
API URL: ${API_URL}

Test Configuration:
- VUs: ${vus.value.max} max
- Duration: ${data.state.testRunDurationMs / 1000}s

Performance Metrics:
- Requests: ${http_reqs.count} total
- Failed Requests: ${http_req_failed.passes} (${(http_req_failed.rate * 100).toFixed(2)}%)
- Avg Request Duration: ${http_req_duration.avg.toFixed(2)}ms
- P95 Request Duration: ${http_req_duration.values['p(95)'].toFixed(2)}ms
- Min/Max Request Duration: ${http_req_duration.min.toFixed(2)}ms / ${http_req_duration.max.toFixed(2)}ms
- Requests/sec: ${(http_reqs.count / (data.state.testRunDurationMs / 1000)).toFixed(2)}/s

Custom Metrics:
- Avg Categories: ${metrics.categories_count ? metrics.categories_count.avg.toFixed(2) : 'N/A'} 
- Avg Data Size: ${metrics.collection_data_size ? (metrics.collection_data_size.avg / 1024).toFixed(2) : 'N/A'} KB
- Success Rate: ${metrics.success_rate ? (metrics.success_rate.rate * 100).toFixed(2) : 'N/A'}%
`;
}
