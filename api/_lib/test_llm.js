const { parseLLMResponse, DEFAULT_ESCALATION } = require('./llm');
const assert = require('assert');

console.log('Running LLM Service Unit Tests...');

try {
  // Test case 1: Clean JSON parsing
  const testInput1 = '{"priority": "P1", "next_action": "Contact campaigner immediately.", "department": "Support", "user_type": "Campaigner"}';
  const result1 = parseLLMResponse(testInput1);
  assert.strictEqual(result1.priority, 'P1');
  assert.strictEqual(result1.department, 'Support');
  assert.strictEqual(result1.user_type, 'Campaigner');
  assert.strictEqual(result1.next_action, 'Contact campaigner immediately.');
  console.log('✓ Test Case 1 Passed: Standard JSON parsing');

  // Test case 2: Clean JSON with markdown code blocks
  const testInput2 = '```json\n{\n  "priority": "P0",\n  "next_action": "Escalate to admin",\n  "department": "HR",\n  "user_type": "Donor"\n}\n```';
  const result2 = parseLLMResponse(testInput2);
  assert.strictEqual(result2.priority, 'P0');
  assert.strictEqual(result2.department, 'HR');
  assert.strictEqual(result2.user_type, 'Donor');
  assert.strictEqual(result2.next_action, 'Escalate to admin');
  console.log('✓ Test Case 2 Passed: Markdown JSON wrapper cleanup');

  // Test case 3: Invalid JSON string fallback
  const testInput3 = 'This is not JSON';
  const result3 = parseLLMResponse(testInput3);
  assert.deepStrictEqual(result3, DEFAULT_ESCALATION);
  console.log('✓ Test Case 3 Passed: Invalid JSON string fallback');

  // Test case 4: Missing fields fallback
  const testInput4 = '{"priority": "P2"}';
  const result4 = parseLLMResponse(testInput4);
  assert.strictEqual(result4.priority, 'P2');
  assert.strictEqual(result4.department, DEFAULT_ESCALATION.department);
  assert.strictEqual(result4.user_type, DEFAULT_ESCALATION.user_type);
  assert.strictEqual(result4.next_action, DEFAULT_ESCALATION.next_action);
  console.log('✓ Test Case 4 Passed: Partial JSON missing fields fallback');

  console.log('\nAll Unit Tests Passed Successfully!');
} catch (err) {
  console.error('✗ Unit Test Failed:', err);
  process.exit(1);
}
