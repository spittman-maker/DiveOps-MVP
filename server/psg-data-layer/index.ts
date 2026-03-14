/**
 * PSG Data Layer — DiveOps-MVP Integration
 *
 * TypeScript wrapper that imports the JS client libraries and exposes
 * typed fire-and-forget hooks for every meaningful action in DiveOps-MVP.
 *
 * Usage in routes.ts:
 *   import { psg } from './psg-data-layer';
 *   // After a dive is created:
 *   psg.onDiveLogged(dive, project);
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { psgDiveOps } = require('./psg-diveops-client');

/**
 * Typed facade over the PSG DiveOps client.
 * Every method is fire-and-forget — errors are caught internally
 * and will never crash DiveOps-MVP.
 */
export const psg = {
  /** Call when a dive record is created or updated. */
  onDiveLogged(dive: any, project?: any) {
    try { psgDiveOps.onDiveLogged(dive, project); } catch (_) { /* swallow */ }
  },

  /** Call when a log event is created (master log entry). */
  onLogEventCreated(logEvent: any, project?: any, day?: any) {
    try { psgDiveOps.onLogEventCreated(logEvent, project, day); } catch (_) { /* swallow */ }
  },

  /** Call when a day/shift is opened. */
  onDayOpened(day: any, project?: any) {
    try { psgDiveOps.onDayOpened(day, project); } catch (_) { /* swallow */ }
  },

  /** Call when a day/shift is closed. */
  onDayClosed(day: any, project?: any, summary?: any) {
    try { psgDiveOps.onDayClosed(day, project, summary); } catch (_) { /* swallow */ }
  },

  /** Call when a near-miss is reported. */
  onNearMissReported(incident: any, project?: any) {
    try { psgDiveOps.onNearMissReported(incident, project); } catch (_) { /* swallow */ }
  },

  /** Call when a JHA is completed/created. */
  onJHACompleted(jha: any, project?: any) {
    try { psgDiveOps.onJHACompleted(jha, project); } catch (_) { /* swallow */ }
  },

  /** Call when a safety checklist is completed. */
  onChecklistCompleted(checklist: any, project?: any) {
    try { psgDiveOps.onChecklistCompleted(checklist, project); } catch (_) { /* swallow */ }
  },

  /** Call when a project is created. */
  onProjectCreated(project: any) {
    try { psgDiveOps.onProjectCreated(project); } catch (_) { /* swallow */ }
  },

  /** Flush queued events (call on shutdown). */
  async flush() {
    try { await psgDiveOps.flush(); } catch (_) { /* swallow */ }
  },

  /** Destroy client (call on shutdown). */
  async destroy() {
    try { await psgDiveOps.destroy(); } catch (_) { /* swallow */ }
  },
};
