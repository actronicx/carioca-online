const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const RoomLogic = require("./room");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// codice stanza -> stato partita (in memoria, nessun database)
const stanze = new Map();

function trovaIdxDaSocket(stato, socketId) {
  return stato.socketIds.indexOf(socketId);
}

function inviaStatoATutti(codice) {
  const stato = stanze.get(codice);
  if (!stato) return;
  stato.socketIds.forEach((socketId, idx) => {
    if (socketId) {
      io.to(socketId).emit("statoAggiornato", RoomLogic.serializzaPerGiocatore(stato, idx));
    }
  });
}

io.on("connection", (socket) => {
  socket.on("creaStanza", ({ nome }, callback) => {
    const stato = RoomLogic.nuovaStanza(nome?.trim() || "Host", socket.id);
    stanze.set(stato.codice, stato);
    socket.join(stato.codice);
    callback({ ok: true, codice: stato.codice, idx: 0 });
    inviaStatoATutti(stato.codice);
  });

  socket.on("entraStanza", ({ codice, nome }, callback) => {
    const cod = (codice || "").toUpperCase().trim();
    const stato = stanze.get(cod);
    if (!stato) return callback({ ok: false, errore: "Codice stanza non trovato." });
    const risultato = RoomLogic.entraStanza(stato, nome?.trim() || `Giocatore ${stato.numGiocatori + 1}`, socket.id);
    if (!risultato.ok) return callback(risultato);
    socket.join(cod);
    callback({ ok: true, codice: cod, idx: risultato.idx });
    inviaStatoATutti(cod);
  });

  // Un giocatore che aveva già una sessione (salvata nel browser) riprende il proprio posto
  // dopo una disconnessione, un refresh della pagina o un cambio rete.
  socket.on("riconnettiStanza", ({ codice, idx }, callback) => {
    const cod = (codice || "").toUpperCase().trim();
    const stato = stanze.get(cod);
    if (!stato) return callback?.({ ok: false, errore: "La stanza non esiste più (il server potrebbe essere stato riavviato)." });
    if (typeof idx !== "number" || idx < 0 || idx >= stato.numGiocatori) {
      return callback?.({ ok: false, errore: "Giocatore non valido in questa stanza." });
    }
    stato.socketIds[idx] = socket.id;
    stato.connessi[idx] = true;
    socket.join(cod);
    callback?.({ ok: true, codice: cod, idx });
    inviaStatoATutti(cod);
  });

  socket.on("iniziaPartita", ({ codice, giocatoreInizialeIdx }, callback) => {
    const stato = stanze.get(codice);
    if (!stato) return callback?.({ ok: false, errore: "Stanza non trovata." });
    const idx = trovaIdxDaSocket(stato, socket.id);
    if (idx !== 0) return callback?.({ ok: false, errore: "Solo l'host può avviare la partita." });
    const risultato = RoomLogic.iniziaPartita(stato, giocatoreInizialeIdx || 0);
    callback?.(risultato);
    if (risultato.ok) inviaStatoATutti(codice);
  });

  socket.on("azione", ({ codice, tipo, payload }, callback) => {
    const stato = stanze.get(codice);
    if (!stato) return callback?.({ ok: false, errore: "Stanza non trovata." });
    const idx = trovaIdxDaSocket(stato, socket.id);
    if (idx === -1) return callback?.({ ok: false, errore: "Non fai parte di questa stanza." });

    let risultato;
    switch (tipo) {
      case "sceltaMano":
        risultato = RoomLogic.sceltaMano(stato, idx, payload.idMano);
        break;
      case "pescaMazzo":
        risultato = RoomLogic.pescaDalMazzo(stato, idx);
        break;
      case "pescaPozzo":
        risultato = RoomLogic.pescaDalPozzo(stato, idx);
        break;
      case "scarta":
        risultato = RoomLogic.scarta(stato, idx, payload.idCarta);
        break;
      case "confermaScendi":
        risultato = RoomLogic.confermaScendi(stato, idx, payload.gruppiIds);
        break;
      case "confermaScendiLibero":
        risultato = RoomLogic.confermaScendiLibero(stato, idx, payload.tipo, payload.ids);
        break;
      case "attaccaCarte":
        risultato = RoomLogic.attaccaCarte(stato, idx, payload.giocatoreTarget, payload.gruppoIdx, payload.ids);
        break;
      case "confermaChiusura":
        risultato = RoomLogic.confermaChiusura(stato, idx, payload.gruppiIds);
        break;
      case "prossimaMano":
        risultato = RoomLogic.prossimaMano(stato);
        break;
      default:
        risultato = { ok: false, errore: "Azione sconosciuta." };
    }

    callback?.(risultato);
    if (risultato.ok) inviaStatoATutti(codice);
  });

  socket.on("disconnect", () => {
    for (const [codice, stato] of stanze.entries()) {
      const idx = trovaIdxDaSocket(stato, socket.id);
      if (idx !== -1) {
        stato.connessi[idx] = false;
        inviaStatoATutti(codice);
      }
    }
  });
});

// Serve il client React compilato (cartella client/dist) in produzione
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server Carioca in ascolto sulla porta ${PORT}`);
});
