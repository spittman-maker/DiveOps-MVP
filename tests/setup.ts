/**
 * Test Setup File for Vitest
 * 
 * Configures the test environment before running tests.
 * - Sets up environment variables for testing
 * - Configures mock database connection
 * - Sets up global test utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock database URL for integration tests (will be overridden by actual test database)
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/diveops_test';

// Mock OpenAI API key for AI tests
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-api-key';
process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Increase timeout for integration tests
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000,
});

// Global test utilities
declare global {
  var testUtils: {
    generateTestId: (prefix: string) => string;
    wait: (ms: number) => Promise<void>;
  };
}

globalThis.testUtils = {
  generateTestId: (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

console.log('Test environment setup complete');