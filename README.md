# 📎 AgentClip

Orchestratore di agenti **scritto da zero** (nessun codice copiato), senza dipendenze e **senza consumare token**.
Ispirato all'idea di organigramma + budget + approvazioni, ma in versione minimale e nostra.

- **Organigramma**: ogni agente ha un `reportsTo`; i subordinati lavorano prima, il direttore riassume.
- **Adattatori**: `script` (programma normale, 0 token, attivo) · `claude` (intelligenza artificiale, **disattivato**, richiede approvazione).
- **Budget**: tetto di esecuzioni al giorno, minuti per esecuzione, euro al mese (0 = nessun uso di AI).
- **Approvazioni**: un agente con `requiresApproval` non parte finché non esegui `node src/cli.js approve <id>`.
- **Dashboard**: `docs/index.html` legge `docs/status.json` (solo conteggi e testi di controllo, mai dati personali).
- **GitHub Actions**: ogni notte clona il progetto (pubblico), esegue gli agenti e pubblica la dashboard su Pages.

```
node src/cli.js status        # organigramma
node src/cli.js run           # esegue tutti (la cartella ./target è il progetto da controllare)
node src/cli.js run sicurezza # solo uno
```

Sicurezza: nessun segreto, nessuna rete oltre al clone pubblico, nessun avvio da eventi di estranei, nessuna scrittura sul progetto controllato.
