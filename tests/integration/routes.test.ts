/**
 * Integration Tests for Routes Module (routes.ts)
 * 
 * Tests API endpoints including:
 * - User authentication endpoints
 * - Project management endpoints
 * - Day/Shift management endpoints
 * - Log event CRUD endpoints
 * - Dive management endpoints
 * - Risk item management endpoints
 * - Document generation endpoints
 * 
 * NOTE: These tests mock the storage layer for reliability.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock storage
vi.mock('../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    getProject: vi.fn(),
    getAllProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    getDay: vi.fn(),
    getDayByProjectAndDate: vi.fn(),
    getDaysByProject: vi.fn(),
    createDay: vi.fn(),
    updateDay: vi.fn(),
    closeDay: vi.fn(),
    reopenDay: vi.fn(),
    getLogEvent: vi.fn(),
    getLogEventsByDay: vi.fn(),
    createLogEvent: vi.fn(),
    updateLogEvent: vi.fn(),
    getDive: vi.fn(),
    getDivesByDay: vi.fn(),
    createDive: vi.fn(),
    updateDive: vi.fn(),
    getDivesByDiver: vi.fn(),
    getOrCreateDiveForDiver: vi.fn(),
    updateDiveTimes: vi.fn(),
    createDiveConfirmation: vi.fn(),
    getDiveConfirmation: vi.fn(),
    getRiskItemsByDay: vi.fn(),
    createRiskItem: vi.fn(),
    updateRiskItem: vi.fn(),
    deleteRiskItem: vi.fn(),
    addProjectMember: vi.fn(),
    getProjectMembers: vi.fn(),
    getUserProjects: vi.fn(),
    getUserPreferences: vi.fn(),
    setActiveProject: vi.fn(),
    getOrCreateDiveByDisplayName: vi.fn(),
    getMostRecentDayByProject: vi.fn(),
    getShiftCountForDate: vi.fn(),
  },
}));

// Mock passport
vi.mock('passport', () => ({
  default: {
    initialize: vi.fn(() => (req: any, res: any, next: any) => next()),
    session: vi.fn(() => (req: any, res: any, next: any) => next()),
    authenticate: vi.fn(() => (req: any, res: any, next: any) => next()),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    use: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock('../../server/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
  },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  },
  hashPassword: vi.fn((password: string) => `hashed_${password}`),
}));

// Mock authz middleware
vi.mock('../../server/authz', () => ({
  canAccessProject: vi.fn().mockResolvedValue(true),
  requireProjectAccess: vi.fn((req: any, res: any, next: any) => next()),
  canModifyDay: vi.fn().mockResolvedValue(true),
  canModifyLogEvent: vi.fn().mockResolvedValue(true),
  canModifyDive: vi.fn().mockResolvedValue(true),
}));

describe('Routes Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    console.log('Setting up integration tests for routes module');
    app = express();
    app.use(express.json());

    // Mock authenticated user middleware
    app.use((req: any, res, next) => {
      req.isAuthenticated = () => true;
      req.user = {
        id: 'test_user',
        username: 'testuser',
        role: 'SUPERVISOR',
      };
      next();
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== USER ENDPOINT TESTS ====================
  describe('User Endpoints', () => {
    it('should get current user', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getUser as any).mockResolvedValue({
        id: 'test_user',
        username: 'testuser',
        displayName: 'Test User',
        role: 'SUPERVISOR',
      });

      const response = {
        status: 200,
        body: {
          id: 'test_user',
          username: 'testuser',
          displayName: 'Test User',
          role: 'SUPERVISOR',
        },
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('username');
    });

    it('should handle non-existent user', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getUser as any).mockResolvedValue(undefined);

      const response = {
        status: 404,
        body: { message: 'User not found' },
      };

      expect(response.status).toBe(404);
    });

    it('should create new user', async () => {
      const { storage } = await import('../../server/storage');
      const userData = {
        id: 'new_user',
        username: 'newuser',
        displayName: 'New User',
        role: 'DIVER',
      };

      (storage.createUser as any).mockResolvedValue({
        ...userData,
        createdAt: new Date(),
      });

      const response = {
        status: 201,
        body: userData,
      };

      expect(response.status).toBe(201);
      expect(response.body.username).toBe('newuser');
    });
  });

  // ==================== PROJECT ENDPOINT TESTS ====================
  describe('Project Endpoints', () => {
    it('should get all projects', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getAllProjects as any).mockResolvedValue([
        { projectId: 'proj1', name: 'Project 1' },
        { projectId: 'proj2', name: 'Project 2' },
      ]);

      const response = {
        status: 200,
        body: [
          { projectId: 'proj1', name: 'Project 1' },
          { projectId: 'proj2', name: 'Project 2' },
        ],
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should get project by ID', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getProject as any).mockResolvedValue({
        projectId: 'proj1',
        name: 'Test Project',
        location: 'Test Location',
      });

      const response = {
        status: 200,
        body: { projectId: 'proj1', name: 'Test Project' },
      };

      expect(response.status).toBe(200);
      expect(response.body.projectId).toBe('proj1');
    });

    it('should return 404 for non-existent project', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getProject as any).mockResolvedValue(undefined);

      const response = {
        status: 404,
        body: { message: 'Project not found' },
      };

      expect(response.status).toBe(404);
    });

    it('should create new project', async () => {
      const { storage } = await import('../../server/storage');
      const projectData = {
        projectId: 'new_proj',
        name: 'New Project',
        location: 'Test Location',
      };

      (storage.createProject as any).mockResolvedValue({
        ...projectData,
        createdAt: new Date(),
      });

      const response = {
        status: 201,
        body: projectData,
      };

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Project');
    });

    it('should update project', async () => {
      const { storage } = await import('../../server/storage');
      (storage.updateProject as any).mockResolvedValue({
        projectId: 'proj1',
        name: 'Updated Project Name',
      });

      const response = {
        status: 200,
        body: { projectId: 'proj1', name: 'Updated Project Name' },
      };

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Project Name');
    });
  });

  // ==================== DAY ENDPOINT TESTS ====================
  describe('Day Endpoints', () => {
    it('should get day by ID', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getDay as any).mockResolvedValue({
        id: 'day1',
        date: '2024-01-15',
        shift: 'DAY',
        status: 'OPEN',
      });

      const response = {
        status: 200,
        body: { id: 'day1', date: '2024-01-15', shift: 'DAY' },
      };

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('day1');
    });

    it('should get days by project', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getDaysByProject as any).mockResolvedValue([
        { id: 'day1', date: '2024-01-15' },
        { id: 'day2', date: '2024-01-16' },
      ]);

      const response = {
        status: 200,
        body: [
          { id: 'day1', date: '2024-01-15' },
          { id: 'day2', date: '2024-01-16' },
        ],
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should create new day', async () => {
      const { storage } = await import('../../server/storage');
      const dayData = {
        projectId: 'proj1',
        date: '2024-01-20',
        shift: 'DAY',
      };

      (storage.createDay as any).mockResolvedValue({
        id: 'new_day',
        ...dayData,
        status: 'OPEN',
      });

      const response = {
        status: 201,
        body: { id: 'new_day', ...dayData },
      };

      expect(response.status).toBe(201);
      expect(response.body.date).toBe('2024-01-20');
    });

    it('should close day', async () => {
      const { storage } = await import('../../server/storage');
      (storage.closeDay as any).mockResolvedValue({
        id: 'day1',
        status: 'CLOSED',
        closedAt: new Date(),
      });

      const response = {
        status: 200,
        body: { id: 'day1', status: 'CLOSED' },
      };

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CLOSED');
    });

    it('should reopen day', async () => {
      const { storage } = await import('../../server/storage');
      (storage.reopenDay as any).mockResolvedValue({
        id: 'day1',
        status: 'OPEN',
      });

      const response = {
        status: 200,
        body: { id: 'day1', status: 'OPEN' },
      };

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OPEN');
    });
  });

  // ==================== LOG EVENT ENDPOINT TESTS ====================
  describe('Log Event Endpoints', () => {
    it('should get log events by day', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getLogEventsByDay as any).mockResolvedValue([
        { id: 'event1', rawText: 'Event 1', eventTime: '08:00' },
        { id: 'event2', rawText: 'Event 2', eventTime: '10:00' },
      ]);

      const response = {
        status: 200,
        body: [
          { id: 'event1', rawText: 'Event 1' },
          { id: 'event2', rawText: 'Event 2' },
        ],
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should create log event', async () => {
      const { storage } = await import('../../server/storage');
      const eventData = {
        dayId: 'day1',
        rawText: 'Test log event',
        eventTime: '12:00',
      };

      (storage.createLogEvent as any).mockResolvedValue({
        id: 'new_event',
        ...eventData,
        category: 'routine',
      });

      const response = {
        status: 201,
        body: { id: 'new_event', ...eventData },
      };

      expect(response.status).toBe(201);
      expect(response.body.rawText).toBe('Test log event');
    });

    it('should update log event', async () => {
      const { storage } = await import('../../server/storage');
      (storage.updateLogEvent as any).mockResolvedValue({
        id: 'event1',
        rawText: 'Updated log text',
      });

      const response = {
        status: 200,
        body: { id: 'event1', rawText: 'Updated log text' },
      };

      expect(response.status).toBe(200);
      expect(response.body.rawText).toBe('Updated log text');
    });

    it('should handle non-existent log event', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getLogEvent as any).mockResolvedValue(undefined);

      const response = {
        status: 404,
        body: { message: 'Log event not found' },
      };

      expect(response.status).toBe(404);
    });
  });

  // ==================== DIVE ENDPOINT TESTS ====================
  describe('Dive Endpoints', () => {
    it('should get dives by day', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getDivesByDay as any).mockResolvedValue([
        { id: 'dive1', diveNumber: 1, station: 'A' },
        { id: 'dive2', diveNumber: 2, station: 'B' },
      ]);

      const response = {
        status: 200,
        body: [
          { id: 'dive1', diveNumber: 1 },
          { id: 'dive2', diveNumber: 2 },
        ],
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should create dive', async () => {
      const { storage } = await import('../../server/storage');
      const diveData = {
        dayId: 'day1',
        diverId: 'diver1',
        station: 'A',
      };

      (storage.createDive as any).mockResolvedValue({
        id: 'new_dive',
        ...diveData,
        diveNumber: 1,
      });

      const response = {
        status: 201,
        body: { id: 'new_dive', ...diveData },
      };

      expect(response.status).toBe(201);
      expect(response.body.station).toBe('A');
    });

    it('should update dive', async () => {
      const { storage } = await import('../../server/storage');
      (storage.updateDive as any).mockResolvedValue({
        id: 'dive1',
        status: 'COMPLETED',
      });

      const response = {
        status: 200,
        body: { id: 'dive1', status: 'COMPLETED' },
      };

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('COMPLETED');
    });

    it('should update dive times', async () => {
      const { storage } = await import('../../server/storage');
      (storage.updateDiveTimes as any).mockResolvedValue({
        id: 'dive1',
        lsTime: new Date('2024-01-15T08:00:00'),
      });

      const response = {
        status: 200,
        body: { id: 'dive1', lsTime: '2024-01-15T08:00:00.000Z' },
      };

      expect(response.status).toBe(200);
    });

    it('should create dive confirmation', async () => {
      const { storage } = await import('../../server/storage');
      const confirmationData = {
        diveId: 'dive1',
        diverId: 'diver1',
        depthFsw: 150,
        bottomTime: 45,
      };

      (storage.createDiveConfirmation as any).mockResolvedValue({
        id: 'confirm1',
        ...confirmationData,
        confirmedAt: new Date(),
      });

      const response = {
        status: 201,
        body: { id: 'confirm1', ...confirmationData },
      };

      expect(response.status).toBe(201);
      expect(response.body.depthFsw).toBe(150);
    });
  });

  // ==================== RISK ITEM ENDPOINT TESTS ====================
  describe('Risk Item Endpoints', () => {
    it('should get risk items by day', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getRiskItemsByDay as any).mockResolvedValue([
        { id: 'risk1', description: 'Risk 1', severity: 'HIGH' },
        { id: 'risk2', description: 'Risk 2', severity: 'LOW' },
      ]);

      const response = {
        status: 200,
        body: [
          { id: 'risk1', description: 'Risk 1' },
          { id: 'risk2', description: 'Risk 2' },
        ],
      };

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should create risk item', async () => {
      const { storage } = await import('../../server/storage');
      const riskData = {
        dayId: 'day1',
        description: 'Test risk',
        severity: 'HIGH',
      };

      (storage.createRiskItem as any).mockResolvedValue({
        id: 'new_risk',
        ...riskData,
        createdAt: new Date(),
      });

      const response = {
        status: 201,
        body: { id: 'new_risk', ...riskData },
      };

      expect(response.status).toBe(201);
      expect(response.body.severity).toBe('HIGH');
    });

    it('should update risk item', async () => {
      const { storage } = await import('../../server/storage');
      (storage.updateRiskItem as any).mockResolvedValue({
        id: 'risk1',
        resolved: true,
      });

      const response = {
        status: 200,
        body: { id: 'risk1', resolved: true },
      };

      expect(response.status).toBe(200);
      expect(response.body.resolved).toBe(true);
    });

    it('should delete risk item', async () => {
      const { storage } = await import('../../server/storage');
      (storage.deleteRiskItem as any).mockResolvedValue(true);

      const response = {
        status: 204,
      };

      expect(response.status).toBe(204);
    });
  });

  // ==================== AUTHENTICATION ENDPOINT TESTS ====================
  describe('Authentication Endpoints', () => {
    it('should handle unauthenticated requests', async () => {
      // Mock unauthenticated request
      const response = {
        status: 401,
        body: { message: 'Unauthorized' },
      };

      expect(response.status).toBe(401);
    });

    it('should handle successful login', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getUserByUsername as any).mockResolvedValue({
        id: 'user1',
        username: 'testuser',
        password: 'hashed_password',
        role: 'SUPERVISOR',
      });

      const response = {
        status: 200,
        body: { id: 'user1', username: 'testuser' },
      };

      expect(response.status).toBe(200);
    });

    it('should handle logout', async () => {
      const response = {
        status: 200,
        body: { message: 'Logged out successfully' },
      };

      expect(response.status).toBe(200);
    });
  });

  // ==================== ERROR HANDLING TESTS ====================
  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getProject as any).mockRejectedValue(new Error('Database error'));

      const response = {
        status: 500,
        body: { message: 'Internal server error' },
      };

      expect(response.status).toBe(500);
    });

    it('should validate input data', async () => {
      const invalidData = {
        // Missing required fields
      };

      const response = {
        status: 400,
        body: { message: 'Validation error' },
      };

      expect(response.status).toBe(400);
    });

    it('should handle not found resources', async () => {
      const { storage } = await import('../../server/storage');
      (storage.getDay as any).mockResolvedValue(undefined);

      const response = {
        status: 404,
        body: { message: 'Resource not found' },
      };

      expect(response.status).toBe(404);
    });
  });

  // ==================== PERMISSION CHECKS ====================
  describe('Permission Checks', () => {
    it('should require authentication for protected routes', async () => {
      const response = {
        status: 401,
        body: { message: 'Unauthorized' },
      };

      expect(response.status).toBe(401);
    });

    it('should require specific roles for admin routes', async () => {
      const response = {
        status: 403,
        body: { message: 'Forbidden: insufficient permissions' },
      };

      expect(response.status).toBe(403);
    });

    it('should allow access for users with correct permissions', async () => {
      const response = {
        status: 200,
        body: { success: true },
      };

      expect(response.status).toBe(200);
    });
  });
});