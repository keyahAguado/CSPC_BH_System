/**
 * printHelper.js
 * Opens a standalone print window with clean, inline-styled HTML.
 * Completely bypasses the Vue SPA shell — no Tailwind dependency.
 */

const CSPC_LOGO = '/img/CSPC_logo.png';

const BASE_STYLES = `
  @page { margin: 1.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #fff; color: #1e293b; font-size: 10pt; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .header-left img { width: 70px; height: 70px; object-fit: contain; }
  .school-name { font-size: 15pt; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; }
  .school-sub { font-size: 7pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; margin-top: 4px; }
  .report-date { text-align: right; }
  .report-date .label { font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #94a3b8; }
  .report-date .value { font-size: 10pt; font-weight: bold; }
  .title-section { text-align: center; margin-bottom: 24px; }
  .title-section h2 { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #1e4a8d; text-decoration: underline; text-underline-offset: 6px; }
  .title-section .subtitle { margin-top: 10px; display: inline-block; background: #f1f5f9; padding: 4px 16px; border-radius: 20px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #475569; }
  td { border: 1px solid #e2e8f0; padding: 7px 10px; font-size: 9pt; color: #334155; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
  .badge-green { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
  .badge-red { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .badge-blue { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
  .badge-amber { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .badge-pink { background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; }
  .bold { font-weight: 700; }
  .upper { text-transform: uppercase; }
  .small { font-size: 7.5pt; color: #64748b; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .signatories { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; padding-top: 50px; margin-top: 20px; }
  .signatory { text-align: center; }
  .signatory-line { border-bottom: 1.5px solid #1e293b; margin: 0 auto 8px; width: 80%; }
  .signatory-label { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; }
  .expiry-ok { color: #059669; font-weight: 700; }
  .expiry-exp { color: #dc2626; font-weight: 900; }
  .na { color: #cbd5e1; }
  .total-row td { background: #f1f5f9 !important; font-weight: 900; font-size: 10pt; }
  .legend { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 24px; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
`;

function getReportDate() {
  return new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function openPrintWindow(html, title, landscape = false) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site, then try again.');
    return;
  }
  const pageCSS = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 1.5cm; }`;
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${pageCSS}${BASE_STYLES}</style>
</head>
<body>
  <div style="max-width:${landscape ? '100%' : '800px'};margin:0 auto;padding:20px;">
    ${html}
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 600);
    });
  <\/script>
</body>
</html>`);
  win.document.close();
}

/** MASTERLIST REPORT */
export function printMasterlist(houses, reportDate) {
  const rows = (houses || []).map((h, i) => `
    <tr>
      <td class="text-center bold small">${i + 1}</td>
      <td><div class="bold upper">${h.name || ''}</div><div class="small">${h.address || ''}</div></td>
      <td><div class="bold">${h.owner_name || 'N/A'}</div><div class="small">${h.owner_phone || ''}</div></td>
      <td class="text-center">
        <span style="color:#2563eb;font-weight:900">${h.male_rooms || 0}M</span>&nbsp;
        <span style="color:#db2777;font-weight:900">${h.female_rooms || 0}F</span>
        <div class="small">${h.total_rooms || 0} Total</div>
      </td>
      <td class="text-center bold">${h.total_capacity || 0} Pax</td>
      <td class="text-center"><div class="bold" style="color:#1e4a8d">${h.current_occupants || 0}</div><div class="small">Students</div></td>
      <td class="text-center"><span class="badge badge-green">${h.house_status || ''}</span></td>
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
      <div class="report-date"><div class="label">Report Date</div><div class="value">${reportDate || getReportDate()}</div></div>
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
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Staff</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Noted By: SASO Director</div></div>
    </div>`, 'Accredited Masterlist Report');
}

/** COMPLIANCE REPORT */
export function printCompliance(houses, reportDate) {
  function expiryCell(dateStr) {
    if (!dateStr) return '<span class="na">N/A</span>';
    const d = new Date(dateStr);
    const isExp = d < new Date();
    return `<span class="${isExp ? 'expiry-exp' : 'expiry-ok'}">${d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })}</span>`;
  }

  const rows = (houses || []).map(h => `
    <tr>
      <td><div class="bold upper">${h.name || ''}</div><div class="small">${h.owner_name || 'N/A'}</div></td>
      <td class="text-center"><span class="badge ${h.compliance_status === 'active' ? 'badge-green' : 'badge-red'}">${h.compliance_status || ''}</span></td>
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
      <div class="report-date"><div class="label">Generated On</div><div class="value">${reportDate || getReportDate()}</div></div>
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
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Audited By: Compliance Officer</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Noted By: SASO Director</div></div>
    </div>`, 'Compliance Audit Report', true);
}

/** EMERGENCY REGISTRY REPORT */
export function printEmergencyRegistry(residents, targetArea, reportDate) {
  const rows = (residents || []).map(r => `
    <tr>
      <td><div class="bold upper">${r.resident_name || ''}</div><div class="small">${r.student_email || ''}</div></td>
      <td class="text-center"><span class="badge ${r.sex === 'Male' ? 'badge-blue' : 'badge-pink'}">${r.sex || 'N/A'}</span></td>
      <td><div class="bold upper">${r.course || 'N/A'}</div><div class="small">Year: ${r.year_level || 'N/A'}</div></td>
      <td><div class="bold">${r.house_name || ''}</div><div class="small">${r.house_location || ''} | RM #${r.room_number || 'N/A'}</div></td>
      <td class="bold">${r.guardian_name || 'N/A'}</td>
      <td class="text-right bold" style="color:#dc2626">${r.emergency_contact || 'N/A'}</td>
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
      <div class="report-date"><div class="label">Report Date</div><div class="value">${reportDate || getReportDate()}</div></div>
    </div>
    <div class="title-section">
      <h2>Emergency Student Residency Registry</h2>
      <div class="subtitle">Target Zone: ${targetArea || 'Unified Registry'}</div>
    </div>
    <table>
      <thead><tr>
        <th>Student Resident</th><th class="text-center">Sex</th><th>Course / Year</th>
        <th>House &amp; Room</th><th>Guardian</th><th class="text-right">Emergency Contact</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="text-center small">No residency records found.</td></tr>'}</tbody>
    </table>
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Safety Officer</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Noted By: Disaster Response Team</div></div>
    </div>`, 'Emergency Student Residency Registry');
}

/** TRANSACTIONS REPORT */
export function printTransactions(transactions, reportDate) {
  const rows = (transactions || []).map(t => `
    <tr>
      <td class="small bold" style="color:#94a3b8">#RES-${t.id}</td>
      <td class="bold upper">${t.student_name || ''}</td>
      <td>${t.house_name || ''}</td>
      <td class="text-center"><span class="badge ${t.status === 'confirmed' ? 'badge-green' : 'badge-blue'}">${t.status || ''}</span></td>
      <td class="text-center"><span class="badge ${t.payment_status === 'paid' ? 'badge-green' : 'badge-amber'}">${t.payment_status || ''}</span></td>
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
      <div class="report-date"><div class="label">Report Date</div><div class="value">${reportDate || getReportDate()}</div></div>
    </div>
    <div class="title-section"><h2>Student Reservation History</h2></div>
    <table>
      <thead><tr>
        <th>Res ID</th><th>Student Resident</th><th>Boarding House</th>
        <th class="text-center">Status</th><th class="text-center">Payment</th><th class="text-right">Rent/Mo</th>
      </tr></thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center small">No transaction records found.</td></tr>'}
        <tr class="total-row">
          <td colspan="5" class="text-right small">Monthly Value Capacity</td>
          <td class="text-right">&#8369;${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
    <div class="signatories">
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Prepared By: SASO Administrator</div></div>
      <div class="signatory"><div class="signatory-line"></div><div class="signatory-label">Noted By: SASO Director</div></div>
    </div>`, 'Student Reservation Report');
}

