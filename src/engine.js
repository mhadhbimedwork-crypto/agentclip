'use strict';
// AgentClip: motore. Nessuna dipendenza. Gli adattatori "script" non usano intelligenza artificiale (0 token).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return d; } };
const save = (f, o) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 1)); };
const today = () => new Date().toISOString().slice(0, 10);

exports.config = () => load('agentclip.json', null);
// ordine: prima chi non ha superiori in fondo... i subordinati lavorano prima, il superiore riassume per ultimo
exports.order = cfg => { const out = [], seen = new Set(); const kids = id => cfg.agents.filter(a => a.reportsTo === id);
  const visit = a => { if (seen.has(a.id)) return; seen.add(a.id); kids(a.id).forEach(visit); out.push(a); };
  cfg.agents.filter(a => !a.reportsTo).forEach(visit); cfg.agents.forEach(visit); return out; };

exports.runAgent = (cfg, a, state) => {
  const t0 = Date.now(), rec = { agent: a.id, at: new Date().toISOString(), status: 'ok', problems: [], tokens: 0, costEur: 0 };
  if (a.enabled === false) { rec.status = 'disattivato'; return rec; }
  if (state.runsToday >= cfg.budget.maxRunsPerDay) { rec.status = 'bloccato-budget'; rec.note = 'tetto esecuzioni giornaliere raggiunto'; return rec; }
  if (a.requiresApproval && !(state.approved || []).includes(a.id)) { rec.status = 'in-attesa-approvazione'; return rec; }
  state.runsToday++;
  if (a.adapter.type === 'script') {
    const cwd = path.resolve(ROOT, cfg.target || '.'), out = path.join(ROOT, 'work', a.id + '.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); try { fs.unlinkSync(out); } catch (e) {}
    const r = cp.spawnSync(a.adapter.cmd, { shell: true, cwd, timeout: cfg.budget.maxMinutesPerRun * 60000, encoding: 'utf8', env: Object.assign({}, process.env, { AGENTI_OUT: out }) });
    rec.log = ((r.stdout || '') + (r.stderr || '')).slice(-1500);
    if (r.error || r.status !== 0) { rec.status = 'errore'; rec.note = r.error ? String(r.error.message) : 'uscita ' + r.status; }
    try { rec.problems = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
  } else if (a.adapter.type === 'claude') {
    // Adattatore AI: lancia la CLI di Claude Code (come fa l'adattatore claude-local di Paperclip). Usa l'accesso già presente sulla macchina.
    const u = load('data/usage.json', { months: {} }), mk = new Date().toISOString().slice(0, 7), spent = (u.months[mk] || {}).costUsd || 0, cap = cfg.budget.maxCostEurPerMonth;
    if (!(cap > 0)) { rec.status = 'bloccato-budget'; rec.note = 'maxCostEurPerMonth è 0: l\'AI è spenta'; return rec; }
    if (spent >= cap) { rec.status = 'bloccato-budget'; rec.note = 'tetto mensile raggiunto'; return rec; }
    const cwd = path.resolve(ROOT, cfg.target || '.'), pr = (a.adapter.prompt || '') + '\nRegole: dati solo di prova, non pubblicare, non leggere chiavi, non modificare .github/. Rispondi con un elenco breve di problemi o modifiche proposte.';
    const args = ['-p', pr, '--output-format', 'json', '--max-turns', String(a.adapter.maxTurns || 12), '--allowedTools', a.adapter.tools || 'Read,Grep,Glob', '--disallowedTools', 'WebFetch,WebSearch'];
    const r = cp.spawnSync(a.adapter.bin || 'claude', args, { cwd, timeout: cfg.budget.maxMinutesPerRun * 60000, encoding: 'utf8' });
    if (r.error || r.status !== 0) { rec.status = 'errore'; rec.note = r.error ? String(r.error.message) : 'uscita ' + r.status; rec.log = ((r.stderr || '')).slice(-800); }
    else { try { const j = JSON.parse(r.stdout); rec.log = String(j.result || '').slice(0, 3000); rec.costUsd = j.total_cost_usd || 0; rec.tokens = ((j.usage || {}).input_tokens || 0) + ((j.usage || {}).output_tokens || 0);
      u.months[mk] = { costUsd: spent + rec.costUsd, tokens: ((u.months[mk] || {}).tokens || 0) + rec.tokens }; save('data/usage.json', u);
      rec.problems = [{ gravita: 'info', testo: 'Parere AI: ' + rec.log.replace(/\s+/g, ' ').slice(0, 300) }]; } catch (e) { rec.status = 'errore'; rec.note = 'risposta non leggibile'; } }
  } else if (a.adapter.type === 'summary') {
    rec.problems = [];
  } else { rec.status = 'adattatore-non-disponibile'; }
  rec.seconds = Math.round((Date.now() - t0) / 100) / 10; return rec;
};

exports.run = (only) => {
  const cfg = exports.config(); if (!cfg) throw new Error('agentclip.json mancante');
  const hist = load('data/history.json', { days: {} }), appr = load('data/approvals.json', { approved: [] });
  const state = { runsToday: (hist.days[today()] || {}).runs || 0, approved: appr.approved };
  const results = [];
  exports.order(cfg).filter(a => !only || a.id === only).forEach(a => {
    if (a.adapter.type === 'summary') { a._sum = true; return; }
    const r = exports.runAgent(cfg, a, state); results.push(r); console.log(`[${a.id}] ${r.status} · ${r.problems.length} segnalazioni`); });
  // il direttore riassume
  const all = results.flatMap(r => r.problems.map(p => Object.assign({ agent: r.agent }, p)));
  hist.days[today()] = { runs: state.runsToday, problems: all.length, tokens: 0 };
  save('data/history.json', hist);
  const status = { company: cfg.company, updated: new Date().toISOString(), budget: cfg.budget, usage: { runsToday: state.runsToday, tokens: ((load('data/usage.json', { months: {} }).months[new Date().toISOString().slice(0, 7)] || {}).tokens || 0), costUsd: ((load('data/usage.json', { months: {} }).months[new Date().toISOString().slice(0, 7)] || {}).costUsd || 0) },
    agents: cfg.agents.map(a => { const r = results.find(x => x.agent === a.id); return { id: a.id, name: a.name, role: a.role, reportsTo: a.reportsTo, enabled: a.enabled !== false, needsApproval: !!a.requiresApproval && !appr.approved.includes(a.id), adapter: a.adapter.type, last: r ? { at: r.at, status: r.status, seconds: r.seconds, problems: r.problems.length } : null }; }),
    problems: all.map(p => ({ agent: p.agent, gravita: p.gravita, testo: p.testo })) };   // solo aggregati e testi di controllo: mai dati personali
  save('docs/status.json', status); return status;
};
exports.approve = id => { const a = load('data/approvals.json', { approved: [] }); if (!a.approved.includes(id)) a.approved.push(id); save('data/approvals.json', a); };
exports.revoke = id => { const a = load('data/approvals.json', { approved: [] }); a.approved = a.approved.filter(x => x !== id); save('data/approvals.json', a); };
