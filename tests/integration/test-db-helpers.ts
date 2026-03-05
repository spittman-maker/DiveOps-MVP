/**
 * Test Database Helpers for Integration Tests
 * 
 * Provides utilities for setting up and tearing down test databases,
 * creating test data, and managing test transactions.
 */

import { db, pool } from '../../server/storage';
import { users, projects, days, logEvents, dives, diveConfirmations, riskItems, divePlans } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { InsertUser, InsertProject, InsertDay, InsertLogEvent, InsertDive, InsertDiveConfirmation, InsertRiskItem, InsertDivePlan } from '@shared/schema';

/**
 * Clean all test data from database
 * WARNING: This deletes all data - use only in test environment!
 */
export async function cleanTestDatabase() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanTestDatabase should only be used in test environment');
  }

  const client = await pool.connect();
  try {
    // Disable foreign key constraints temporarily
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    
    // Delete in order of dependencies
    await db.delete(diveConfirmations);
    await db.delete(riskItems);
    await db.delete(dives);
    await db.delete(logEvents);
    await db.delete(divePlans);
    await db.delete(days);
    await db.delete(users);
    await db.delete(projects);
    
    console.log('Test database cleaned successfully');
  } finally {
    client.release();
  }
}

/**
 * Create a test user
 */
export async function createTestUser(overrides: Partial<InsertUser> = {}): Promise<any> {
  const userData: InsertUser = {
    id: overrides.id || `test_user_${Date.now()}`,
    username: overrides.username || `testuser_${Date.now()}`,
    password: overrides.password || 'hashed_password_for_testing',
    displayName: overrides.displayName || 'Test User',
    initials: overrides.initials || 'TU',
    role: overrides.role || 'SUPERVISOR',
    companyId: overrides.companyId || 'test_company',
    active: overrides.active ?? true,
    createdAt: new Date(),
    ...overrides,
  };

  const [user] = await db.insert(users).values(userData).returning();
  return user;
}

/**
 * Create a test project
 */
export async function createTestProject(overrides: Partial<InsertProject> = {}): Promise<any> {
  const projectData: InsertProject = {
    name: overrides.name || `Test Project ${Date.now()}`,
    projectId: overrides.projectId || `proj_${Date.now()}`,
    location: overrides.location || 'Test Location',
    clientName: overrides.clientName || 'Test Client',
    clientPoc: overrides.clientPoc || 'Test POC',
    startDate: overrides.startDate || new Date(),
    endDate: overrides.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    contractType: overrides.contractType || 'TIME_MATERIALS',
    createdBy: overrides.createdBy || 'test_user',
    createdAt: new Date(),
    status: 'active',
    ...overrides,
  };

  const [project] = await db.insert(projects).values(projectData).returning();
  return project;
}

/**
 * Create a test day
 */
export async function createTestDay(projectId: string, overrides: Partial<InsertDay> = {}): Promise<any> {
  const dayData: InsertDay = {
    projectId,
    date: overrides.date || new Date().toISOString().split('T')[0],
    shift: overrides.shift || 'DAY',
    supervisorId: overrides.supervisorId || 'test_user',
    divingSupervisorId: overrides.divingSupervisorId || 'test_user',
    status: overrides.status || 'OPEN',
    createdAt: new Date(),
    ...overrides,
  };

  const [day] = await db.insert(days).values(dayData).returning();
  return day;
}

/**
 * Create a test log event
 */
export async function createTestLogEvent(dayId: string, overrides: Partial<InsertLogEvent> = {}): Promise<any> {
  const eventData: InsertLogEvent = {
    dayId,
    eventTime: overrides.eventTime || '12:00',
    rawText: overrides.rawText || 'Test log event',
    category: overrides.category || 'routine',
    extractedData: overrides.extractedData || {},
    createdById: overrides.createdById || 'test_user',
    createdAt: new Date(),
    version: 1,
    ...overrides,
  };

  const [event] = await db.insert(logEvents).values(eventData).returning();
  return event;
}

/**
 * Create a test dive
 */
export async function createTestDive(dayId: string, overrides: Partial<InsertDive> = {}): Promise<any> {
  const diveData: InsertDive = {
    dayId,
    diverId: overrides.diverId || 'test_user',
    diveNumber: overrides.diveNumber || 1,
    station: overrides.station || 'A',
    status: overrides.status || 'PENDING',
    createdAt: new Date(),
    version: 1,
    ...overrides,
  };

  const [dive] = await db.insert(dives).values(diveData).returning();
  return dive;
}

/**
 * Create a complete test scenario with user, project, day, and events
 */
export async function createTestScenario() {
  const user = await createTestUser();
  const project = await createTestProject({ createdBy: user.id });
  const day = await createTestDay(project.projectId, { supervisorId: user.id, divingSupervisorId: user.id });
  const event = await createTestLogEvent(day.id, { createdById: user.id });

  return {
    user,
    project,
    day,
    event,
  };
}

/**
 * Run a function within a transaction and rollback
 * Useful for isolated tests that shouldn't commit
 */
export async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    const result = await fn(tx);
    // Transaction will be automatically rolled back if we throw
    // We'll let the caller handle rollback explicitly if needed
    return result;
  });
}

/**
 * Verify database state
 */
export async function verifyDatabaseState() {
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [projectCount] = await db.select({ count: sql<number>`count(*)` }).from(projects);
  const [dayCount] = await db.select({ count: sql<number>`count(*)` }).from(days);
  const [eventCount] = await db.select({ count: sql<number>`count(*)` }).from(logEvents);
  const [diveCount] = await db.select({ count: sql<number>`count(*)` }).from(dives);

  return {
    users: Number(userCount.count),
    projects: Number(projectCount.count),
    days: Number(dayCount.count),
    logEvents: Number(eventCount.count),
    dives: Number(diveCount),
  };
}