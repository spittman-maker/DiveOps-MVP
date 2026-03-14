/**
 * PSG Data Layer — DiveOps-MVP Integration Client
 *
 * Drop-in integration for DiveOps-MVP. Intercepts key events from the
 * DiveOps application and forwards them to the PSG unified data layer.
 *
 * Installation:
 *   1. Copy this file and psg-client.js into your DiveOps-MVP project
 *   2. Set environment variables:
 *        PSG_DATA_LAYER_URL=https://psg-data-layer.azurecontainerapps.io
 *        PSG_DATA_LAYER_API_KEY=psg_diveop_...
 *   3. Import and initialize in your server entry point:
 *        const { psgDiveOps } = require('./psg-diveops-client');
 *   4. Call the appropriate method from your route handlers
 *
 * All methods are fire-and-forget (non-blocking) by default.
 * Errors are caught internally and logged — they will never crash DiveOps.
 */

const crypto = require('crypto');
const { PSGClient } = require('./psg-client');

// ── Singleton Client ───────────────────────────────────────────────────────

const client = new PSGClient({
  apiKey: process.env.PSG_DATA_LAYER_API_KEY,
  baseUrl: process.env.PSG_DATA_LAYER_URL || 'https://psg-data-layer.whitedune-3a34526c.centralus.azurecontainerapps.io',
  enabled: process.env.PSG_DATA_LAYER_ENABLED !== 'false',
});

// ── Helper ─────────────────────────────────────────────────────────────────

function hashId(id) {
  if (!id) return null;
  return crypto.createHash('sha256').update(String(id)).digest('hex').substring(0, 32);
}

function safeDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function fire(fn) {
  Promise.resolve().then(fn).catch((err) => {
    console.error('[PSG DiveOps] Ingestion error:', err.message);
  });
}

// ── DiveOps Event Handlers ─────────────────────────────────────────────────

const psgDiveOps = {

  /**
   * Call when a dive is logged.
   * Maps to DiveOps-MVP dives table.
   */
  onDiveLogged(dive, project) {
    fire(async () => {
      await client.sendDiveOperation({
        operation_type: 'dive',
        status: dive.status || 'completed',
        project_id: String(dive.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(dive.dayId || ''),
        day_date: safeDate(dive.diveDate || dive.createdAt),
        shift: dive.shift || null,
        diver_id_hash: hashId(dive.diverId),
        diver_name: dive.diverName || null,
        dive_number: dive.diveNumber || null,
        station: dive.station || null,
        work_location: dive.workLocation || null,
        max_depth_fsw: dive.maxDepthFsw || null,
        bottom_time_min: dive.bottomTimeMin || null,
        breathing_gas: dive.breathingGas || null,
        fo2_percent: dive.fo2Percent || null,
        table_used: dive.tableUsed || null,
        schedule_used: dive.scheduleUsed || null,
        decomp_required: dive.decompRequired || null,
        task_summary: dive.taskSummary || null,
        tools_equipment: dive.toolsEquipment || null,
        qc_disposition: dive.qcDisposition || null,
        risk_level: dive.riskLevel || null,
        source_record_id: String(dive.id || ''),
        structured_data: {
          surface_interval: dive.surfaceInterval,
          tender_id: hashId(dive.tenderId),
          supervisor_id: hashId(dive.supervisorId),
        },
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      // Also send unified event
      client.queueEvent({
        event_type: 'dive_logged',
        source_app: 'diveops',
        severity: 'info',
        project_id: String(dive.projectId || ''),
        payload: {
          dive_number: dive.diveNumber,
          max_depth_fsw: dive.maxDepthFsw,
          bottom_time_min: dive.bottomTimeMin,
          status: dive.status,
          summary: `Dive #${dive.diveNumber} logged — ${dive.maxDepthFsw} FSW, ${dive.bottomTimeMin} min`,
        },
      });
    });
  },

  /**
   * Call when a log event is created (master log entry).
   */
  onLogEventCreated(logEvent, project, day) {
    fire(async () => {
      await client.sendDiveOperation({
        operation_type: 'log_event',
        status: 'completed',
        project_id: String(logEvent.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(logEvent.dayId || day?.id || ''),
        day_date: safeDate(logEvent.createdAt || day?.date),
        category: logEvent.category || null,
        raw_text: logEvent.rawText || logEvent.text || null,
        task_summary: logEvent.summary || null,
        risk_level: logEvent.riskLevel || null,
        source_record_id: String(logEvent.id || ''),
        structured_data: {
          time_of_event: logEvent.timeOfEvent,
          personnel_involved: logEvent.personnelInvolved,
        },
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      client.queueEvent({
        event_type: 'log_event_created',
        source_app: 'diveops',
        severity: logEvent.riskLevel === 'high' ? 'warning' : 'info',
        project_id: String(logEvent.projectId || ''),
        payload: {
          category: logEvent.category,
          summary: logEvent.summary || logEvent.rawText?.substring(0, 200),
        },
      });
    });
  },

  /**
   * Call when a day is opened (shift start).
   */
  onDayOpened(day, project) {
    fire(async () => {
      await client.sendDiveOperation({
        operation_type: 'day_open',
        status: 'in_progress',
        project_id: String(day.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(day.id || ''),
        day_date: safeDate(day.date),
        shift: day.shift || null,
        personnel_count: day.personnelCount || null,
        weather_data: {
          conditions: day.weatherConditions,
          wind_speed: day.windSpeed,
          wave_height: day.waveHeight,
          visibility: day.visibility,
          temperature: day.temperature,
        },
        source_record_id: String(day.id || ''),
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      client.queueEvent({
        event_type: 'day_opened',
        source_app: 'diveops',
        severity: 'info',
        project_id: String(day.projectId || ''),
        payload: {
          day_date: safeDate(day.date),
          shift: day.shift,
          summary: `Day opened for ${project?.name || 'project'} — ${safeDate(day.date)}`,
        },
      });
    });
  },

  /**
   * Call when a day is closed (shift end).
   */
  onDayClosed(day, project, summary) {
    fire(async () => {
      await client.sendDiveOperation({
        operation_type: 'day_close',
        status: 'completed',
        project_id: String(day.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(day.id || ''),
        day_date: safeDate(day.date),
        shift: day.shift || null,
        personnel_count: summary?.personnelCount || null,
        hours_worked: summary?.hoursWorked || null,
        source_record_id: String(day.id || ''),
        structured_data: {
          total_dives: summary?.totalDives,
          total_bottom_time: summary?.totalBottomTime,
          incidents: summary?.incidents,
        },
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      client.queueEvent({
        event_type: 'day_closed',
        source_app: 'diveops',
        severity: 'info',
        project_id: String(day.projectId || ''),
        payload: {
          day_date: safeDate(day.date),
          total_dives: summary?.totalDives,
          total_bottom_time_min: summary?.totalBottomTime,
          summary: `Day closed — ${summary?.totalDives || 0} dives, ${summary?.totalBottomTime || 0} min bottom time`,
        },
      });
    });
  },

  /**
   * Call when a near-miss is reported.
   */
  onNearMissReported(incident, project) {
    fire(async () => {
      await client.sendSafetyIncident({
        incident_type: 'near_miss',
        title: incident.title || incident.description?.substring(0, 100) || 'Near-miss reported',
        description: incident.description || null,
        severity: incident.severity || 'medium',
        status: incident.status || 'reported',
        project_id: String(incident.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(incident.dayId || ''),
        day_date: safeDate(incident.incidentDate || incident.createdAt),
        location: incident.location || null,
        reported_by_hash: hashId(incident.reportedById),
        reported_by_name: incident.reportedByName || null,
        category: incident.category || null,
        immediate_actions: incident.immediateActions || null,
        root_cause: incident.rootCause || null,
        corrective_actions: incident.correctiveActions || null,
        risk_level: incident.riskLevel || null,
        hazards: incident.hazards || [],
        source_record_id: String(incident.id || ''),
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      client.queueEvent({
        event_type: 'near_miss_reported',
        source_app: 'diveops',
        severity: incident.severity === 'critical' ? 'critical' : 'warning',
        project_id: String(incident.projectId || ''),
        payload: {
          title: incident.title,
          severity: incident.severity,
          category: incident.category,
          summary: `Near-miss reported: ${incident.title}`,
        },
      });
    });
  },

  /**
   * Call when a JHA is completed.
   */
  onJHACompleted(jha, project) {
    fire(async () => {
      await client.sendSafetyIncident({
        incident_type: 'jha',
        title: jha.title || jha.taskDescription || 'JHA completed',
        description: jha.taskDescription || null,
        severity: 'low',
        status: 'resolved',
        project_id: String(jha.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(jha.dayId || ''),
        day_date: safeDate(jha.completedAt || jha.createdAt),
        location: jha.location || null,
        reported_by_hash: hashId(jha.completedById),
        hazards: jha.hazards || [],
        mitigation: jha.mitigationMeasures || null,
        attendees: (jha.attendees || []).map((a) => (typeof a === 'string' ? a : a.name || String(a))),
        source_record_id: String(jha.id || ''),
        metadata: { source: 'diveops-mvp', version: '1' },
      });

      client.queueEvent({
        event_type: 'jha_completed',
        source_app: 'diveops',
        severity: 'info',
        project_id: String(jha.projectId || ''),
        payload: {
          title: jha.title,
          hazard_count: (jha.hazards || []).length,
          attendee_count: (jha.attendees || []).length,
          summary: `JHA completed: ${jha.title}`,
        },
      });
    });
  },

  /**
   * Call when a safety checklist is completed.
   */
  onChecklistCompleted(checklist, project) {
    fire(async () => {
      const failedItems = (checklist.responses || []).filter((r) => r.answer === 'no' || r.failed);

      await client.sendSafetyIncident({
        incident_type: 'checklist_completion',
        title: checklist.name || checklist.type || 'Safety checklist completed',
        severity: failedItems.length > 0 ? 'medium' : 'low',
        status: failedItems.length > 0 ? 'under_review' : 'resolved',
        project_id: String(checklist.projectId || project?.id || ''),
        project_name: project?.name || null,
        day_id: String(checklist.dayId || ''),
        day_date: safeDate(checklist.completedAt || checklist.createdAt),
        reported_by_hash: hashId(checklist.completedById),
        checklist_responses: checklist.responses || [],
        source_record_id: String(checklist.id || ''),
        metadata: {
          source: 'diveops-mvp',
          checklist_type: checklist.type,
          pass_rate: checklist.responses?.length > 0
            ? Math.round(((checklist.responses.length - failedItems.length) / checklist.responses.length) * 100)
            : 100,
        },
      });

      client.queueEvent({
        event_type: 'safety_checklist_completed',
        source_app: 'diveops',
        severity: failedItems.length > 0 ? 'warning' : 'info',
        project_id: String(checklist.projectId || ''),
        payload: {
          checklist_type: checklist.type,
          total_items: (checklist.responses || []).length,
          failed_items: failedItems.length,
          summary: `Safety checklist completed — ${failedItems.length} items failed`,
        },
      });
    });
  },

  /**
   * Call when a project is created.
   */
  onProjectCreated(project) {
    fire(async () => {
      client.queueEvent({
        event_type: 'project_created',
        source_app: 'diveops',
        severity: 'info',
        project_id: String(project.id || ''),
        payload: {
          name: project.name,
          client: project.client,
          location: project.location,
          start_date: safeDate(project.startDate),
          summary: `Project created: ${project.name}`,
        },
      });
    });
  },

  /**
   * Flush any queued events immediately (call on server shutdown).
   */
  async flush() {
    await client.flush();
  },

  /**
   * Destroy the client (call on server shutdown).
   */
  async destroy() {
    await client.destroy();
  },
};

module.exports = { psgDiveOps, client };
