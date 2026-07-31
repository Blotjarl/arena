#!/usr/bin/env node
/**
 * Deterministic UML class diagram generator for Arena (docs/ProjectProcess.txt Steps 6 and 12).
 * Regenerates docs/api's TypeDoc JSON model, walks it, and emits Mermaid classDiagram syntax into
 * the same HTML template/visual conventions as docs/01_class_diagram.html (Step 1's hand-authored
 * diagram) so the two are directly comparable.
 *
 * Usage: node scripts/generate-class-diagram.js <output-html-path> <step-label>
 * <step-label> (e.g. "Step 12 — Final") only affects the page's own title/heading text, never the
 * generated diagram content — defaults to "Step 6" so the original zero-arg invocation this script was
 * first written for keeps producing byte-for-byte the same output it always has.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputPath = process.argv[2] || path.join(repoRoot, 'docs', '06_class_diagram_reverse-engineered.html');
const stepLabel = process.argv[3] || 'Step 6';
const modelPath = path.join(repoRoot, '.typedoc-model.json');
const templatePath = path.join(repoRoot, 'docs', '01_class_diagram.html');

// ---------------------------------------------------------------------------
// 1. Regenerate the TypeDoc JSON model fresh from current source
// ---------------------------------------------------------------------------
execSync(`npx typedoc --json "${modelPath}" --logLevel Error`, { cwd: repoRoot, stdio: 'inherit' });
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
fs.unlinkSync(modelPath);

// ---------------------------------------------------------------------------
// 2. Flatten every declaration (class/interface/enum) across all four packages,
//    keyed by TypeDoc id, and figure out which package/subfolder each lives in.
// ---------------------------------------------------------------------------
const KIND = { CLASS: 128, INTERFACE: 256, ENUM: 8, ENUM_MEMBER: 16, PROPERTY: 1024, METHOD: 2048, CONSTRUCTOR: 512 };

/** id -> { name, kind, pkg, sub, decl } */
const declById = new Map();
/** pkg -> sub -> [decl, ...] */
const byPackage = { shared: {}, server: {}, client: {}, api: {} };

function pkgAndSub(moduleName) {
  // moduleName looks like "server/src/model/MatchModel" or "shared/src/mvc/AbstractModel"
  const parts = moduleName.split('/'); // [pkg, 'src', ...subpath]
  const pkg = parts[0];
  const rest = parts.slice(2, -1); // drop pkg, 'src', and the filename itself
  const sub = rest.length ? rest[0] : 'root';
  return { pkg, sub };
}

for (const mod of model.children) {
  const { pkg, sub } = pkgAndSub(mod.name);
  if (!byPackage[pkg]) continue;
  for (const decl of mod.children || []) {
    if (![KIND.CLASS, KIND.INTERFACE, KIND.ENUM].includes(decl.kind)) continue;
    decl.pkg = pkg;
    decl.sub = sub;
    declById.set(decl.id, { name: decl.name, kind: decl.kind, pkg, sub, decl });
    byPackage[pkg][sub] = byPackage[pkg][sub] || [];
    byPackage[pkg][sub].push(decl);
  }
}

// ---------------------------------------------------------------------------
// 3. Type-reference helpers
// ---------------------------------------------------------------------------
/** Walks a TypeDoc "type" node and returns the set of in-model declaration ids it references. */
function referencedIds(typeNode, acc = new Set()) {
  if (!typeNode || typeof typeNode !== 'object') return acc;
  if (typeNode.type === 'reference' && typeof typeNode.target === 'number' && declById.has(typeNode.target)) {
    acc.add(typeNode.target);
  }
  for (const key of ['types', 'typeArguments', 'elements']) {
    if (Array.isArray(typeNode[key])) typeNode[key].forEach((t) => referencedIds(t, acc));
  }
  if (typeNode.elementType) referencedIds(typeNode.elementType, acc);
  return acc;
}

/** depth-limited so a generic-of-a-generic (e.g. Map<string, Socket<A,B,C,D>>) doesn't explode into an
 *  unreadable wall of tildes — anything past one level of nesting is shown by name only. */
function renderType(typeNode, depth = 0) {
  if (!typeNode) return 'void';
  switch (typeNode.type) {
    case 'intrinsic':
      return typeNode.name;
    case 'reference': {
      if (depth >= 1) return typeNode.name;
      const args = (typeNode.typeArguments || []).map((a) => renderType(a, depth + 1));
      return args.length ? `${typeNode.name}~${args.join(',')}~` : typeNode.name;
    }
    case 'union':
      return typeNode.types.map((t) => renderType(t, depth)).join('|');
    case 'array':
      return `${renderType(typeNode.elementType, depth)}[]`;
    case 'tuple':
      return `[${(typeNode.elements || []).map((t) => renderType(t, depth)).join(',')}]`;
    case 'literal':
      return typeNode.value === null ? 'null' : JSON.stringify(typeNode.value);
    case 'reflection':
      return 'object';
    default:
      return typeNode.name || 'unknown';
  }
}

const VIS = (flags) => (flags.isPrivate ? '-' : flags.isProtected ? '#' : '+');

// ---------------------------------------------------------------------------
// 4. Member rendering (attributes then operations), matching Step 1's mermaid conventions
// ---------------------------------------------------------------------------
function renderMembers(decl) {
  const lines = [];
  const assocTargets = new Set(); // property-type references -> association
  const depTargets = new Set(); // method-only references -> dependency

  const ctor = (decl.children || []).find((c) => c.kind === KIND.CONSTRUCTOR);
  const props = (decl.children || []).filter((c) => c.kind === KIND.PROPERTY);
  const methods = (decl.children || []).filter((c) => c.kind === KIND.METHOD);

  for (const p of props) {
    const t = p.type;
    referencedIds(t).forEach((id) => assocTargets.add(id));
    const staticMark = p.flags.isStatic ? '$' : '';
    lines.push(`    ${VIS(p.flags)}${renderType(t)} ${p.name}${staticMark}`);
  }

  if (ctor && ctor.signatures && ctor.signatures[0]) {
    const params = ctor.signatures[0].parameters || [];
    params.forEach((prm) => referencedIds(prm.type).forEach((id) => assocTargets.add(id)));
    lines.push(`    +${decl.name}(${params.map((p) => p.name).join(', ')})`);
  }

  for (const m of methods) {
    const sig = m.signatures && m.signatures[0];
    if (!sig) continue;
    const params = sig.parameters || [];
    params.forEach((prm) => referencedIds(prm.type).forEach((id) => depTargets.add(id)));
    referencedIds(sig.type).forEach((id) => depTargets.add(id));
    const abstractMark = m.flags.isAbstract ? '*' : '';
    const staticMark = m.flags.isStatic ? '$' : '';
    const paramList = params.map((p) => p.name).join(', ');
    lines.push(`    ${VIS(m.flags)}${m.name}(${paramList})${abstractMark}${staticMark} ${renderType(sig.type)}`);
  }

  // A property-type reference wins over a method-only reference to the same target
  for (const id of assocTargets) depTargets.delete(id);

  return { lines, assocTargets, depTargets };
}

function stereotype(decl) {
  if (decl.kind === KIND.INTERFACE) return '&lt;&lt;interface&gt;&gt;';
  if (decl.kind === KIND.ENUM) return '&lt;&lt;enumeration&gt;&gt;';
  if (decl.kind === KIND.CLASS && decl.flags.isAbstract) return '&lt;&lt;abstract&gt;&gt;';
  return null;
}

function renderClassBlock(decl) {
  const st = stereotype(decl);
  const body = [];
  if (st) body.push(`        ${st}`);
  if (decl.kind === KIND.ENUM) {
    for (const m of decl.children || []) body.push(`        ${m.name}`);
  } else {
    const { lines } = renderMembers(decl);
    body.push(...lines.map((l) => '    ' + l.trimStart()).map((l) => '        ' + l.trim()));
  }
  return `    class ${decl.name} {\n${body.join('\n')}\n    }`;
}

// ---------------------------------------------------------------------------
// 5. One Mermaid diagram per section, mirroring Step 1's grouping
// ---------------------------------------------------------------------------
const PKG_CLASSDEF = {
  shared: 'shared',
  server: 'server',
  client: 'client',
  api: 'api',
};
const CLASSDEF_STYLE = {
  shared: 'fill:#E7EAEE,stroke:#5B6B7A,color:#1B222C',
  server: 'fill:#F4E3D3,stroke:#C2703A,color:#1B222C',
  client: 'fill:#DCF2F1,stroke:#2AA7B0,color:#1B222C',
  api: 'fill:#E7E3F5,stroke:#7C6FC4,color:#1B222C',
};

function buildDiagram(decls, { title }) {
  const lines = ['classDiagram'];
  const declaredIds = new Set(decls.map((d) => d.id));
  const relLines = [];
  const styleLines = [];
  const usedClassDefs = new Set();

  for (const decl of decls) {
    lines.push(renderClassBlock(decl));
  }
  lines.push('');

  for (const decl of decls) {
    (decl.extendedTypes || []).forEach((t) => {
      if (declaredIds.has(t.target)) relLines.push(`    ${t.name} &lt;|-- ${decl.name}`);
    });
    (decl.implementedTypes || []).forEach((t) => {
      if (declaredIds.has(t.target)) relLines.push(`    ${t.name} &lt;|.. ${decl.name}`);
    });
    const { assocTargets, depTargets } = decl.kind === KIND.ENUM ? { assocTargets: new Set(), depTargets: new Set() } : renderMembers(decl);
    assocTargets.forEach((id) => {
      if (declaredIds.has(id) && id !== decl.id) {
        const t = declById.get(id);
        relLines.push(`    ${decl.name} --&gt; ${t.name}`);
      }
    });
    depTargets.forEach((id) => {
      if (declaredIds.has(id) && id !== decl.id) {
        const t = declById.get(id);
        relLines.push(`    ${decl.name} ..&gt; ${t.name}`);
      }
    });
  }
  lines.push(...relLines);
  lines.push('');

  for (const decl of decls) {
    const cls = PKG_CLASSDEF[decl.pkg];
    usedClassDefs.add(cls);
    styleLines.push(`    class ${decl.name}:::${cls}`);
  }
  for (const cls of usedClassDefs) {
    lines.push(`    classDef ${cls} ${CLASSDEF_STYLE[cls]}`);
  }
  lines.push(...styleLines);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. Assemble sections: shared/mvc, shared/domain, shared/exceptions, server, client, api
//    (shared/contract is data-only, rendered as a table like Step 1, not a diagram)
// ---------------------------------------------------------------------------
function section(id, title, note, decls) {
  if (!decls || !decls.length) return '';
  return `
    <section class="pkg" id="${id}">
      <div class="pkg-head"><h2 class="pkg-title">${title}</h2></div>
      <p class="pkg-note">${note}</p>
      <div class="diagram-frame"><pre class="mermaid">${buildDiagram(decls, { title })}</pre></div>
    </section>`;
}

const sections = [
  section('rev-shared-mvc', 'Shared — MVC Framework (reverse-engineered)',
    'Generated from packages/shared/src/mvc — compare against docs/01_class_diagram.html #framework.',
    byPackage.shared.mvc),
  section('rev-shared-domain', 'Shared — Domain Vocabulary (reverse-engineered)',
    'Generated from packages/shared/src/domain — compare against docs/01_class_diagram.html #domain.',
    byPackage.shared.domain),
  section('rev-shared-exceptions', 'Shared — Exceptions (reverse-engineered)',
    'Generated from packages/shared/src/exceptions — compare against docs/01_class_diagram.html #exceptions.',
    byPackage.shared.exceptions),
  section('rev-server', 'Server (reverse-engineered)',
    'Generated from packages/server/src — compare against docs/01_class_diagram.html #server.',
    [].concat(byPackage.server.model || [], byPackage.server.controller || [], byPackage.server.view || [], byPackage.server.root || [])),
  section('rev-client', 'Client (reverse-engineered)',
    'Generated from packages/client/src — compare against docs/01_class_diagram.html #client.',
    [].concat(byPackage.client.model || [], byPackage.client.controller || [], byPackage.client.view || [], byPackage.client.root || [])),
  section('rev-api', 'API (reverse-engineered)',
    'Generated from packages/api/src — compare against docs/01_class_diagram.html #api.',
    [].concat(byPackage.api.model || [], byPackage.api.controller || [], byPackage.api.view || [], byPackage.api.util || [], byPackage.api.root || [])),
].join('\n');

// ---------------------------------------------------------------------------
// 7. Splice into the Step 1 template: reuse its CSS + embedded mermaid.js verbatim
// ---------------------------------------------------------------------------
const templateHtml = fs.readFileSync(templatePath, 'utf8');
const styleMatch = templateHtml.match(/<style>[\s\S]*?<\/style>/);
const mermaidScriptMatch = templateHtml.match(/<script>\s*"use strict";var __esbuild_esm_mermaid_nm[\s\S]*?<\/script>/);
const initScriptMatch = templateHtml.match(/<script>\s*mermaid\.initialize[\s\S]*?<\/script>/);

if (!styleMatch || !mermaidScriptMatch || !initScriptMatch) {
  console.error('Could not locate expected blocks in docs/01_class_diagram.html — template may have changed shape.');
  process.exit(1);
}

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Arena — ${stepLabel} Reverse-Engineered Class Diagram</title>
${styleMatch[0]}
</head>
<body>
<div class="shell">
  <main>
    <header class="page-head">
      <div class="eyebrow">Arena — Software Engineering Term Project</div>
      <h1 class="title">${stepLabel} — Reverse-Engineered Class Diagram</h1>
      <p class="dek">Generated deterministically by <code>scripts/generate-class-diagram.js</code> from the
      actual current source under <code>packages/</code> — not hand-authored. Compare each section against
      the corresponding one in <code>docs/01_class_diagram.html</code> (Step 1) to find drift between plan
      and code (Step 7). Relationship arrows here are limited to what static analysis can actually know:
      <code>extends</code>/<code>implements</code> are exact; anything else is a generic association
      (stored as a field) or dependency (used only in a method signature) — composition/aggregation
      distinctions from Step 1 required judgment calls a script can't make and are not re-derived here.</p>
    </header>
${sections}
    <footer class="page-foot">Regenerate with: <code>node scripts/generate-class-diagram.js</code></footer>
  </main>
</div>
${mermaidScriptMatch[0]}
${initScriptMatch[0]}
</body>
</html>
`;

fs.writeFileSync(outputPath, out, 'utf8');
console.log(`Wrote ${outputPath} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
