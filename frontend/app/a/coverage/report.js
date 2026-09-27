const CSV_COLUMNS = [
  'Session', 'Surface', 'Method', 'View', 'Status', 'Hits', 'Succeeded', 'Failed',
  'First visited (UTC)', 'Last visited (UTC)',
];

const PDF_MARGIN = 40;
const PDF_COLORS = {
  heading: [24, 24, 27],
  muted: [113, 113, 122],
  headFill: [109, 40, 217],
  gridLine: [228, 228, 231],
  visited: { text: [21, 128, 61], fill: [220, 252, 231] },
  notVisited: { text: [185, 28, 28], fill: [254, 226, 226] },
  neverSucceeded: { text: [161, 98, 7], fill: [254, 249, 195] },
};

export function summarize(views) {
  const visited = views.filter((v) => v.visited).length;
  return {
    total: views.length,
    visited,
    succeeded: views.filter((v) => v.success_count > 0).length,
    neverSucceeded: views.filter((v) => v.visited && v.success_count === 0).length,
    pct: views.length ? Math.round((visited / views.length) * 100) : 0,
  };
}

function statusLabel(view) {
  return view.visited ? 'Visited' : 'Not visited';
}

function fileName(sessionId, generatedAt, extension) {
  const stamp = generatedAt.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return `crawler-coverage-${sessionId}-${stamp}.${extension}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvField(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Frontend views never record failures, so their Succeeded/Failed cells are left empty
export function buildCsv({ sessionId, frontendViews, apiViews }) {
  const rows = [...frontendViews, ...apiViews].map((v) => {
    const isApi = v.surface === 'api';
    return [
      sessionId,
      isApi ? 'API' : 'Frontend',
      v.method,
      v.path,
      statusLabel(v),
      v.hit_count,
      isApi ? v.success_count : '',
      isApi ? v.failure_count : '',
      v.first_visited_at || '',
      v.last_visited_at || '',
    ];
  });
  return [CSV_COLUMNS, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function exportCsv(report) {
  const blob = new Blob([buildCsv(report)], { type: 'text/csv;charset=utf-8' });
  download(blob, fileName(report.sessionId, new Date(), 'csv'));
}

function pdfTableStyles() {
  return {
    theme: 'grid',
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 4,
      lineColor: PDF_COLORS.gridLine,
      lineWidth: 0.5,
    },
    headStyles: { fillColor: PDF_COLORS.headFill, textColor: 255, fontStyle: 'bold' },
  };
}

function pdfSectionTitle(doc, text) {
  let y = doc.lastAutoTable.finalY + 30;
  if (y > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    y = PDF_MARGIN + 10;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.heading);
  doc.text(text, PDF_MARGIN, y);
  return y + 10;
}

function pdfViewsTable(doc, autoTable, title, views, showOutcome) {
  const summary = summarize(views);
  const outcome = showOutcome ? `, ${summary.neverSucceeded} never succeeded` : '';
  const startY = pdfSectionTitle(doc, `${title} (${summary.visited}/${summary.total} visited${outcome})`);
  const succeededColumn = showOutcome ? 4 : -1;

  autoTable(doc, {
    ...pdfTableStyles(),
    startY,
    head: [[
      'Status', 'Method', 'View', 'Hits',
      ...(showOutcome ? ['Succeeded', 'Failed'] : []),
      'First visited (UTC)', 'Last visited (UTC)',
    ]],
    body: views.map((v) => [
      statusLabel(v),
      v.method,
      v.path,
      v.hit_count,
      ...(showOutcome ? [v.success_count, v.failure_count] : []),
      v.first_visited_at || '-',
      v.last_visited_at || '-',
    ]),
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const view = views[data.row.index];
      let colors = null;
      if (data.column.index === 0) {
        colors = view.visited ? PDF_COLORS.visited : PDF_COLORS.notVisited;
      } else if (data.column.index === succeededColumn && view.visited && view.success_count === 0) {
        colors = PDF_COLORS.neverSucceeded;
      }
      if (colors) {
        data.cell.styles.textColor = colors.text;
        data.cell.styles.fillColor = colors.fill;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
}

export async function buildPdf(report, generatedAt = new Date()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { sessionId, frontendViews, apiViews } = report;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...PDF_COLORS.heading);
  doc.text('TaintedPort - Crawler Coverage Report', PDF_MARGIN, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Session: ${sessionId}`, PDF_MARGIN, 72);
  doc.text(`Generated: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, PDF_MARGIN, 86);

  const all = summarize([...frontendViews, ...apiViews]);
  const frontend = summarize(frontendViews);
  const api = summarize(apiViews);
  autoTable(doc, {
    ...pdfTableStyles(),
    startY: 100,
    tableWidth: 'wrap',
    head: [['', 'Visited', 'Total', 'Coverage', 'Succeeded at least once', 'Visited, never succeeded']],
    body: [
      ['All views', all.visited, all.total, `${all.pct}%`, all.succeeded, all.neverSucceeded],
      ['Frontend views', frontend.visited, frontend.total, `${frontend.pct}%`, '-', '-'],
      ['API endpoints', api.visited, api.total, `${api.pct}%`, api.succeeded, api.neverSucceeded],
    ],
    columnStyles: { 0: { fontStyle: 'bold' } },
  });

  pdfViewsTable(doc, autoTable, 'Frontend views', frontendViews, false);
  pdfViewsTable(doc, autoTable, 'API endpoints', apiViews, true);

  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`Session ${sessionId}`, PDF_MARGIN, height - 20);
    doc.text(`Page ${page} of ${pages}`, width - PDF_MARGIN, height - 20, { align: 'right' });
  }
  return doc;
}

export async function exportPdf(report) {
  const generatedAt = new Date();
  const doc = await buildPdf(report, generatedAt);
  doc.save(fileName(report.sessionId, generatedAt, 'pdf'));
}
