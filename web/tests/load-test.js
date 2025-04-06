require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Your API URL
const API_URL = process.env.API_URL || 'https://zuma-dev.princekwesi.website';

// Collection handles to test with
// You can add more from your actual store
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

// Test a single related collections request
async function testRelatedCollections(handle) {
  const url = `${API_URL}/related-collections/${handle}`;
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://prince-kwesi-dev.myshopify.com'
      }
    });
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      handle,
      status: response.status,
      duration,
      dataSize: JSON.stringify(response.data).length,
      categoriesCount: response.data.byCategory?.length || 0,
      manufacturersCount: response.data.byManufacturer?.length || 0,
      sizeCount: response.data.bySizeItem?.length || 0
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return { 
      success: false, 
      handle,
      duration,
      status: error.response?.status, 
      error: error.response?.data || error.message 
    };
  }
}

// Run a concurrent load test
async function runConcurrentLoadTest(concurrency = 5, totalRequests = 100) {
  console.log(`Starting load test: ${totalRequests} total requests with concurrency of ${concurrency}`);
  
  let completedRequests = 0;
  let successCount = 0;
  let failCount = 0;
  let totalDuration = 0;
  const results = [];
  const startTime = Date.now();
  
  // Function to handle a single worker
  async function worker(workerId) {
    while (completedRequests < totalRequests) {
      // Get next request index
      const requestIndex = completedRequests++;
      if (requestIndex >= totalRequests) break;
      
      // Select a random collection handle
      const handle = COLLECTION_HANDLES[Math.floor(Math.random() * COLLECTION_HANDLES.length)];
      
      // Make the request
      const result = await testRelatedCollections(handle);
      results.push(result);
      
      if (result.success) {
        successCount++;
        totalDuration += result.duration;
        console.log(`Worker ${workerId} - Request ${requestIndex+1}/${totalRequests}: Success (${result.status}) - ${result.duration}ms - ${handle}`);
      } else {
        failCount++;
        console.log(`Worker ${workerId} - Request ${requestIndex+1}/${totalRequests}: Failed (${result.status}) - ${handle}`);
      }
    }
  }
  
  // Create worker promises
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker(i + 1));
  }
  
  // Wait for all workers to complete
  await Promise.all(workers);
  
  // Calculate statistics
  const duration = (Date.now() - startTime) / 1000;
  const avgResponseTime = totalDuration / successCount;
  
  console.log(`\nLoad test completed in ${duration.toFixed(2)} seconds`);
  console.log(`Success: ${successCount} (${(successCount/totalRequests*100).toFixed(2)}%)`);
  console.log(`Failed: ${failCount} (${(failCount/totalRequests*100).toFixed(2)}%)`);
  console.log(`Rate: ${(totalRequests/duration).toFixed(2)} requests/second`);
  console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
  
  // Calculate percentiles
  if (results.length > 0) {
    const successDurations = results
      .filter(r => r.success)
      .map(r => r.duration)
      .sort((a, b) => a - b);
    
    if (successDurations.length > 0) {
      const p50 = successDurations[Math.floor(successDurations.length * 0.5)];
      const p90 = successDurations[Math.floor(successDurations.length * 0.9)];
      const p95 = successDurations[Math.floor(successDurations.length * 0.95)];
      const p99 = successDurations[Math.floor(successDurations.length * 0.99)] || p95;
      
      console.log(`\nResponse time percentiles:`);
      console.log(`50th percentile (median): ${p50}ms`);
      console.log(`90th percentile: ${p90}ms`);
      console.log(`95th percentile: ${p95}ms`);
      console.log(`99th percentile: ${p99}ms`);
      console.log(`Min: ${successDurations[0]}ms`);
      console.log(`Max: ${successDurations[successDurations.length - 1]}ms`);
    }
  }
  
  // Save detailed results to file
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  // write to the data folder
  fs.writeFileSync(
    `../data/load-test-results-${timestamp}.json`,  // change to the data folder
    JSON.stringify({ 
      summary: {
        concurrency,
        totalRequests,
        successCount,
        failCount,
        totalDuration: duration,
        avgResponseTime,
        requestsPerSecond: totalRequests/duration
      },
      detailedResults: results 
    }, null, 2)
  );
  
  console.log(`\nDetailed results saved to load-test-results-${timestamp}.json`);
}

// Run the test with command line arguments
// node related-collections-load-test.js [concurrency] [totalRequests]
const concurrency = parseInt(process.argv[2]) || 5;
const totalRequests = parseInt(process.argv[3]) || 100;

runConcurrentLoadTest(concurrency, totalRequests).catch(console.error); 