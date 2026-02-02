#!/usr/bin/env node

/**
 * ACP Checkout Manager API E2E Tests
 * 
 * Tests all API endpoints with proper request/response validation
 * Does NOT test event propagation (SNS/SQS) - see events-e2e-test.js for that
 * 
 * Usage: 
 *   node test/api-e2e-test.js --url <BASE_URL>
 *   node test/api-e2e-test.js --url https://o8e259yswi.execute-api.us-east-1.amazonaws.com/dev
 * 
 * Environment variables:
 *   ACP_BASE_URL=https://api.example.com/dev
 */

const https = require('https');
const http = require('http');
const url = require('url');
const { performance } = require('perf_hooks');

// Configuration
const args = process.argv.slice(2);
const baseUrlIndex = args.indexOf('--url');

const BASE_URL = baseUrlIndex !== -1 ? args[baseUrlIndex + 1] : process.env.ACP_BASE_URL;

if (!BASE_URL) {
    console.error('❌ Error: BASE_URL is required');
    console.error('Usage: node test/api-e2e-test.js --url <BASE_URL>');
    console.error('Example: node test/api-e2e-test.js --url https://api.example.com/dev');
    process.exit(1);
}

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Colors
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

// Logging functions
const logTest = (message) => {
    console.log(`${colors.blue}🧪 ${message}${colors.reset}`);
    totalTests++;
};

const logSuccess = (message) => {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
    passedTests++;
};

const logFail = (message) => {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
    failedTests++;
};

const logInfo = (message) => {
    console.log(`${colors.yellow}ℹ️  ${message}${colors.reset}`);
};

// Generate unique IDs for idempotency
const generateId = () => Math.random().toString(36).substring(2, 15);

// HTTP request helper
const makeRequest = (method, endpoint, data = null, headers = {}) => {
    return new Promise((resolve, reject) => {
        const fullUrl = `${BASE_URL}${endpoint}`;
        const parsedUrl = url.parse(fullUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const defaultHeaders = {
            'Content-Type': 'application/json',
            'API-Version': '2026-01-16',
            'Idempotency-Key': generateId(),
            'Request-Id': generateId()
        };

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.path,
            method: method,
            headers: { ...defaultHeaders, ...headers }
        };

        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        const startTime = performance.now();
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);

                let jsonBody;
                try {
                    jsonBody = JSON.parse(body);
                } catch (e) {
                    jsonBody = { raw: body };
                }

                resolve({
                    statusCode: res.statusCode,
                    body: jsonBody,
                    responseTime: responseTime
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
};

// Test runner
const runTest = async (testName, testFn) => {
    logTest(testName);
    try {
        await testFn();
    } catch (error) {
        logFail(`${testName} failed: ${error.message}`);
        throw error;
    }
};

// Test suite
const runAllTests = async () => {
    console.log(`${colors.blue}🚀 Starting ACP Checkout Manager API E2E Tests${colors.reset}`);
    console.log(`${colors.blue}📍 Base URL: ${BASE_URL}${colors.reset}`);
    console.log(`${colors.blue}🎯 Testing: API endpoints only (no event validation)${colors.reset}`);
    console.log('');

    let sessionId;
    let cancelSessionId;

    try {
        // Test 1: Create checkout session
        await runTest('Test 1: Create checkout session', async () => {
            const createData = {
                items: [
                    { id: 'test_item', quantity: 1 },
                    { id: 'another_item', quantity: 2 }
                ],
                buyer: {
                    first_name: 'John',
                    last_name: 'Doe',
                    email: 'john.doe@example.com'
                },
                fulfillment_details: {
                    name: 'John Doe',
                    address: {
                        name: 'John Doe',
                        line_one: '123 Main St',
                        city: 'San Francisco',
                        state: 'CA',
                        country: 'US',
                        postal_code: '94102'
                    }
                }
            };

            const response = await makeRequest('POST', '/checkout_sessions', createData);

            if (response.statusCode !== 201) {
                throw new Error(`Expected 201, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (!response.body.id) {
                throw new Error('Session created but no ID returned');
            }

            sessionId = response.body.id;
            logSuccess(`Session created with ID: ${sessionId} (${response.responseTime}ms)`);
        });

        // Test 2: Retrieve checkout session
        await runTest('Test 2: Retrieve checkout session', async () => {
            const response = await makeRequest('GET', `/checkout_sessions/${sessionId}`);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (response.body.id !== sessionId) {
                throw new Error('Retrieved session ID mismatch');
            }

            if (!response.body.line_items || response.body.line_items.length === 0) {
                throw new Error('Session missing line items');
            }

            logSuccess(`Session retrieved successfully with ${response.body.line_items.length} line items (${response.responseTime}ms)`);
        });

        // Test 3: Update checkout session with different fulfillment option
        await runTest('Test 3: Update fulfillment option', async () => {
            const updateData = {
                selected_fulfillment_options: [{
                    type: 'shipping',
                    shipping: {
                        option_id: 'ship_expedited',
                        item_ids: ['test_item', 'another_item']
                    }
                }]
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}`, updateData);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            const selected = response.body.selected_fulfillment_options;
            if (!selected || selected.length === 0 || selected[0].shipping?.option_id !== 'ship_expedited') {
                throw new Error('Fulfillment option not updated correctly');
            }

            logSuccess(`Fulfillment option updated to expedited shipping (${response.responseTime}ms)`);
        });

        // Test 4: Update checkout session with new buyer info
        await runTest('Test 4: Update buyer information', async () => {
            const updateData = {
                buyer: {
                    first_name: 'Jane',
                    last_name: 'Smith',
                    email: 'jane.smith@example.com',
                    phone_number: '+1234567890'
                }
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}`, updateData);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (!response.body.buyer || response.body.buyer.email !== 'jane.smith@example.com') {
                throw new Error('Buyer info not updated correctly');
            }

            logSuccess(`Buyer updated to Jane Smith (${response.responseTime}ms)`);
        });

        // Test 5: Update checkout session with additional items
        await runTest('Test 5: Update items in cart', async () => {
            const itemsData = {
                items: [
                    { id: 'test_item', quantity: 3 },
                    { id: 'another_item', quantity: 1 },
                    { id: 'third_item', quantity: 2 }
                ]
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}`, itemsData);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (!response.body.line_items || response.body.line_items.length !== 3) {
                throw new Error(`Expected 3 line items, got ${response.body.line_items?.length || 0}`);
            }

            logSuccess(`Cart updated with 3 items (${response.responseTime}ms)`);
        });

        // Test 6: Complete checkout session
        await runTest('Test 6: Complete checkout session', async () => {
            const completeData = {
                payment_data: {
                    provider: 'stripe',
                    token: 'tok_test_12345'
                }
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}/complete`, completeData);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (response.body.status !== 'completed') {
                throw new Error(`Expected status 'completed', got '${response.body.status}'`);
            }

            if (!response.body.order || !response.body.order.id) {
                throw new Error('Order not created or missing ID');
            }

            if (!response.body.order.checkout_session_id || response.body.order.checkout_session_id !== sessionId) {
                throw new Error('Order checkout_session_id mismatch');
            }

            if (!response.body.order.permalink_url) {
                throw new Error('Order missing permalink_url');
            }

            logSuccess(`Session completed with order ID: ${response.body.order.id} (${response.responseTime}ms)`);
        });

        // Test 7: Create new session for cancellation test
        await runTest('Test 7: Create session for cancellation', async () => {
            const createData = {
                items: [{ id: 'cancel_test_item', quantity: 1 }],
                buyer: {
                    first_name: 'Test',
                    last_name: 'User',
                    email: 'test@example.com'
                }
            };

            const response = await makeRequest('POST', '/checkout_sessions', createData);

            if (response.statusCode !== 201) {
                throw new Error(`Expected 201, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            cancelSessionId = response.body.id;
            logSuccess(`Cancellation test session created: ${cancelSessionId} (${response.responseTime}ms)`);
        });

        // Test 8: Cancel checkout session
        await runTest('Test 8: Cancel checkout session', async () => {
            const response = await makeRequest('POST', `/checkout_sessions/${cancelSessionId}/cancel`);

            if (response.statusCode !== 200) {
                throw new Error(`Expected 200, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (response.body.status !== 'canceled') {
                throw new Error(`Expected status 'canceled', got '${response.body.status}'`);
            }

            logSuccess(`Session canceled successfully (${response.responseTime}ms)`);
        });

        // Test 9: Try to retrieve non-existent session (404 test)
        await runTest('Test 9: 404 handling for non-existent session', async () => {
            const response = await makeRequest('GET', '/checkout_sessions/cs_nonexistent_123');

            if (response.statusCode !== 404) {
                throw new Error(`Expected 404, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            if (!response.body.error || response.body.error.code !== 'resource_not_found') {
                throw new Error('Expected proper error structure for 404');
            }

            logSuccess(`404 error handled correctly for non-existent session (${response.responseTime}ms)`);
        });

        // Test 10: Try to complete already completed session (400 test)
        await runTest('Test 10: 400 handling for already completed session', async () => {
            const completeData = {
                payment_data: {
                    provider: 'stripe',
                    token: 'tok_test_12345'
                }
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}/complete`, completeData);

            if (response.statusCode !== 400) {
                throw new Error(`Expected 400, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
            }

            logSuccess(`400 error handled correctly for completed session (${response.responseTime}ms)`);
        });

    } catch (error) {
        console.error(`\n${colors.red}Test failed: ${error.message}${colors.reset}`);
    }

    // Results summary
    console.log(`\n${colors.blue}📊 API E2E Test Results Summary${colors.reset}`);
    console.log(`${colors.green}✅ Passed: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${failedTests}${colors.reset}`);
    console.log(`${colors.blue}📈 Total:  ${totalTests}${colors.reset}`);

    if (failedTests === 0) {
        console.log(`${colors.green}🎉 All API tests passed!${colors.reset}`);
        process.exit(0);
    } else {
        console.log(`${colors.red}💥 Some API tests failed!${colors.reset}`);
        process.exit(1);
    }
};

// Run the tests
runAllTests().catch((error) => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});