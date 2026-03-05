# DiveOps-MVP Test Documentation

## Overview

This document provides comprehensive documentation for the DiveOps-MVP testing suite, covering unit tests, integration tests, and functional tests.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual functions
│   ├── extraction.test.ts   # Extraction utilities (43 tests)
│   ├── validator.test.ts    # Validation functions (30 tests)
│   ├── document-export.test.ts  # Document generation (32 tests)
│   └── feature-flags.test.ts    # Feature flag system (33 tests)
├── integration/             # Integration tests for API endpoints
│   ├── storage.test.ts      # Database operations
│   ├── routes.test.ts       # API routes
│   ├── auth.test.ts         # Authentication flows
│   └── ai.test.ts           # AI processing
└── functional/              # End-to-end workflow tests
    ├── user-management.test.ts
    ├── project-management.test.ts
    ├── day-shift-management.test.ts
    ├── log-event-workflows.test.ts
    ├── dive-operations.test.ts
    ├── risk-management.test.ts
    └── document-generation.test.ts
```

## Test Commands

```bash
# Run all unit tests
npm run test:unit

# Run all integration tests
npm run test:integration

# Run all functional tests
npm run test:functional

# Run all tests
npm test

# Run tests with coverage
npm run test:unit -- --coverage
```

## Unit Tests

### extraction.test.ts (43 tests)

Tests for the extraction utilities in `server/extraction.ts`:

- **Event Classification**: Tests for `classifyEvent()` function
  - Dive operation detection (breached bottom, umbilical, etc.)
  - Safety event detection (hazard, incident, etc.)
  - General operation detection
  
- **Hazard Detection**: Tests for `detectHazards()` function
  - Standard hazard keywords (install, suspend, lift, etc.)
  - Direction conflict detection
  - Multiple hazard detection

- **Data Extraction**: Tests for extraction utilities
  - Task description extraction
  - Timestamp extraction
  - Depth/pressure extraction

- **Text Processing**: Tests for text sanitization
  - Master log sanitization
  - Time format conversion
  - Special character handling

### validator.test.ts (30 tests)

Tests for the validation functions in `server/validator.ts`:

- **Timestamp Validation**: `validateTimestamp()`
  - Valid ISO 8601 timestamps
  - Invalid date/month values
  - Empty/null handling

- **Time Formatting**: `formatTimeTo24Hour()`
  - AM/PM conversion
  - a.m./p.m. handling
  - Edge cases (12:00 AM/PM)

- **Content Validation**: `validateAIContent()`
  - Dive table prohibition
  - Forbidden patterns
  - 12-hour time detection

- **Master Log Validation**: `validateMasterLogPayload()`
  - Required keys validation
  - Section validation
  - Dive entry validation

- **Sanitization**: `sanitizeForMasterLog()`
  - JV/OICC replacement
  - Time format conversion
  - Special character handling

### document-export.test.ts (32 tests)

Tests for document generation utilities:

- **Initials Derivation**: `deriveInitialsFromDisplayName()`
  - Standard name formats
  - Multi-word names
  - Whitespace handling

- **Time Formatting**: `formatTimeForLog()`
  - 24-hour format conversion
  - Padding and validation

- **Depth Formatting**: `formatDepth()`
  - FSW formatting
  - Unit handling

- **Filename Generation**: `generateDocumentFilename()`
  - Project ID sanitization
  - Special character removal
  - Space replacement

### feature-flags.test.ts (33 tests)

Tests for the feature flag system:

- **Flag Retrieval**: Individual flag access
  - AI drafting flags
  - Document export flags
  - Risk management flags
  - Dive management flags
  - User management flags
  - Analytics flags

- **Naming Convention**: Flag name validation
  - CamelCase format
  - "Enabled" suffix requirement
  - Consistent patterns

- **Default Values**: Default flag states
  - Most features enabled
  - Analytics disabled for performance
  - AI auto-review disabled for safety

## Integration Tests

Integration tests verify the interaction between components:

- **Storage Tests**: Database operations with PostgreSQL
- **Routes Tests**: API endpoint behavior
- **Auth Tests**: Authentication and authorization flows
- **AI Tests**: AI processing integration

## Functional Tests

### user-management.test.ts (25+ tests)

End-to-end user management workflows:
- User creation and authentication
- Role-based access control (RBAC)
- Password hashing and validation
- Session management

### project-management.test.ts (25+ tests)

Project lifecycle workflows:
- Project creation with contract types
- Member management
- Status transitions (DRAFT → ACTIVE → COMPLETED)
- Client association

### day-shift-management.test.ts (25+ tests)

Day and shift operations:
- Day creation and initialization
- Shift status management
- Day closeout procedures
- QC data validation
- Reopening closed days

### log-event-workflows.test.ts (25+ tests)

Log event processing:
- Event creation and classification
- Automatic category detection
- Data extraction workflows
- Master log integration

### dive-operations.test.ts (30+ tests)

Dive tracking workflows:
- Dive creation and time tracking
- LS/LB/RB/RS time management
- Dive status transitions
- Roster management
- Confirmation workflows

### risk-management.test.ts (25+ tests)

Risk detection and management:
- Automatic risk detection from hazards
- Severity classification
- Status tracking (OPEN → MITIGATED → CLOSED)
- Resolution workflows

### document-generation.test.ts (20+ tests)

Document generation workflows:
- Master log generation
- Canvas log generation
- PDF formatting
- Data aggregation

## Test Coverage

### Current Coverage (Unit Tests)

| File | Statements | Branches | Functions | Lines |
|------|------------|----------|-----------|-------|
| All files | 64.51% | 58% | 68.96% | 67.63% |
| constitution.ts | 100% | 100% | 100% | 100% |
| extraction.ts | 70.52% | 56.89% | 83.33% | 75.14% |
| validator.ts | 50.9% | 59.52% | 45.45% | 51.04% |

## Running Tests in CI/CD

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Unit Tests
  run: npm run test:unit

- name: Run Integration Tests
  run: npm run test:integration
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

- name: Generate Coverage Report
  run: npm run test:unit -- --coverage
```

## Test Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data after tests complete
3. **Descriptive Names**: Use clear, descriptive test names
4. **Assertions**: Use specific assertions with meaningful error messages
5. **Coverage**: Aim for at least 80% coverage on critical paths

## Troubleshooting

### Common Issues

1. **Database Connection Errors**: Ensure PostgreSQL is running and DATABASE_URL is set
2. **Import Errors**: Check that all dependencies are installed (`npm install`)
3. **Timeout Errors**: Increase timeout for slow operations or optimize tests

### Debug Mode

Run tests with verbose output:
```bash
npm run test:unit -- --reporter=verbose
```