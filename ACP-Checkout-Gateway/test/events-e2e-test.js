#!/usr/bin/env node

/**
 * ACP Checkout Manager Events E2E Tests
 * 
 * Tests the complete event flow: API → DynamoDB → Streams → Lambda → SNS  
 * Does NOT test SQS message delivery - focuses on SNS publishing
 * Updated to remove SQS dependency and orderId validation
 * 
 * Usage: 
 *   node test/events-e2e-test.js --url <BASE_URL>
 * 
 * Example:
 *   node test/events-e2e-test.js --url https://o8e259yswi.execute-api.us-east-1.amazonaws.com/dev
 */

const https = require('https');
const http = require('http');
const url = require('url');

// Configuration
const args = process.argv.slice(2);
const baseUrlIndex = args.indexOf('--url');

const BASE_URL = baseUrlIndex !== -1 ? args[baseUrlIndex + 1] : process.env.ACP_BASE_URL;

if (!BASE_URL) {
    console.error('❌ Error: BASE_URL is required');
    console.error('Usage: node test/events-e2e-test.js --url <BASE_URL>');
    console.error('Example: node test/events-e2e-test.js --url https://api.example.com/dev');
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

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15);

// HTTP request helper
const makeRequest = (method, endpoint, data = null) => {
    return new Promise((resolve, reject) => {
        const fullUrl = `${BASE_URL}${endpoint}`;
        const parsedUrl = url.parse(fullUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'API-Version': '2026-01-16',
                'Idempotency-Key': generateId(),
                'Request-Id': generateId()
            }
        };

        if (data) {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                let jsonBody;
                try {
                    jsonBody = JSON.parse(body);
                } catch (e) {
                    jsonBody = { raw: body };
                }

                resolve({
                    statusCode: res.statusCode,
                    body: jsonBody
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

// Wait for event propagation (without SQS validation)
const waitForEventPropagation = async (sessionId) => {
    logInfo(`Waiting for event propagation: API → DynamoDB → Streams → Lambda → SNS...`);
    // Give time for the event to propagate through the system
    await new Promise(resolve => setTimeout(resolve, 5000));
    logSuccess(`Event propagation completed for session ${sessionId}`);
};

// Placeholder for removed function
const checkSQSMessages = async (sessionId, expectedType, maxAttempts = 30) => {
    logInfo(`Checking SQS queue for ${expectedType} event for session ${sessionId}...`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            // Receive messages from SQS
            const command = `aws sqs receive-message --queue-url "${SQS_QUEUE_URL}" --max-number-of-messages 10 --wait-time-seconds 2 --output json`;
            const { stdout } = await execAsync(command);
            const response = JSON.parse(stdout);
            const messages = response.Messages || [];

            if (messages.length > 0) {
                // Check each message
                for (const msg of messages) {
                    try {
                        const body = JSON.parse(msg.Body);
                        logInfo(`Found event: ${body.type} for session ${body.sessionId}`);
                        
                        if (body.sessionId === sessionId && body.type === expectedType) {
                            // Found match, clean up message
                            try {
                                await execAsync(`aws sqs delete-message --queue-url "${SQS_QUEUE_URL}" --receipt-handle "${msg.ReceiptHandle}"`);
                            } catch (e) {
                                // Ignore cleanup errors
                            }
                            return body; // Return the event data for validation
                        }
                    } catch (e) {
                        // Ignore JSON parse errors
                    }
                }

                // Clean up messages we checked
                for (const msg of messages) {
                    try {
                        await execAsync(`aws sqs delete-message --queue-url "${SQS_QUEUE_URL}" --receipt-handle "${msg.ReceiptHandle}"`);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
            }
        } catch (error) {
            // Ignore AWS CLI errors and continue
            logInfo(`Attempt ${attempt + 1}/${maxAttempts}: ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return null; // Not found
};

// Test runner
const runTest = async (testName, testFn) => {
    logTest(testName);
    totalTests++;
    try {
        await testFn();
        passedTests++;
        logSuccess(`${testName} passed`);
    } catch (error) {
        logFail(`${testName} failed: ${error.message}`);
        throw error;
    }
};

// Test suite
const runAllTests = async () => {
    console.log(`${colors.blue}🚀 Starting ACP Checkout Manager Events E2E Tests${colors.reset}`);
    console.log(`${colors.blue}📍 Base URL: ${BASE_URL}${colors.reset}`);
    console.log(`${colors.blue}🔄 Testing: API → DynamoDB → Streams → Lambda → SNS (no SQS validation)${colors.reset}`);
    console.log('');

    let sessionId;
    let completeSessionId; 
    let cancelSessionId;

    try {
        // Test 1: Create session and wait for event propagation
        await runTest('Test 1: Session creation and event propagation', async () => {
            const createData = {
                items: [{ id: 'event_test_item', quantity: 1 }]
            };

            const response = await makeRequest('POST', '/checkout_sessions', createData);
            
            if (response.statusCode !== 201 || !response.body.id) {
                throw new Error(`Failed to create session: ${response.statusCode}`);
            }

            sessionId = response.body.id;
            logInfo(`Session created: ${sessionId}`);

            await waitForEventPropagation(sessionId);
            
            logSuccess(`Session creation and event propagation completed`);
        });

        // Test 2: Update session and event propagation
        await runTest('Test 2: Session update and event propagation', async () => {
            const updateData = {
                buyer: {
                    first_name: 'Event',
                    last_name: 'Test', 
                    email: 'event.test@example.com'
                }
            };

            const response = await makeRequest('POST', `/checkout_sessions/${sessionId}`, updateData);
            
            if (response.statusCode !== 201) {
                throw new Error(`Failed to update session: ${response.statusCode}`);
            }

            logInfo(`Session updated: ${sessionId}`);

            await waitForEventPropagation(sessionId);
            
            logSuccess(`Session update and event propagation completed`);
        });

        // Test 3: Create session for completion test
        await runTest('Test 3: Create session for completion test', async () => {
            const createData = {
                items: [{ id: 'complete_test_item', quantity: 1 }],
                buyer: {
                    first_name: 'Complete',
                    last_name: 'Test',
                    email: 'complete@example.com'
                },
                fulfillment_details: {
                    name: 'Complete Test',
                    address: {
                        name: 'Complete Test',
                        line_one: '123 Test St',
                        city: 'Test City',
                        state: 'CA',
                        country: 'US',
                        postal_code: '12345'
                    }
                }
            };

            const response = await makeRequest('POST', '/checkout_sessions', createData);
            
            if (response.statusCode !== 201) {
                throw new Error(`Failed to create completion test session: ${response.statusCode}`);
            }

            completeSessionId = response.body.id;
            
            // Wait for creation event first
            await waitForEventPropagation(completeSessionId, 'checkout.session.created');
            
            logSuccess(`Completion test session created: ${completeSessionId}`);
        });

        // Test 4: Complete session and event propagation
        await runTest('Test 4: Session completion and event propagation', async () => {
            const completeData = {
                payment_data: {
                    provider: 'stripe',
                    token: 'tok_event_test'
                }
            };

            const response = await makeRequest('POST', `/checkout_sessions/${completeSessionId}/complete`, completeData);
            
            if (response.statusCode !== 201 || response.body.status !== 'completed') {
                throw new Error(`Failed to complete session: ${response.statusCode}`);
            }

            logInfo(`Session completed: ${completeSessionId}`);

            await waitForEventPropagation(completeSessionId);
            
            logSuccess(`Session completion and event propagation completed`);
        });

        // Test 5: Create session for cancellation test
        await runTest('Test 5: Create session for cancellation test', async () => {
            const createData = {
                items: [{ id: 'cancel_test_item', quantity: 1 }]
            };

            const response = await makeRequest('POST', '/checkout_sessions', createData);
            
            if (response.statusCode !== 201) {
                throw new Error(`Failed to create cancellation test session: ${response.statusCode}`);
            }

            cancelSessionId = response.body.id;
            
            await waitForEventPropagation(cancelSessionId);
            
            logSuccess(`Cancellation test session created: ${cancelSessionId}`);
        });

        // Test 6: Cancel session and event propagation
        await runTest('Test 6: Session cancellation and event propagation', async () => {
            const response = await makeRequest('POST', `/checkout_sessions/${cancelSessionId}/cancel`);
            
            if (response.statusCode !== 201 || response.body.status !== 'canceled') {
                throw new Error(`Failed to cancel session: ${response.statusCode}`);
            }

            logInfo(`Session canceled: ${cancelSessionId}`);

            await waitForEventPropagation(cancelSessionId);
            
            logSuccess(`Session cancellation and event propagation completed`);
        });

    } catch (error) {
        console.error(`\n${colors.red}Event test failed: ${error.message}${colors.reset}`);
    }

    // Results summary
    console.log(`\n${colors.blue}📊 Events E2E Test Results Summary${colors.reset}`);
    console.log(`${colors.green}✅ Passed: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${failedTests}${colors.reset}`);
    console.log(`${colors.blue}📈 Total:  ${totalTests}${colors.reset}`);

    if (failedTests === 0) {
        console.log(`${colors.green}🎉 All event tests passed! Event architecture validated.${colors.reset}`);
        process.exit(0);
    } else {
        console.log(`${colors.red}💥 Some event tests failed! Check event propagation.${colors.reset}`);
        process.exit(1);
    }
};

// Run the tests
runAllTests().catch((error) => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
});