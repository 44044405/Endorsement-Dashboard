// One-time migration: parse the Endorsement Master List markdown table dump
// into the new Endorsement Dashboard case schema.
const fs = require('fs');
const path = require('path');

const RAW_PATH = path.join(__dirname, 'master_list_raw.md');
const OUT_PATH = path.join(__dirname, 'seed_cases.json');

const TYPE_MAP = {
  'policy cancellation': 'Policy Cancellation',
  'ncd withdrawal': 'Ncd Withdrawal', 'ncd withdraw': 'Ncd Withdrawal',
  'change address': 'Change Address',
  'change owner name': 'Change Owner Name',
  'change model': 'Change Model',
  'change brn no': 'Change BRN No', 'change brn': 'Change BRN No',
  'extend to thai': 'Extend to Thai',
  'extention': 'Extention', 'extension': 'Extention', 'extention  policy': 'Extention', 'extention policy': 'Extention',
  'add agreed value': 'Add Agreed Value',
  'add on e-halling': 'Add On E-halling',
  'add on windscreen': 'Add On Windscreen',
  'waive excess': 'Waive Excess',
  'ncd entitlement': 'NCD Entitlement',
  'cancel cn': 'Cancel CN',
  'retention': 'Retention',
  'ncd recovery': 'NCD Recovery',
  'reinstant coverage': 'Reinstant Coverage',
  'update passport no': 'Update Passport No',
  'change vehicle class': 'Change Vehicle Class',
  'change driver name': 'Change Driver Name',
};

const MONTHS = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};

function toISO(raw) {
  if (!raw) return '';
  raw = raw.trim();
  // DD-Mon-YYYY (e.g. "28-Apr-2026")
  let m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) { const mon = MONTHS[m[2].toLowerCase()]; if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`; }
  // DD/MM/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // M/D/YYYY (US-style, seen in a couple rows like "7/29/2026")
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return ''; // unparseable date — leave blank rather than guess
}

function toMoney(raw) {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/RM/i,'').replace(/,/g,'').trim());
  return isNaN(n) ? 0 : n;
}

function normType(raw) {
  if (!raw) return '';
  const key = raw.trim().toLowerCase().replace(/\s+/g,' ');
  return TYPE_MAP[key] || raw.trim();
}

function deriveStatus(row) {
  const letter = (row.endorsementLetter||'').trim().toLowerCase();
  const followup = (row.followupStatus||'').trim();
  const done = (row.endorsementDone||'').trim().toUpperCase()==='TRUE';
  if (letter.includes('done')) return 'done';
  if (letter.includes('send to client')) return 'pendingletter';
  if (letter.includes('pending')) return 'pendingletter';
  if (followup) return 'followup';
  if (done) return 'submitted';
  return 'new';
}

function uid(i) { return 'mig' + Date.now().toString(36) + i.toString(36); }

// --- Parse the raw markdown table -----------------------------------------
const raw = fs.readFileSync(RAW_PATH, 'utf8');
const lines = raw.split('\n');

// Find the header row of the MAIN data table (the one with "Drive Link" and "Vehicle Number").
const headerIdx = lines.findIndex(l => l.includes('Drive Link') && l.includes('Vehicle Number') && l.includes('Endorsement Type') && l.includes('PIC'));
if (headerIdx === -1) { console.error('Could not find main table header'); process.exit(1); }

const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim().startsWith('|'));

const cases = [];
let skipped = 0;
let idx = 0;
for (const line of dataLines) {
  const cells = line.split('|').slice(1, -1).map(c => c.trim().replace(/\\-/g,'-').replace(/\\\./g,'.'));
  if (cells.length < 18) { skipped++; continue; }
  const [driveLink, enquiryDate, ins, plate, type, submittedDate, pic, remark, endorsementDone,
    ncdUpdated, endorsementLetter, followupStatus, gross, nett, submittedAmount, premium, refundCol, status] = cells;

  if (!plate) { skipped++; continue; } // incomplete row, no vehicle number — skip

  idx++;
  const refund = toMoney(refundCol) || toMoney(premium) || toMoney(submittedAmount);
  // The Sheet's final free-text "Status" column carries notes like "Not submit
  // yet - Pending customer chop & sign" that don't fit the Endorsement
  // Letter/Done flags used for status derivation — fold it into followup so
  // it isn't silently dropped.
  const followupCombined = [followupStatus, status].map(s => (s||'').trim()).filter(Boolean).join(' · ');
  cases.push({
    id: uid(idx),
    plate: plate.replace(/\s+/g,' ').trim().toUpperCase(),
    type: normType(type),
    ins: (ins||'').trim(),
    pic: (pic||'').trim(),
    remark: (remark||'').trim(),
    bank: '',
    followup: followupCombined,
    status: deriveStatus({endorsementLetter, followupStatus, endorsementDone}),
    submittedDate: toISO(submittedDate),
    enquiryDate: toISO(enquiryDate),
    refund,
    gross: toMoney(gross),
    nett: toMoney(nett),
    createdAt: Date.now(),
    driveUrl: /^https?:\/\//i.test(driveLink) ? driveLink : '',
    demo: false,
  });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(cases, null, 2));
console.log(`Parsed ${cases.length} cases, skipped ${skipped} incomplete/blank rows.`);
const statusCounts = {};
cases.forEach(c => statusCounts[c.status] = (statusCounts[c.status]||0)+1);
console.log('Status breakdown:', statusCounts);
const unmappedTypes = [...new Set(cases.filter(c => !Object.values(TYPE_MAP).includes(c.type)).map(c => c.type))];
console.log('Types not in TYPE_MAP (kept as raw text):', unmappedTypes);
