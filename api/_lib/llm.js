const https = require('https');

// Default fallbacks in case Azure OpenAI is not configured or fails
const DEFAULT_ESCALATION = {
  priority: 'P3',
  next_action: 'Assess review and route to appropriate department.',
  department: 'Support',
  user_type: 'Inquirer'
};

/**
 * Sends a request to Azure OpenAI to analyze a review using built-in https.
 * @param {string} comment - The review comment to analyze.
 * @returns {Promise<{priority: string, next_action: string, department: string, user_type: string}>}
 */
async function analyzeReview(comment) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

  if (!apiKey || !endpoint || !deploymentName) {
    console.warn('Azure OpenAI configuration is missing. Falling back to default values.');
    return { ...DEFAULT_ESCALATION };
  }

  // Construct prompt exactly as used by the user
  const systemPrompt = `You are an AI assistant that analyzes Trustpilot reviews. Analyze the provided review and extract the following information. You must respond strictly in valid JSON format with these exact keys:  priority (Choose one: "P0", "P1", "P2", "P3", "P4", "P5")  next_action (A brief description of what action needs to be taken next)  department (The department that should handle this, e.g., Support, Sales, Marketing, HR)  user_type (Categorize the user, e.g., "Customer", "Donor", "Inquirer")  Do not include any conversational text, code blocks, or markdown formatting in your response. Return only the raw JSON object.`;
  const userContent = `review: ${comment || ''}`;

  const bodyStr = JSON.stringify({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0
  });

  try {
    const urlBase = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;
    const parsedUrl = new URL(urlBase);

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Azure OpenAI HTTP ${res.statusCode}: ${raw}`));
          } else {
            try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(bodyStr);
      req.end();
    });

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
      console.error('Azure OpenAI returned an empty response.');
      return { ...DEFAULT_ESCALATION };
    }

    const replyText = data.choices[0].message.content.trim();
    return parseLLMResponse(replyText);
  } catch (error) {
    console.error('Failed to run Azure OpenAI review analysis:', error.message);
    return { ...DEFAULT_ESCALATION };
  }
}

/**
 * Parses and sanitizes LLM JSON output. Handles potential codeblocks (```json ... ```)
 * @param {string} text 
 * @returns {{priority: string, next_action: string, department: string, user_type: string}}
 */
function parseLLMResponse(text) {
  try {
    // Strip markdown code block wrappers if the model ignored instructions
    let cleanText = text;
    if (cleanText.includes('```')) {
      const match = cleanText.match(/```(?:json)?([\s\S]*?)```/);
      if (match) {
        cleanText = match[1].trim();
      }
    }
    
    const json = JSON.parse(cleanText);
    
    // Normalize and validate response keys
    const priority = json.priority || DEFAULT_ESCALATION.priority;
    const next_action = json.next_action || DEFAULT_ESCALATION.next_action;
    const department = json.department || DEFAULT_ESCALATION.department;
    const user_type = json.user_type || DEFAULT_ESCALATION.user_type;

    return { priority, next_action, department, user_type };
  } catch (err) {
    console.error('Failed to parse LLM JSON output:', err, 'Raw text:', text);
    return { ...DEFAULT_ESCALATION };
  }
}

module.exports = {
  analyzeReview,
  parseLLMResponse,
  DEFAULT_ESCALATION
};
