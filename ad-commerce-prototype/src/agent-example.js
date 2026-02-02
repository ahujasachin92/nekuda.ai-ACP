/**
 * Ad-Commerce AGENT Example
 * 
 * This transforms the orchestrator from a fixed-logic service
 * into an autonomous AI agent that can:
 * - Understand goals in natural language
 * - Plan campaign strategies
 * - Make decisions based on performance data
 * - Communicate with other agents via A2A
 */

import express from 'express';
import { spawn } from 'child_process';
import { config } from './config.js';
import { adcpClient } from './services/adcp-client.js';
import { acpClient } from './services/acp-client.js';
import { attributionService } from './services/attribution.js';

const app = express();
app.use(express.json());

// ============================================================================
// LLM PROVIDER CONFIGURATION
// ============================================================================
// Options: 'claude-cli' (default, uses Claude Max), 'claude', 'openai', 'gemini', 'ollama'
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'claude-cli';

const LLM_CONFIG = {
  'claude-cli': {
    // Uses the `claude` CLI which authenticates via Claude Max subscription
    model: 'claude-cli'
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    apiKey: process.env.GEMINI_API_KEY
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.1'
  }
};

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================
const agent = {
  name: 'ad-commerce-agent',
  description: 'Autonomous agent for managing ad campaigns and commerce attribution',
  version: '1.0.0',
  
  // Tools the agent can use
  tools: [
    {
      name: 'create_campaign',
      description: 'Create a new advertising campaign with specified budget and products',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Campaign name' },
          budget: { type: 'number', description: 'Budget in cents' },
          products: { type: 'array', items: { type: 'string' }, description: 'Product SKUs' },
          targeting: { type: 'object', description: 'Audience targeting criteria' }
        },
        required: ['name', 'budget', 'products']
      }
    },
    {
      name: 'get_campaign_performance',
      description: 'Get ROAS and performance metrics for a campaign',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' }
        },
        required: ['campaignId']
      }
    },
    {
      name: 'adjust_campaign_budget',
      description: 'Increase or decrease campaign budget based on performance',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          newBudget: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['campaignId', 'newBudget']
      }
    },
    {
      name: 'pause_campaign',
      description: 'Pause an underperforming campaign',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['campaignId']
      }
    },
    {
      name: 'get_product_catalog',
      description: 'Get available products from ACP to promote',
      parameters: { type: 'object', properties: {} }
    }
  ]
};

// ============================================================================
// LLM CLIENT (The "brain" of the agent)
// ============================================================================

/**
 * Call LLM with tools support
 * Works with Claude CLI, Claude API, OpenAI, Gemini, or Ollama (local)
 */
async function callLLM(systemPrompt, messages, tools) {
  const provider = LLM_PROVIDER;
  const llmConfig = LLM_CONFIG[provider];

  console.log(`[LLM] Using provider: ${provider}, model: ${llmConfig.model}`);

  if (provider === 'claude-cli') {
    return await callClaudeCLI(systemPrompt, messages, tools);
  } else if (provider === 'claude') {
    return await callClaude(systemPrompt, messages, tools, llmConfig);
  } else if (provider === 'openai') {
    return await callOpenAI(systemPrompt, messages, tools, llmConfig);
  } else if (provider === 'gemini') {
    return await callGemini(systemPrompt, messages, tools, llmConfig);
  } else if (provider === 'ollama') {
    return await callOllama(systemPrompt, messages, tools, llmConfig);
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Claude CLI - Uses your Claude Max subscription via the `claude` command
 * No API key required - authenticates through your existing Claude login
 */
async function callClaudeCLI(systemPrompt, messages, tools) {
  // Build a prompt that includes tool definitions and asks for structured output
  const toolDescriptions = tools.map(t => {
    const params = t.input_schema?.properties || {};
    const required = t.input_schema?.required || [];
    const paramDesc = Object.entries(params)
      .map(([name, schema]) => `    - ${name}${required.includes(name) ? ' (required)' : ''}: ${schema.description || schema.type}`)
      .join('\n');
    return `${t.name}: ${t.description}\n  Parameters:\n${paramDesc || '    (none)'}`;
  }).join('\n\n');

  // Convert conversation history to text
  const conversationText = messages.map(m => {
    if (m.role === 'user') {
      if (Array.isArray(m.content)) {
        const toolResult = m.content.find(c => c.type === 'tool_result');
        if (toolResult) {
          return `[Tool Result]: ${toolResult.content}`;
        }
      }
      return `User: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
    } else if (m.role === 'assistant') {
      if (Array.isArray(m.content)) {
        const text = m.content.find(c => c.type === 'text');
        const toolUse = m.content.find(c => c.type === 'tool_use');
        let result = '';
        if (text) result += text.text;
        if (toolUse) result += `\n[Called tool: ${toolUse.name} with ${JSON.stringify(toolUse.input)}]`;
        return `Assistant: ${result}`;
      }
      return `Assistant: ${m.content}`;
    }
    return '';
  }).join('\n\n');

  const fullPrompt = `${systemPrompt}

AVAILABLE TOOLS:
${toolDescriptions}

IMPORTANT: When you want to use a tool, respond with ONLY a JSON block in this exact format:
\`\`\`tool_call
{"tool": "tool_name", "input": {"param1": "value1"}}
\`\`\`

When you're done and want to give a final response (no more tool calls needed), just respond normally with text.

CONVERSATION:
${conversationText}

Now respond. If you need to use a tool, output the tool_call JSON block. Otherwise, provide your final answer.`;

  return new Promise((resolve, reject) => {
    console.log('[Claude CLI] Spawning claude process...');

    const claude = spawn('claude', ['-p', fullPrompt, '--no-tools'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code !== 0 && !stdout) {
        console.error('[Claude CLI] Error:', stderr);
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      console.log('[Claude CLI] Response received, length:', stdout.length);

      // Check if response contains a tool call
      const toolCallMatch = stdout.match(/```tool_call\s*\n?([\s\S]*?)\n?```/);

      if (toolCallMatch) {
        try {
          const toolCall = JSON.parse(toolCallMatch[1].trim());
          console.log('[Claude CLI] Tool call detected:', toolCall.tool);

          resolve({
            stop_reason: 'tool_use',
            content: [{
              type: 'tool_use',
              id: `cli_tool_${Date.now()}`,
              name: toolCall.tool,
              input: toolCall.input || {}
            }]
          });
        } catch (parseError) {
          console.error('[Claude CLI] Failed to parse tool call:', parseError);
          // Treat as regular text response
          resolve({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: stdout.trim() }]
          });
        }
      } else {
        // Regular text response - agent is done
        resolve({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: stdout.trim() }]
        });
      }
    });

    claude.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}. Make sure 'claude' is installed and in PATH.`));
    });
  });
}

/**
 * Anthropic Claude - Best for tool use
 */
async function callClaude(systemPrompt, messages, tools, llmConfig) {
  if (!llmConfig.apiKey) {
    throw new Error('CLAUDE_API_KEY environment variable required');
  }

  const claudeTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));

  // Convert messages to Claude format
  const claudeMessages = messages.map(m => {
    if (m.role === 'user' && Array.isArray(m.content)) {
      // Tool result format
      return {
        role: 'user',
        content: m.content.map(c => {
          if (c.type === 'tool_result') {
            return {
              type: 'tool_result',
              tool_use_id: c.tool_use_id,
              content: c.content
            };
          }
          return c;
        })
      };
    }
    return {
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content
    };
  });

  const response = await fetch(`${llmConfig.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llmConfig.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: llmConfig.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: claudeTools,
      messages: claudeMessages
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }

  // Check if model wants to use a tool
  const toolUse = data.content?.find(c => c.type === 'tool_use');
  if (toolUse) {
    return {
      stop_reason: 'tool_use',
      content: data.content
    };
  }

  return {
    stop_reason: 'end_turn',
    content: data.content || [{ type: 'text', text: 'No response' }]
  };
}

/**
 * OpenAI GPT-4 - Great for tool use
 */
async function callOpenAI(systemPrompt, messages, tools, llmConfig) {
  if (!llmConfig.apiKey) {
    throw new Error('OPENAI_API_KEY environment variable required');
  }

  const openaiTools = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));

  // Convert messages to OpenAI format
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      if (m.role === 'user' && Array.isArray(m.content)) {
        // Tool result - OpenAI uses 'tool' role
        const toolResult = m.content.find(c => c.type === 'tool_result');
        if (toolResult) {
          return {
            role: 'tool',
            tool_call_id: toolResult.tool_use_id,
            content: toolResult.content
          };
        }
      }
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        // Assistant with tool calls
        const toolUse = m.content.find(c => c.type === 'tool_use');
        const textContent = m.content.find(c => c.type === 'text');
        if (toolUse) {
          return {
            role: 'assistant',
            content: textContent?.text || null,
            tool_calls: [{
              id: toolUse.id,
              type: 'function',
              function: {
                name: toolUse.name,
                arguments: JSON.stringify(toolUse.input)
              }
            }]
          };
        }
      }
      return {
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      };
    })
  ];

  const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: 'auto'
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`OpenAI API error: ${data.error.message}`);
  }

  const choice = data.choices?.[0];

  if (choice?.message?.tool_calls?.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    return {
      stop_reason: 'tool_use',
      content: [
        ...(choice.message.content ? [{ type: 'text', text: choice.message.content }] : []),
        {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        }
      ]
    };
  }

  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: choice?.message?.content || 'No response' }]
  };
}

/**
 * Ollama - Free, runs locally
 * Install: brew install ollama && ollama pull llama3.1
 */
async function callOllama(systemPrompt, messages, tools, config) {
  // Convert tools to Ollama format
  const ollamaTools = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));

  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        }))
      ],
      tools: ollamaTools,
      stream: false
    })
  });

  const data = await response.json();
  
  // Check if model wants to use a tool
  if (data.message?.tool_calls?.length > 0) {
    const toolCall = data.message.tool_calls[0];
    return {
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: `tool_${Date.now()}`,
        name: toolCall.function.name,
        input: typeof toolCall.function.arguments === 'string' 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments
      }]
    };
  }

  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: data.message?.content || 'No response' }]
  };
}

/**
 * Google Gemini - Free tier (15 requests/minute)
 * Get API key: https://aistudio.google.com/app/apikey
 */
async function callGemini(systemPrompt, messages, tools, config) {
  if (!config.apiKey) {
    throw new Error('GEMINI_API_KEY environment variable required');
  }

  // Convert to Gemini format
  const geminiTools = [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }))
  }];

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  const response = await fetch(
    `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: geminiTools,
        toolConfig: {
          functionCallingConfig: {
            mode: 'AUTO'
          }
        }
      })
    }
  );

  const data = await response.json();
  
  // Debug logging
  console.log('[Gemini] Response:', JSON.stringify(data, null, 2));
  
  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message}`);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  
  // Check for function call in any part
  const functionCallPart = parts.find(p => p.functionCall);
  if (functionCallPart) {
    return {
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: `tool_${Date.now()}`,
        name: functionCallPart.functionCall.name,
        input: functionCallPart.functionCall.args || {}
      }]
    };
  }

  // Get text response
  const textPart = parts.find(p => p.text);
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: textPart?.text || 'No response from model' }]
  };
}


// ============================================================================
// TOOL EXECUTION (Agent's capabilities)
// ============================================================================
async function executeTool(toolName, params) {
  console.log(`[AGENT] Executing tool: ${toolName}`, params);
  
  switch (toolName) {
    case 'create_campaign':
      const mediaBuy = await adcpClient.createMediaBuy({
        productIds: ['display_standard'],
        totalBudget: params.budget / 100,
        brandName: params.name,
        targeting: params.targeting || {}
      });
      
      const campaignId = `camp_${Date.now()}`;
      attributionService.setCampaignSpend(campaignId, params.budget);
      
      return {
        campaignId,
        mediaBuyId: mediaBuy.media_buy_id,
        status: 'created',
        budget: params.budget,
        products: params.products
      };

    case 'get_campaign_performance':
      return attributionService.calculateROAS(params.campaignId) || {
        error: 'Campaign not found'
      };

    case 'adjust_campaign_budget':
      attributionService.setCampaignSpend(params.campaignId, params.newBudget);
      return {
        campaignId: params.campaignId,
        newBudget: params.newBudget,
        reason: params.reason,
        status: 'budget_adjusted'
      };

    case 'pause_campaign':
      // In real implementation, would call AdCP to pause
      return {
        campaignId: params.campaignId,
        status: 'paused',
        reason: params.reason
      };

    case 'get_product_catalog':
      // Would call ACP for real products
      return {
        products: [
          { sku: 'SKU-TSHIRT-BLK-M', name: 'Black T-Shirt', price: 2999 },
          { sku: 'SKU-HOODIE-GRY-L', name: 'Grey Hoodie', price: 5999 },
          { sku: 'SKU-CAP-WHT', name: 'White Cap', price: 1999 }
        ]
      };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================================
// AGENT REASONING LOOP (The core agent logic)
// ============================================================================
async function runAgent(userGoal, maxIterations = 5) {
  console.log('\n' + '='.repeat(60));
  console.log('AGENT ACTIVATED');
  console.log('='.repeat(60));
  console.log('Goal:', userGoal);
  
  const conversationHistory = [];
  const systemPrompt = `You are an autonomous advertising agent. Your job is to help users create and optimize ad campaigns.

You have access to these tools:
${agent.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When given a goal:
1. Break it down into steps
2. Use tools to accomplish each step
3. Analyze results and adjust strategy
4. Report back with results and recommendations

Always think step-by-step and explain your reasoning.`;

  conversationHistory.push({
    role: 'user',
    content: userGoal
  });

  let iteration = 0;
  const results = [];

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n[AGENT] Iteration ${iteration}/${maxIterations}`);

    // Ask LLM what to do next
    const response = await callLLM(
      systemPrompt,
      conversationHistory,
      agent.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }))
    );

    console.log('[AGENT] LLM response:', response.stop_reason);

    // Check if agent wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(c => c.type === 'tool_use');
      
      if (toolUse) {
        console.log(`[AGENT] Using tool: ${toolUse.name}`);
        
        // Execute the tool
        const toolResult = await executeTool(toolUse.name, toolUse.input);
        results.push({ tool: toolUse.name, input: toolUse.input, result: toolResult });
        
        // Add to conversation for next iteration
        conversationHistory.push({
          role: 'assistant',
          content: response.content
        });
        conversationHistory.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult)
          }]
        });
      }
    } else if (response.stop_reason === 'end_turn') {
      // Agent is done
      const textResponse = response.content.find(c => c.type === 'text');
      console.log('\n[AGENT] Task complete!');
      
      return {
        success: true,
        iterations: iteration,
        actions: results,
        summary: textResponse?.text || 'Task completed'
      };
    }
  }

  return {
    success: false,
    iterations: iteration,
    actions: results,
    summary: 'Max iterations reached'
  };
}

// ============================================================================
// A2A AGENT CARD (For agent-to-agent discovery)
// ============================================================================
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: agent.name,
    description: agent.description,
    version: agent.version,
    url: `http://localhost:${config.orchestrator.port}`,
    capabilities: {
      streaming: false,
      pushNotifications: false
    },
    skills: [
      {
        id: 'campaign-management',
        name: 'Campaign Management',
        description: 'Create and manage advertising campaigns',
        inputModes: ['text'],
        outputModes: ['text', 'data']
      },
      {
        id: 'performance-optimization',
        name: 'Performance Optimization',
        description: 'Analyze and optimize campaign ROAS',
        inputModes: ['text'],
        outputModes: ['text', 'data']
      }
    ],
    authentication: {
      schemes: ['bearer']
    }
  });
});

// ============================================================================
// A2A TASK ENDPOINT (Receive tasks from other agents)
// ============================================================================
app.post('/a2a/tasks', async (req, res) => {
  const { task, context } = req.body;
  
  console.log('\n[A2A] Received task from another agent');
  console.log('Task:', task);
  
  try {
    const result = await runAgent(task);
    res.json({
      status: 'completed',
      result
    });
  } catch (error) {
    res.status(500).json({
      status: 'failed',
      error: error.message
    });
  }
});

// ============================================================================
// NATURAL LANGUAGE ENDPOINT (Human interaction)
// ============================================================================
app.post('/agent/chat', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  try {
    const result = await runAgent(message);
    res.json(result);
  } catch (error) {
    console.error('Agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// AUTONOMOUS OPTIMIZATION (Runs periodically)
// ============================================================================
async function autonomousOptimization() {
  console.log('\n[AGENT] Running autonomous optimization...');
  
  const goal = `
    Review all active campaigns and:
    1. Get performance data for each campaign
    2. For campaigns with ROAS > 2.0, increase budget by 20%
    3. For campaigns with ROAS < 0.5 after 1000+ impressions, pause them
    4. Provide a summary of actions taken
  `;
  
  const result = await runAgent(goal);
  console.log('[AGENT] Optimization complete:', result.summary);
  
  return result;
}

// Run optimization every hour (in production)
// setInterval(autonomousOptimization, 60 * 60 * 1000);

// ============================================================================
// EXAMPLE USAGE ENDPOINTS
// ============================================================================

// Example: Natural language campaign creation
app.get('/agent/demo', async (req, res) => {
  const demoGoal = `
    I want to promote our black t-shirt with a $100 budget.
    Target young adults interested in fashion.
    Create the campaign and tell me the expected performance.
  `;
  
  try {
    const result = await runAgent(demoGoal);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// START AGENT SERVER
// ============================================================================
const PORT = config.orchestrator.port;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('AD-COMMERCE AGENT (AI-Powered)');
  console.log('='.repeat(60));
  console.log(`Agent:       http://localhost:${PORT}`);
  console.log(`Agent Card:  http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`LLM:         ${LLM_PROVIDER} (${LLM_CONFIG[LLM_PROVIDER]?.model || 'default'})`);
  console.log('='.repeat(60));
  console.log('\nAgent Endpoints:');
  console.log('  POST /agent/chat     - Natural language interaction');
  console.log('  GET  /agent/demo     - Demo autonomous campaign creation');
  console.log('  POST /a2a/tasks      - Receive tasks from other agents');
  console.log('='.repeat(60));
  console.log('\nLLM Provider Options:');
  console.log('  1. Claude CLI (default): Uses Claude Max subscription (no API key!)');
  console.log('  2. Claude API:           LLM_PROVIDER=claude (uses CLAUDE_API_KEY)');
  console.log('  3. OpenAI:               LLM_PROVIDER=openai (uses OPENAI_API_KEY)');
  console.log('  4. Gemini:               LLM_PROVIDER=gemini (uses GEMINI_API_KEY)');
  console.log('  5. Ollama (free):        LLM_PROVIDER=ollama (local, no API key)');
  console.log('='.repeat(60));
  console.log('\nExample usage:');
  console.log('  curl -X POST http://localhost:3001/agent/chat \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"message": "Create a $50 campaign for our hoodie"}\'');
  console.log('='.repeat(60) + '\n');
});

export { runAgent, autonomousOptimization };
