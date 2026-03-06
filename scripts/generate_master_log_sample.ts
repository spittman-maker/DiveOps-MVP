import { extractData, classifyEvent } from '../server/extraction';
import { autoCreateRisksFromDirectives } from '../server/logging/log_pipeline_guard';
import { lookupDiveTable } from '../shared/navy-dive-tables';

// Simulate a full day of operations from the test document
const rawNotes = [
  '0600 Day shift crew arrived on site. Safety briefing conducted.',
  '0615 Toolbox talk completed. All personnel accounted for.',
  '0630 Client directed reduction of crew sizes from 3 to 2 crews for the day.',
  '0645 Dive Team 1 set up at Station A. Dive Team 2 set up at Station B.',
  '0700 Tower clearance received for diving operations.',
  '0715 JM L/S 0715 40 fsw Station A - pile inspection',
  '0720 JM R/B 0720 40 fsw',
  '0750 JM L/B 0750',
  '0755 JM R/S 0755',
  '0800 BW L/S 0800 35 fsw Station B - riser weld inspection',
  '0805 BW R/B 0805 35 fsw',
  '0830 Completed 7ft of riser installation progress',
  '0845 BW L/B 0845',
  '0850 BW R/S 0850',
  '0900 CN L/S 0900 40 fsw Station A - cathodic protection survey',
  '0905 CN R/B 0905 40 fsw',
  '0930 Client email received: reduce shift to 8 hours only today.',
  '0945 CN L/B 0945',
  '0950 CN R/S 0950',
  '1000 Client directed stop work on Station B pending engineering review.',
  '1030 Dive Team 2 standing by at Station B.',
  '1100 DHO pull all divers from the water for vessel transit.',
  '1130 All divers clear. Vessel transit in progress.',
  '1200 Vessel transit complete. Resuming operations.',
  '1230 JM L/S 1230 40 fsw Station A - continue pile inspection',
  '1235 JM R/B 1235 40 fsw',
  '1300 JM L/B 1300',
  '1305 JM R/S 1305',
  '1400 End of day breakdown of equipment - compressor out of service at closeout.',
  '1430 Secured dive operations for the day.',
  '1500 Day shift crew departed.',
  '1800 Night shift crew arrived on site.',
  '1815 Night shift safety briefing conducted.',
  '1900 Night shift standby - no diving operations planned.',
  '2100 Night shift crew monitoring equipment.',
  '2200 Night shift secured.',
];

// Process each note
const events = rawNotes.map(note => {
  const cat = classifyEvent(note);
  const data = extractData(note);
  return { raw: note, category: cat, ...data };
});

// Build dive records with proper matching
interface DiveRecord {
  diveNumber: number;
  diver: string;
  lsTime?: string;
  rbTime?: string;
  lbTime?: string;
  rsTime?: string;
  depth?: number;
  station: string;
  tableUsed?: string;
  scheduleUsed?: string;
  repetitiveGroup?: string;
  bottomTime?: number;
}

const dives: DiveRecord[] = [];
const usedLB = new Set<number>();
const usedRS = new Set<number>();
let diveNum = 0;

const diveEvents = events.filter(e => e.diveOperation);

for (let i = 0; i < diveEvents.length; i++) {
  const ev = diveEvents[i];
  if (ev.lsTime) {
    diveNum++;
    const initials = (ev.diverInitials || [])[0] || 'UNK';
    const dive: DiveRecord = {
      diveNumber: diveNum,
      diver: initials,
      lsTime: ev.lsTime,
      rbTime: ev.rbTime,
      depth: ev.depthFsw,
      station: ev.raw.includes('Station A') ? 'Station A' : ev.raw.includes('Station B') ? 'Station B' : '--',
    };

    // Find matching LB for this diver
    for (let j = 0; j < diveEvents.length; j++) {
      if (usedLB.has(j)) continue;
      const e2 = diveEvents[j];
      if (e2.lbTime && (e2.diverInitials || [])[0] === initials) {
        dive.lbTime = e2.lbTime;
        usedLB.add(j);
        break;
      }
    }

    // Find matching RS for this diver
    for (let j = 0; j < diveEvents.length; j++) {
      if (usedRS.has(j)) continue;
      const e2 = diveEvents[j];
      if (e2.rsTime && (e2.diverInitials || [])[0] === initials) {
        dive.rsTime = e2.rsTime;
        usedRS.add(j);
        break;
      }
    }

    // Compute bottom time and table
    if (dive.rbTime && dive.lbTime && dive.depth) {
      const rb = parseInt(dive.rbTime.replace(':', ''));
      const lb = parseInt(dive.lbTime.replace(':', ''));
      const rbMin = Math.floor(rb / 100) * 60 + (rb % 100);
      const lbMin = Math.floor(lb / 100) * 60 + (lb % 100);
      const bottomTime = lbMin - rbMin;
      if (bottomTime > 0) {
        const table = lookupDiveTable(dive.depth, bottomTime, 'air');
        dive.tableUsed = table.tableUsed;
        dive.scheduleUsed = table.scheduleUsed;
        dive.repetitiveGroup = table.repetitiveGroup;
        dive.bottomTime = bottomTime;
      }
    }
    dives.push(dive);
  }
}

// Build risk assessment
const modelOutput = {
  date: '2026-03-05',
  day_window: '0600-2200',
  summary: {
    work_executed: ['Pile inspection', 'Riser weld inspection', 'CP survey'],
    primary_constraints: ['Crew reduction', 'Stop work'],
    qaqc_posture: [],
    carryover: [],
  },
  directives: [
    { time: '06:30', what: 'Client directed reduction of crew sizes from 3 to 2 crews', who: 'Client', impact: 'Reduced capacity' },
    { time: '09:30', what: 'Client email: reduce shift to 8 hours only today', who: 'Client' },
    { time: '10:00', what: 'Client directed stop work on Station B pending engineering review', who: 'Client' },
    { time: '11:00', what: 'DHO pull all divers from the water for vessel transit', who: 'DHO' },
    { time: '14:00', what: 'End of day breakdown of equipment - compressor out of service at closeout', who: 'Ops' },
  ],
  station_logs: [
    { station: 'Station A', crew: 'JM, CN', scope_worked: 'Pile inspection, CP survey', production: '2 piles inspected' },
    { station: 'Station B', crew: 'BW', scope_worked: 'Riser weld inspection', production: '1 riser inspected' },
  ],
  risks: [],
};
const withRisks = autoCreateRisksFromDirectives(modelOutput);

// Output the master log
const lines: string[] = [];
const log = (s: string) => lines.push(s);

log('=== MASTER LOG SAMPLE ===');
log('');
log('24-HOUR DAILY OPERATIONS LOG');
log('Wednesday, March 5, 2026');
log('DiveOps Automated Operations Record');
log('');
log('--- EXECUTIVE SUMMARY ---');
log(`On Wednesday, March 5, 2026, diving operations were conducted with ${dives.length} dive(s) completed by 3 diver(s). Maximum depth reached was 40 FSW. 5 client directive(s) were received and actioned. No safety incidents were reported. All operations conducted in accordance with applicable standards.`);
log('');

log('--- 1. DAY SHIFT OPERATIONS ---');
rawNotes.filter(n => { const h = parseInt(n.substring(0, 2)); return h < 18; }).forEach(n => log(`  ${n}`));
log('');

log('--- 2. EMAIL COORDINATION / CLIENT DIRECTIVES ---');
log('  CD-001  06:30  Client directed reduction of crew sizes from 3 to 2 crews');
log('  CD-002  09:30  Client email: reduce shift to 8 hours only today');
log('  CD-003  10:00  Client directed stop work on Station B pending engineering review');
log('  CD-004  11:00  DHO pull all divers from the water for vessel transit');
log('');

log('--- 3. NIGHT SHIFT OPERATIONS ---');
rawNotes.filter(n => { const h = parseInt(n.substring(0, 2)); return h >= 18; }).forEach(n => log(`  ${n}`));
log('');

log('--- 4. DIVE STATION LOGS ---');
log('  Dive# | Diver | Station   | L/S   | R/B   | L/B   | R/S   | Depth   | Table                | Schedule | Group');
log('  ------|-------|-----------|-------|-------|-------|-------|---------|----------------------|----------|------');
for (const d of dives) {
  const depth = d.depth ? `${d.depth} FSW` : '--';
  log(`  #${d.diveNumber}    | ${d.diver.padEnd(5)} | ${(d.station || '--').padEnd(9)} | ${d.lsTime || '--:--'} | ${d.rbTime || '--:--'} | ${d.lbTime || '--:--'} | ${d.rsTime || '--:--'} | ${depth.padEnd(7)} | ${(d.tableUsed || '--').padEnd(20)} | ${(d.scheduleUsed || '--').padEnd(8)} | ${d.repetitiveGroup || '--'}`);
}
log('');
log('  Station Activity Narrative:');
log('    Station A: JM, CN - Pile inspection, CP survey - 2 piles inspected');
log('    Station B: BW - Riser weld inspection - 1 riser inspected');
log('');

log('--- 5. NOTES ---');
log('  No safety incidents reported.');
log('');

log('--- 6. QC CLOSEOUT ---');
log('  Scope Complete: Yes - Day closed');
log('  Documentation Complete: Yes - All logs finalized');
log('  Exceptions: None');
log('');

log('--- 7. SEI ADVISORIES ---');
log(`  Advised For: Continued diving operations. ${dives.length} dive(s) completed safely.`);
log('  Advised Against: No adverse advisories');
log('');

log('--- 8. STANDING RISKS ---');
for (const r of withRisks.risks || []) {
  log(`  [${(r.risk_level || 'med').toUpperCase()}] ${r.risk_id} | ${r.trigger} | Owner: ${r.owner} | Status: ${r.status}`);
  log(`    Impact: ${r.impact}`);
}
log('');
log('--- END OF LOG ---');

console.log(lines.join('\n'));
