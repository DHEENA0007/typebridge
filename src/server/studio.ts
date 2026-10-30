import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { parseTypeScript } from '../parsers/typescript';
import { compile, SupportedTarget } from '../generators';
import { getSchemaStats, diffSchemas } from '../analyzer';
import { generateMockData } from '../mock';

export interface StudioOptions {
  port?: number;
  initialFile?: string;
}

export function startStudioServer(options: StudioOptions = {}): http.Server {
  const port = options.port ?? 3456;

  let initialCode = `/**
 * User account profile representation
 */
export interface User {
  id: string;
  name: string;
  email: string;
  age?: number;
  role: Role;
  tags: string[];
  createdAt: string;
}

/**
 * Access permission role levels
 */
export enum Role {
  Admin = "ADMIN",
  Developer = "DEVELOPER",
  Member = "MEMBER",
  Guest = "GUEST"
}
`;

  if (options.initialFile && fs.existsSync(options.initialFile)) {
    try {
      initialCode = fs.readFileSync(options.initialFile, 'utf-8');
    } catch (e) {
      // keep fallback
    }
  }

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderStudioHtml(initialCode));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/compile-all') {
      readJsonBody(req, (err, body) => {
        if (err || !body || typeof body.code !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or missing code payload' }));
          return;
        }

        try {
          const startTime = Date.now();
          const doc = parseTypeScript(body.code, 'studio-schema.ts');
          const elapsed = Date.now() - startTime;
          const stats = getSchemaStats(doc);

          const targets: Record<string, string> = {
            python: compile(doc, 'python'),
            rust: compile(doc, 'rust'),
            go: compile(doc, 'go'),
            typescript: compile(doc, 'typescript'),
            graphql: compile(doc, 'graphql' as any),
            openapi: compile(doc, 'openapi' as any),
            mcp: compile(doc, 'mcp' as any),
            'json-schema': compile(doc, 'json-schema'),
            markdown: compile(doc, 'markdown'),
          };

          let mockData: any = {};
          try {
            mockData = generateMockData(doc, undefined, { count: 2 });
          } catch (mErr) {
            mockData = { error: String(mErr) };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              parseTimeMs: elapsed,
              stats,
              targets,
              mock: mockData,
            })
          );
        } catch (compileErr: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              error: compileErr.message || String(compileErr),
            })
          );
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/diff') {
      readJsonBody(req, (err, body) => {
        if (err || !body || !body.baseCode || !body.newCode) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing baseCode or newCode' }));
          return;
        }

        try {
          const baseDoc = parseTypeScript(body.baseCode, 'base.ts');
          const newDoc = parseTypeScript(body.newCode, 'new.ts');
          const diffResult = diffSchemas(baseDoc, newDoc);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...diffResult }));
        } catch (diffErr: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: diffErr.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`
🚀 TypeBridge Live Studio is running at:
   👉 http://localhost:${port}

✨ Features active:
   • Live Multi-Language Compiler (Python, Rust, Go, Zod, GraphQL, OpenAPI, MCP)
   • Generative Mock Data Preview
   • Real-time Schema Breaking Change Inspector
   • JSDoc Documentation Health Metrics

Press Ctrl+C to stop.
`);
  });

  return server;
}

function readJsonBody(
  req: http.IncomingMessage,
  callback: (err: Error | null, data?: any) => void
) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 5 * 1024 * 1024) {
      // 5MB limit
      req.destroy();
      callback(new Error('Payload too large'));
    }
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      callback(null, parsed);
    } catch (err: any) {
      callback(err);
    }
  });
}

function renderStudioHtml(initialCode: string): string {
  const safeInitialCode = JSON.stringify(initialCode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TypeBridge Studio | Universal Schema Compiler</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.7);
      --border: rgba(255, 255, 255, 0.1);
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --accent: #818cf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --code-bg: #030712;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
      color: #030712;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 14px;
      letter-spacing: -0.5px;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .tagline {
      font-size: 12px;
      color: var(--text-muted);
    }
    .actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    select, button {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    select:hover, button:hover {
      border-color: var(--primary);
    }
    button.primary {
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      color: #030712;
      font-weight: 700;
      border: none;
    }
    button.primary:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--success);
      font-weight: 600;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      flex: 1;
      overflow: hidden;
      background: #060910;
    }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid var(--border);
      position: relative;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 18px;
      background: rgba(15, 23, 42, 0.6);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .tabs {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      max-width: 80%;
    }
    .tab {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      color: var(--text-muted);
      border: 1px solid transparent;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .tab:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.05);
    }
    .tab.active {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(56, 189, 248, 0.3);
      font-weight: 700;
    }
    textarea, pre {
      flex: 1;
      background: var(--code-bg);
      color: #e2e8f0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      padding: 18px;
      border: none;
      outline: none;
      resize: none;
      overflow: auto;
      white-space: pre;
    }
    pre {
      margin: 0;
      user-select: text;
    }
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 24px;
      background: rgba(15, 23, 42, 0.95);
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
    }
    .stats-group {
      display: flex;
      gap: 18px;
    }
    .stat-pill {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stat-val {
      color: #fff;
      font-weight: 700;
    }
    .badge-ok { color: var(--success); }
    .badge-warn { color: var(--warning); }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="logo-badge">TB</div>
      <div>
        <div class="title">TypeBridge Studio</div>
        <div class="tagline">Universal Zero-Overhead Schema Compiler</div>
      </div>
    </div>
    <div class="actions">
      <select id="presetSelect" onchange="loadPreset(this.value)">
        <option value="user">Preset: User & Role Profile</option>
        <option value="ecommerce">Preset: E-Commerce Order</option>
        <option value="telemetry">Preset: IoT Sensor Telemetry</option>
      </select>
      <div class="live-indicator">
        <div class="live-dot"></div>
        <span>Ready</span>
      </div>
    </div>
  </header>

  <main>
    <div class="panel">
      <div class="panel-header">
        <span>SOURCE: TypeScript Schema</span>
        <button onclick="formatSource()">Format</button>
      </div>
      <textarea id="sourceCode" spellcheck="false"></textarea>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="tabs" id="tabContainer">
          <div class="tab active" onclick="switchTab('python')">🐍 Python</div>
          <div class="tab" onclick="switchTab('rust')">🦀 Rust</div>
          <div class="tab" onclick="switchTab('go')">🐹 Go</div>
          <div class="tab" onclick="switchTab('typescript')">⚡ Zod</div>
          <div class="tab" onclick="switchTab('graphql')">🔮 GraphQL</div>
          <div class="tab" onclick="switchTab('openapi')">🌐 OpenAPI</div>
          <div class="tab" onclick="switchTab('mcp')">🤖 MCP Tools</div>
          <div class="tab" onclick="switchTab('json-schema')">📄 JSON Schema</div>
          <div class="tab" onclick="switchTab('markdown')">📊 Markdown</div>
          <div class="tab" onclick="switchTab('mock')">🎲 Mock Data</div>
        </div>
        <button onclick="copyCurrentOutput()">Copy Code</button>
      </div>
      <pre id="outputCode"></pre>
    </div>
  </main>

  <footer>
    <div class="stats-group">
      <div class="stat-pill">Definitions: <span class="stat-val" id="statDefs">0</span></div>
      <div class="stat-pill">Fields: <span class="stat-val" id="statFields">0</span></div>
      <div class="stat-pill">Doc Coverage: <span class="stat-val" id="statDocs">0%</span></div>
      <div class="stat-pill">AST Parse: <span class="stat-val" id="statTime">0ms</span></div>
    </div>
    <div>Apache-2.0 • TypeBridge Open Source</div>
  </footer>

  <script>
    const presets = {
      user: ${safeInitialCode},
      ecommerce: \`/**
 * Customer product purchase order
 */
export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  status: OrderStatus;
  shippingAddress: Address;
  placedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export enum OrderStatus {
  Pending = "PENDING",
  Paid = "PAID",
  Shipped = "SHIPPED",
  Delivered = "DELIVERED",
  Cancelled = "CANCELLED"
}
\`,
      telemetry: \`/**
 * Industrial IoT sensor reading event
 */
export interface SensorTelemetry {
  sensorId: string;
  deviceType: string;
  temperatureCelsius: number;
  humidityPercentage: number;
  batteryLevel: number;
  isOnline: boolean;
  recordedAt: string;
  coordinates: GeoLocation;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
}
\`
    };

    let currentTab = 'python';
    let generatedTargets = {};
    let mockData = {};
    const sourceEl = document.getElementById('sourceCode');
    const outputEl = document.getElementById('outputCode');

    sourceEl.value = presets.user;

    function loadPreset(key) {
      if (presets[key]) {
        sourceEl.value = presets[key];
        triggerCompile();
      }
    }

    function switchTab(target) {
      currentTab = target;
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      const activeTab = Array.from(document.querySelectorAll('.tab')).find(el => el.textContent.toLowerCase().includes(target.replace('-', ' ')));
      if (activeTab) activeTab.classList.add('active');
      renderOutput();
    }

    function renderOutput() {
      if (currentTab === 'mock') {
        outputEl.textContent = JSON.stringify(mockData, null, 2);
      } else {
        outputEl.textContent = generatedTargets[currentTab] || '// No output';
      }
    }

    let debounceTimer;
    sourceEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(triggerCompile, 250);
    });

    async function triggerCompile() {
      try {
        const res = await fetch('/api/compile-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: sourceEl.value })
        });
        const data = await res.json();
        if (data.success) {
          generatedTargets = data.targets;
          mockData = data.mock;
          renderOutput();

          // Update stats
          document.getElementById('statDefs').textContent = data.stats.totalDefinitions;
          document.getElementById('statFields').textContent = data.stats.totalFields;
          document.getElementById('statDocs').textContent = data.stats.documentationCoveragePercent + '%';
          document.getElementById('statTime').textContent = data.parseTimeMs + 'ms';
        } else {
          outputEl.textContent = '// Parse / Compile Error:\\n' + data.error;
        }
      } catch (err) {
        outputEl.textContent = '// Connection error:\\n' + err.message;
      }
    }

    function copyCurrentOutput() {
      navigator.clipboard.writeText(outputEl.textContent).then(() => {
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#34d399';
        setTimeout(() => {
          btn.textContent = original;
          btn.style.color = '';
        }, 1500);
      });
    }

    triggerCompile();
  </script>
</body>
</html>`;
}
