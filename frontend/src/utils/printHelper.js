import { escapeHtml } from './htmlHelper.js';

/**
 * printHelper.js
 * Opens a standalone print window with clean, inline-styled HTML.
 * Completely bypasses the Vue SPA shell — no Tailwind dependency.
 */

const CSPC_LOGO = '/img/CSPC_logo.png';

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #fff; color: #1e293b; font-size: 10.5pt; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .header-left img { width: 70px; height: 70px; object-fit: contain; }
  .school-name { font-size: 15pt; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; }
  .school-sub { font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; margin-top: 4px; }
  .report-date { text-align: right; }
  .report-date .label { font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #94a3b8; }
  .report-date .value { font-size: 11pt; font-weight: bold; }
  .title-section { text-align: center; margin-bottom: 24px; }
  .title-section h2 { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #1e4a8d; text-decoration: underline; text-underline-offset: 6px; }
  .title-section .subtitle { margin-top: 10px; display: inline-block; background: #f1f5f9; padding: 4px 16px; border-radius: 20px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 9px; font-size: 9pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; }
  td { border: 1px solid #e2e8f0; padding: 6px 9px; font-size: 10.5pt; color: #334155; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 8pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
  .badge-green { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
  .badge-red { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .badge-blue { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
  .badge-amber { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .badge-pink { background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; }
  .badge-gray { background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; }
  .bold { font-weight: 700; }
  .upper { text-transform: uppercase; }
  .small { font-size: 9pt; color: #475569; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .signatories { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding-top: 50px; margin-top: 20px; }
  /* In print the signature lines sit at the bottom of every page; the repeated empty
     footer of .page-wrap reserves that space so content never runs underneath them */
  .page-wrap { width: 100%; border-collapse: collapse; }
  .page-wrap > tbody > tr > td, .page-wrap > tfoot > tr > td { border: 0; padding: 0; }
  .page-wrap-space { height: 26mm; }
  @media print {
    .signatories { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; padding: 0 0 4mm; background: #fff; }
  }
  .signatory { text-align: center; }
  .signatory-line { border-bottom: 1.5px solid #1e293b; margin: 0 auto 8px; width: 80%; }
  .signatory-label { font-size: 9pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; }
  .expiry-ok { color: #059669; font-weight: 700; }
  .expiry-exp { color: #dc2626; font-weight: 900; }
  .na { color: #cbd5e1; }
  .total-row td { background: #f1f5f9 !important; font-weight: 900; font-size: 10pt; }
  .legend { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 24px; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 9pt; font-weight: 700; text-transform: uppercase; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  /* Compact report (Emergency registry): smaller text and tighter spacing so it fits the page */
  .compact-report .header { padding-bottom: 8px; margin-bottom: 10px; }
  .compact-report .header-left img { width: 52px; height: 52px; }
  .compact-report .school-name { font-size: 14pt; }
  .compact-report .school-sub { font-size: 8.5pt; margin-top: 2px; }
  .compact-report .report-date .label { font-size: 8pt; }
  .compact-report .report-date .value { font-size: 11pt; }
  .compact-report .title-section { margin-bottom: 10px; }
  .compact-report .title-section h2 { font-size: 12.5pt; text-underline-offset: 4px; }
  .compact-report .title-section .subtitle { margin-top: 6px; padding: 2px 12px; font-size: 8.5pt; }
  .compact-report table { table-layout: fixed; margin-bottom: 12px; }
  .compact-report th { padding: 5px 7px; font-size: 8.5pt; letter-spacing: .05em; color: #334155; }
  .compact-report td { padding: 5px 7px; font-size: 10pt; line-height: 1.35; overflow-wrap: anywhere; }
  .compact-report .small { font-size: 8.5pt; }
  .compact-report .badge { padding: 1px 7px; font-size: 8pt; }
  .compact-report .house-head { margin: 12px 0 6px; padding: 6px 10px; background: #f1f5f9; border-left: 4px solid #1e4a8d; border-radius: 4px; }
  .compact-report .house-name { font-size: 11.5pt; font-weight: 900; text-transform: uppercase; color: #0f172a; letter-spacing: .04em; }
  .compact-report .house-count { margin-left: 6px; font-size: 9.5pt; font-weight: 700; color: #1e4a8d; }
  .compact-report .house-meta { margin-top: 2px; font-size: 9.5pt; font-weight: 600; color: #334155; }
  .compact-report .signatories { padding-top: 28px; margin-top: 8px; }
  .compact-report .signatory-label { font-size: 8.5pt; }
  .compact-report .print-footer { margin-top: 16px; padding-top: 8px; font-size: 8pt; }
  .print-footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 8.5pt; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
  .print-footer strong { color: #1e4a8d; font-weight: 900; }
`;

function getReportDate() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function openPrintWindow(html, title, landscape = false) {
  // Remove any pre-existing print iframe
  const existingFrame = document.getElementById('cspc-print-iframe');
  if (existingFrame) {
    try { existingFrame.remove(); } catch(e) {}
  }

  // Create an invisible iframe attached to current document
  const iframe = document.createElement('iframe');
  iframe.id = 'cspc-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = '0px';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const pageCSS = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${landscape ? '0.8cm 1cm' : '1.5cm'}; }`;
  const frameWin = iframe.contentWindow || iframe.contentDocument;
  const doc = frameWin.document || frameWin;

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>${BASE_STYLES}${pageCSS}</style>
</head>
<body>
  <div style="max-width:${landscape ? '100%' : '800px'};margin:0 auto;padding:${landscape ? '0' : '20px'};">
    <table class="page-wrap">
      <tbody><tr><td>${html}</td></tr></tbody>
      <tfoot><tr><td><div class="page-wrap-space"></div></td></tr></tfoot>
    </table>
  </div>
</body>
</html>`);
  doc.close();

  // Trigger print cleanly inside the iframe
  setTimeout(() => {
    try {
      frameWin.focus();
      frameWin.print();
    } catch (e) {
      console.error('Print execution failed:', e);
    } finally {
      setTimeout(() => {
        try { iframe.remove(); } catch (err) {}
      }, 1000);
    }
  }, 300);
}

/** MASTERLIST REPORT */
export function printMasterlist(houses, reportDate) {
  const rows = (houses || []).map((h, i) => `
    <tr>
      <td class="text-center bold small">${i + 1}</td>
      <td><div class="bold upper">${escapeHtml(h.name || '')}</div><div class="small">${escapeHtml(h.address || '')}</div></td>
      <td><div class="bold">${escapeHtml(h.owner_name || 'N/A')}</div><div class="small">${escapeHtml(h.owner_phone || '')}</div></td>
      <td class="text-center">
        <span style="color:#2563eb;font-weight:900">${escapeHtml(h.male_rooms || 0)}M</span>&nbsp;
        <span style="color:#db2777;font-weight:900">${escapeHtml(h.female_rooms || 0)}F</span>
        <div class="small">${escapeHtml(h.total_rooms || 0)} Total</div>
      </td>
      <td class="text-center bold">${escapeHtml(h.total_capacity || 0)} Pax</td>
      <td class="text-center">
        <div class="bold" style="color:#1e4a8d">${escapeHtml(h.current_occupants || 0)}</div><div class="small">Students</div>
        <div class="small" style="margin-top:2px">
          <span style="color:#2563eb;font-weight:900">${escapeHtml(h.male_count || 0)}B</span>&nbsp;
          <span style="color:#db2777;font-weight:900">${escapeHtml(h.female_count || 0)}G</span>
        </div>
      </td>
      <td class="text-center"><span class="badge badge-green">${escapeHtml(h.house_status || '')}</span></td>
    </tr>`).join('');

  openPrintWindow(`
    <div class="header">
      <div class="header-left">
        <img src="${CSPC_LOGO}" alt="CSPC" onerror="this.style.display='none'" />
        <div>
          <div class="school-name">Camarines Sur Polytechnic Colleges</div>
          <div class="school-sub">Office of Student Affairs and Services (SASO)</div>
        </div>
      </div>
      <div class="report-date"><div class="label">Report Date</div><div class="value">${escapeHtml(reportDate || getReportDate())}</div></div>
    </div>
    <div class="title-section"><h2>Accredited Boarding Houses Masterlist</h2></div>
    <table>
      <thead><tr>
        <th class="text-center">#</th><th>Boarding House</th><th>Owner / Contact</th>
        <th class="text-center">Rooms (M/F)</th><th class="text-center">Capacity</th>
        <th class="text-center">Occupants</th><th class="text-center">Status</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="text-center small">No accredited boarding houses on record.</td></tr>'}</tbody>
    </table>
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Coordinator</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Approved By: SASO Director</div></div>
    </div>
    <div class="print-footer">
      Camarines Sur Polytechnic Colleges &mdash; Office of Student Affairs and Services (SASO) &bull; Official Institutional Document &bull; &copy; 2026
    </div>`, 'Accredited Masterlist Report');
}

/** COMPLIANCE REPORT */
export function printCompliance(houses, reportDate) {
  function expiryCell(dateStr) {
    if (!dateStr) return '<span class="na">N/A</span>';
    const d = new Date(dateStr);
    const isExp = d < new Date();
    return `<span class="${isExp ? 'expiry-exp' : 'expiry-ok'}">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
  }

  const rows = (houses || []).map(h => `
    <tr>
      <td><div class="bold upper">${escapeHtml(h.name || '')}</div><div class="small">${escapeHtml(h.owner_name || 'N/A')}</div></td>
      <td class="text-center"><span class="badge ${h.compliance_status === 'active' ? 'badge-green' : 'badge-red'}">${escapeHtml(h.compliance_status || '')}</span></td>
      <td class="text-center">${expiryCell(h.expiry_permit_business_form)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_cedula)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_dti)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_barangay)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_building)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_zoning)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_sanitary)}</td>
      <td class="text-center">${expiryCell(h.expiry_permit_fire)}</td>
    </tr>`).join('');

  openPrintWindow(`
    <div class="header">
      <div class="header-left">
        <img src="${CSPC_LOGO}" alt="CSPC" onerror="this.style.display='none'" />
        <div>
          <div class="school-name">Camarines Sur Polytechnic Colleges</div>
          <div class="school-sub">Office of Student Affairs and Services (SASO)</div>
        </div>
      </div>
      <div class="report-date"><div class="label">Generated On</div><div class="value">${escapeHtml(reportDate || getReportDate())}</div></div>
    </div>
    <div class="title-section"><h2>Accreditation Compliance Audit Report</h2></div>
    <div class="legend">
      <div class="legend-item"><span class="dot" style="background:#059669"></span> Valid / Active</div>
      <div class="legend-item"><span class="dot" style="background:#dc2626"></span> Expired / Action Required</div>
      <span class="small" style="margin-left:auto">All permits must be renewed annually.</span>
    </div>
    <table>
      <thead><tr>
        <th>House / Owner</th><th class="text-center">Compliance</th>
        <th class="text-center">Business</th><th class="text-center">Cedula</th>
        <th class="text-center">DTI</th><th class="text-center">Brgy</th>
        <th class="text-center">Building</th><th class="text-center">Zoning</th>
        <th class="text-center">Sanitary</th><th class="text-center">Fire</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center small">No records found.</td></tr>'}</tbody>
    </table>
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Coordinator</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Approved By: SASO Director</div></div>
    </div>
    <div class="print-footer">
      Camarines Sur Polytechnic Colleges &mdash; Office of Student Affairs and Services (SASO) &bull; Official Institutional Document &bull; &copy; 2026
    </div>`, 'Compliance Audit Report', true);
}

/** EMERGENCY REGISTRY REPORT */
export function printEmergencyRegistry(residents, targetArea, reportDate, courseNameMap = {}) {
  // Spells out each resident's course in full for the printed document
  // (e.g. "BSIT — BS Information Technology"), falling back to the bare
  // code if it's not in the lookup (e.g. legacy/unmapped free-text values).
  const formatCourse = (rawCourse) => {
    const code = (rawCourse || '').trim();
    if (!code) return 'N/A';
    const fullName = courseNameMap[code];
    return fullName ? `${code} — ${fullName}` : code;
  };

  // Group residents by boarding house name
  const grouped = {};
  (residents || []).forEach(r => {
    const houseKey = r.house_name || 'Unassigned Boarding House';
    if (!grouped[houseKey]) {
      grouped[houseKey] = {
        location: r.house_barangay ? `Brgy. ${r.house_barangay}, Nabua, Camarines Sur` : (r.house_location || ''),
        owner: r.house_owner_name || '',
        phone: r.house_owner_phone || '',
        status: r.house_status || 'accredited',
        list: []
      };
    }
    grouped[houseKey].list.push(r);
  });

  const houseKeys = Object.keys(grouped);

  const normSex = (s) => (s || '').trim().toLowerCase();
  const totalMale = (residents || []).filter(r => normSex(r.sex) === 'male').length;
  const totalFemale = (residents || []).filter(r => normSex(r.sex) === 'female').length;

  const houseTablesHtml = houseKeys.length === 0
    ? '<table><tbody><tr><td class="text-center small">No residency records found.</td></tr></tbody></table>'
    : houseKeys.map(houseName => {
        const group = grouped[houseName];
        const rows = group.list.map(r => `
          <tr>
            <td>
              <div class="bold upper">${escapeHtml(r.resident_name || '')}</div>
              <div class="small">${escapeHtml(r.student_email || '')} | ${escapeHtml(r.student_phone || 'N/A')}</div>
              ${r.home_address ? `<div class="small bold" style="color:#2563eb;margin-top:2px;">Home Address: ${escapeHtml(r.home_address)}</div>` : ''}
            </td>
            <td class="text-center"><span class="badge ${normSex(r.sex) === 'male' ? 'badge-blue' : normSex(r.sex) === 'female' ? 'badge-pink' : 'badge-gray'}">${escapeHtml(r.sex || 'N/A')}</span></td>
            <td><div class="bold upper">${escapeHtml(formatCourse(r.course))}</div><div class="small">Year: ${escapeHtml(r.year_level || 'N/A')}</div></td>
            <td><div class="bold">Room #${escapeHtml(r.room_number || 'N/A')}</div></td>
            <td class="bold">${escapeHtml(r.guardian_name || 'N/A')}</td>
            <td class="text-right bold" style="color:#dc2626">${escapeHtml(r.emergency_contact || 'N/A')}</td>
          </tr>`).join('');

        return `
          <div class="house-head">
            <div class="house-name">
              ${escapeHtml(houseName)} <span class="house-count">(${group.list.length} Resident${group.list.length === 1 ? '' : 's'})</span>
              ${group.status !== 'accredited' ? '<span class="badge badge-amber" style="margin-left:8px">Archived Property</span>' : ''}
            </div>
            ${group.location ? `<div class="house-meta">Address: ${escapeHtml(group.location)}</div>` : ''}
            ${(group.owner || group.phone) ? `<div class="house-meta">Owner: ${escapeHtml(group.owner || 'N/A')}${group.phone ? ` &nbsp;&bull;&nbsp; Contact: ${escapeHtml(group.phone)}` : ''}</div>` : ''}
          </div>
          <table>
            <colgroup><col style="width:31%"><col style="width:8%"><col style="width:23%"><col style="width:9%"><col style="width:15%"><col style="width:14%"></colgroup>
            <thead><tr>
              <th>Student Resident</th><th class="text-center">Sex</th><th>Course / Year</th>
              <th>Room</th><th>Guardian</th><th class="text-right">Emergency Contact</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }).join('');

  openPrintWindow(`<div class="compact-report">
    <div class="header">
      <div class="header-left">
        <img src="${CSPC_LOGO}" alt="CSPC" onerror="this.style.display='none'" />
        <div>
          <div class="school-name">Camarines Sur Polytechnic Colleges</div>
          <div class="school-sub">Office of Student Affairs and Services (SASO)</div>
        </div>
      </div>
      <div class="report-date"><div class="label">Report Date</div><div class="value">${escapeHtml(reportDate || getReportDate())}</div></div>
    </div>
    <div class="title-section">
      <h2>Emergency Registry Residence Report</h2>
      <div class="subtitle">Summary of Lists per Boarding House | Scope: ${escapeHtml(targetArea || 'Unified Registry')}</div>
      <div class="subtitle" style="margin-top:6px">
        Total Residents: ${(residents || []).length} &nbsp;&bull;&nbsp;
        <span style="color:#2563eb;font-weight:900">Boys: ${totalMale}</span> &nbsp;&bull;&nbsp;
        <span style="color:#db2777;font-weight:900">Girls: ${totalFemale}</span>
      </div>
    </div>
    ${houseTablesHtml}
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Coordinator</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Approved By: SASO Director</div></div>
    </div>
    <div class="print-footer">
      Camarines Sur Polytechnic Colleges &mdash; Office of Student Affairs and Services (SASO) &bull; Official Institutional Document &bull; &copy; 2026
    </div>
  </div>`, 'Emergency Registry Residence Report', true);
}

/** TRANSACTIONS REPORT */
export function printTransactions(transactions, reportDate) {
  const rows = (transactions || []).map(t => `
    <tr>
      <td class="small bold" style="color:#94a3b8">#RES-${escapeHtml(t.id)}</td>
      <td class="bold upper">${escapeHtml(t.student_name || '')}</td>
      <td>${escapeHtml(t.house_name || '')}</td>
      <td class="text-center"><span class="badge ${t.status === 'confirmed' ? 'badge-green' : 'badge-blue'}">${escapeHtml(t.status || '')}</span></td>
      <td class="text-center"><span class="badge ${t.payment_status === 'paid' ? 'badge-green' : 'badge-amber'}">${escapeHtml(t.payment_status || '')}</span></td>
      <td class="text-center">${t.payment_method === 'paymongo' ? 'Online (GCash/Card)' : 'Cash'}</td>
      <td class="text-right bold">&#8369;${parseFloat(t.room_price || 0).toLocaleString()}</td>
    </tr>`).join('');

  const totalValue = (transactions || []).reduce((s, t) => s + parseFloat(t.room_price || 0), 0);

  openPrintWindow(`
    <div class="header">
      <div class="header-left">
        <img src="${CSPC_LOGO}" alt="CSPC" onerror="this.style.display='none'" />
        <div>
          <div class="school-name">Camarines Sur Polytechnic Colleges</div>
          <div class="school-sub">Office of Student Affairs and Services (SASO)</div>
        </div>
      </div>
      <div class="report-date"><div class="label">Report Date</div><div class="value">${escapeHtml(reportDate || getReportDate())}</div></div>
    </div>
    <div class="title-section"><h2>Student Reservation History</h2></div>
    <table>
      <thead><tr>
        <th>Res ID</th><th>Student Resident</th><th>Boarding House</th>
        <th class="text-center">Status</th><th class="text-center">Payment</th><th class="text-center">Paid Via</th><th class="text-right">Rent/Mo</th>
      </tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="text-center small">No transaction records found.</td></tr>'}
        <tr class="total-row">
          <td colspan="6" class="text-right small">Monthly Value Capacity</td>
          <td class="text-right">&#8369;${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Coordinator</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Approved By: SASO Director</div></div>
    </div>
    <div class="print-footer">
      Camarines Sur Polytechnic Colleges &mdash; Office of Student Affairs and Services (SASO) &bull; Official Institutional Document &bull; &copy; 2026
    </div>`, 'Student Reservation Report');
}

