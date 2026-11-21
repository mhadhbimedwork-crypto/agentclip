#!/usr/bin/env node
'use strict';
const e = require('./engine'); const [c, x] = process.argv.slice(2);
if (c === 'run') { const s = e.run(x); process.exit(s.problems.some(p => p.gravita === 'alta') ? 1 : 0); }
else if (c === 'status') { const cfg = e.config(); e.order(cfg).forEach(a => console.log((a.reportsTo ? '  └ ' : '') + a.id + (a.enabled === false ? ' (disattivato)' : '') + ' — ' + a.role)); }
else if (c === 'approve' && x) { e.approve(x); console.log('approvato', x); }
else if (c === 'revoke' && x) { e.revoke(x); console.log('revocato', x); }
else console.log('uso: agentclip run [agente] | status | approve <agente> | revoke <agente>');
