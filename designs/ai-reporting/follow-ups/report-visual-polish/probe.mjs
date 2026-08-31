// Verification probe for the findings table in design.md (A–D): the ECharts
// theme-under-option merge rule, JSON-safe gradients and borderRadius, and
// flint's axis-label rotation threshold.
//
// Run standalone (not part of the workspace):
//   mkdir probe && cd probe && npm init -y
//   npm install echarts@^6 flint-chart@0.5.0
//   node probe.mjs
//
// Verified with echarts 6.1.0 standalone and re-run against the workspace's own
// echarts 6.0.0 + flint-chart 0.5.0 dists (identical results) — the exact
// versions the plugins package pins.
import * as echarts from 'echarts';
const { assembleECharts } = await import('flint-chart/echarts');

const render = (option, theme) => {
  const chart = echarts.init(null, theme, { renderer: 'svg', ssr: true, width: 600, height: 300 });
  chart.setOption(option);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
};

echarts.registerTheme('mod', { color: ['#0b7a5c', '#8c5bb0'] });

// A: theme palette applies when option pins nothing
const base = { xAxis: { type: 'category', data: ['A', 'B'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] };
const a = render(JSON.parse(JSON.stringify(base)), 'mod');
console.log('A theme palette applies:', a.includes('#0b7a5c') || a.includes('11,122,92') || /fill="#0b7a5c"/i.test(a));

// B: option.color pins over theme
const b = render({ ...JSON.parse(JSON.stringify(base)), color: ['#5470c6'] }, 'mod');
console.log('B option.color wins over theme:', b.includes('5470c6') && !b.includes('0b7a5c'));

// B2: per-series itemStyle.color wins over both
const b2opt = JSON.parse(JSON.stringify(base)); b2opt.series[0].itemStyle = { color: '#123456' };
const b2 = render(b2opt, 'mod');
console.log('B2 itemStyle.color wins:', b2.includes('123456'));

// C: linear-gradient object survives JSON round-trip and renders
const copt = JSON.parse(JSON.stringify({
  xAxis: { type: 'category', data: ['A', 'B', 'C'] }, yAxis: {},
  series: [{ type: 'line', data: [3, 1, 2], areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [ { offset: 0, color: 'rgba(11,122,92,0.2)' }, { offset: 1, color: 'rgba(11,122,92,0)' } ] } }, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [ { offset: 0, color: '#129271' }, { offset: 1, color: '#0b6b52' } ] } } }],
}));
const c = render(copt, 'mod');
console.log('C gradient renders from JSON:', c.includes('linearGradient') || c.includes('linear-gradient'));

// C2: bar borderRadius from JSON
const c2opt = JSON.parse(JSON.stringify(base)); c2opt.series[0].itemStyle = { borderRadius: [4, 4, 0, 0] };
const c2 = render(c2opt, 'mod');
console.log('C2 bar borderRadius renders (path present):', /<path/.test(c2));

// D: flint axisLabel.rotate — the rule is in flint's source (dist/echarts/index.cjs:
// EC_BAR_SHORT_CATEGORY_COUNT = 4, EC_BAR_SHORT_CATEGORY_LABEL_LEN = 8): rotate is 0
// iff count <= 4 AND maxLen <= 8, else 90; canvas width is never consulted. The cases
// below cross both boundaries so a version bump that moves either threshold fails loudly.
for (const [name, labels] of [ ['3 short', ['Apr', 'May', 'Jun']], ['4 short (count boundary, expect 0)', ['Apr', 'May', 'Jun', 'Jul']], ['5 short (count 5 > 4, expect 90)', ['Apr', 'May', 'Jun', 'Jul', 'Aug']], ['4 x 8-char (len boundary, expect 0)', ['Alderaan', 'Tatooine', 'Coruscat', 'Dagobahh']], ['4 x 9-char (len 9 > 8, expect 90)', ['Alderaan9', 'Tatooine9', 'Coruscant', 'Dagobahhh']], ['6 short', ['Apr','May','Jun','Jul','Aug','Sep']], ['6 long', ['Qualified','Discovery','Proposal','Negotiation','Contract','Legal']] ]) {
  const rows = labels.map((l, i) => ({ Stage: l, Amount: 100 + i }));
  const opt = assembleECharts({ data: { values: rows }, chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'Stage' }, y: { field: 'Amount' } }, baseSize: { width: 1100, height: 180 } } });
  console.log('D rotate,', name, ':', opt.xAxis.axisLabel?.rotate, '· grid.bottom:', opt.grid?.bottom, '· _height:', opt._height);
}
