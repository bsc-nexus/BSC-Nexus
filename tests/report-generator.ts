import fs from 'fs';
import path from 'path';
import { TestSummary, TestResult } from './types.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateHTMLReport(summary: TestSummary): string {
  const totalTests = typeof summary.totalTests === 'number' ? summary.totalTests : 0;
  const passedTests = typeof summary.passedTests === 'number' ? summary.passedTests : 0;
  const failedTests = typeof summary.failedTests === 'number' ? summary.failedTests : 0;
  const durationMs = typeof summary.durationMs === 'number' ? summary.durationMs : 0;

  const rows = summary.results.map((r: TestResult) => {
    const duration = typeof r.duration === 'number' ? r.duration : 0;
    const statusIcon = r.passed ? '✅' : '❌';
    const category = r.category || '';
    const details = r.details || '';

    return `
      <tr>
        <td>${escapeHtml(category)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td style="text-align:center;">${statusIcon}</td>
        <td style="text-align:right;">${Number(duration).toLocaleString()} ms</td>
        <td>${escapeHtml(details)}</td>
      </tr>
    `;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BSC Nexus Test Report</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; background: #0b0b10; color: #f5f5f5; }
    h1 { margin-bottom: 0; }
    .summary { margin: 12px 0 24px; }
    .summary span { margin-right: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #333; font-size: 14px; }
    th { background: #151520; text-align: left; }
    tr:nth-child(even) { background: #14141c; }
    tr:nth-child(odd) { background: #101018; }
    .passed { color: #3fcf8e; }
    .failed { color: #ff5573; }
  </style>
</head>
<body>
  <h1>BSC Nexus QA Report</h1>
  <div class="summary">
    <span>Total: <strong>${totalTests}</strong></span>
    <span class="passed">Passed: <strong>${passedTests}</strong></span>
    <span class="failed">Failed: <strong>${failedTests}</strong></span>
    <span>Duration: <strong>${Number(durationMs).toLocaleString()} ms</strong></span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Test</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  return html;
}

export async function saveHTMLReport(summary: TestSummary): Promise<void> {
  const html = generateHTMLReport(summary);
  const outputPath = path.join(process.cwd(), 'test-report.html');
  await fs.promises.writeFile(outputPath, html, 'utf8');
  console.log(`\n📄 HTML report saved to: ${outputPath}`);
}
