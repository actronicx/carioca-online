# Carioca Online

Versione online multiplayer del gioco di carte Carioca (9 mani), giocabile con gli amici da dispositivi diversi tramite un codice stanza.

## Struttura del progetto

```
carioca-online/
├── server/     Node.js + Express + Socket.io — il "cervello" del gioco
└── client/     React (Vite) — l'interfaccia che vedono i giocatori
```

Il server tiene l'unica copia reale della partita (mazzo, mano di ogni giocatore, punteggi) e applica tutte le regole. Ogni client vede solo la propria mano e riceve in tempo reale gli aggiornamenti via WebSocket (Socket.io).

## Eseguire il progetto in locale (per provarlo prima di pubblicarlo)

Servono due terminali aperti contemporaneamente.

**Terminale 1 — server:**
```bash
cd server
npm install
npm start
```
Il server parte su `http://localhost:3001`.

**Terminale 2 — client:**
```bash
cd client
npm install
npm run dev
```
Il client parte su `http://localhost:5173`. Apri questo indirizzo nel browser: potrai creare una stanza o unirti con un codice. Per provare in locale con "più giocatori", apri lo stesso indirizzo in più schede/browser diversi.

## Pubblicare online (per giocare davvero con gli amici)

La soluzione più semplice è **Render** (ha un piano gratuito e si collega direttamente a un repository GitHub).

### Passo 1 — Carica il progetto su GitHub
1. Crea un nuovo repository su [github.com](https://github.com) (puoi chiamarlo `carioca-online`).
2. Carica dentro tutta questa cartella (`server/`, `client/`, questo `README.md`).

### Passo 2 — Crea il servizio su Render
1. Vai su [render.com](https://render.com) e registrati (puoi usare l'account GitHub).
2. Clicca **New +** → **Web Service**.
3. Collega il repository che hai appena creato.
4. Configura così:
   - **Build Command**:
     ```
     cd client && npm install && npm run build && cd ../server && npm install
     ```
   - **Start Command**:
     ```
     node server/index.js
     ```
   - **Environment**: Node
   - **Instance Type**: Free
5. Clicca **Create Web Service**. Il primo deploy richiede qualche minuto.

Al termine, Render ti darà un indirizzo tipo `https://carioca-online.onrender.com` — quello è il link da mandare ai tuoi amici. Basta che ognuno lo apra dal proprio telefono o computer, inserisca il proprio nome, e chi crea la stanza condivide il codice (es. `ABCD`) con gli altri.

> Nota sul piano gratuito di Render: dopo un periodo di inattività il servizio "si addormenta" e il primo che apre il link dopo una pausa lunga aspetta 30-60 secondi per il risveglio. Per un uso occasionale tra amici va benissimo così.

## Limiti di questa prima versione

- **Nessuna riconnessione**: se un giocatore chiude il browser o perde la connessione durante una partita, non può rientrare nella stessa partita — bisogna ricominciare. È una scelta fatta per tenere il progetto semplice in questa prima versione; si può aggiungere in seguito.
- **Nessun database**: le partite vivono in memoria sul server. Se il server si riavvia (es. dopo inattività su Render), le stanze aperte vengono perse.
- **Fino a 6 giocatori** per stanza, come nella versione hotseat.

## Le regole di gioco implementate

Le stesse 9 mani della versione hotseat: Coppia Vestita, Doppia Coppia, Tris, Full, Poker, Scala Reale, Chiusura, Bomba, Trik Trak — con tutte le regole su jolly, divieti di scarto/attacco su J/Q/K/A e 5/10, e punteggio finale a chi totalizza meno punti dopo le 9 mani.
