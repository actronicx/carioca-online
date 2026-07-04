import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "./socket";

const SEMI_SIMBOLO = { cuori: "♥", quadri: "♦", fiori: "♣", picche: "♠" };
const SEMI_ROSSO = { cuori: true, quadri: true, fiori: false, picche: false };

const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');`;

// ============ COMPONENTE CARTA ============
function Carta({ carta, selezionata, onClick, piccola, style, dorso }) {
  if (dorso) {
    return (
      <div
        style={{
          width: piccola ? 34 : 58,
          height: piccola ? 48 : 82,
          borderRadius: 6,
          background: "repeating-linear-gradient(45deg, #7a1f1f, #7a1f1f 4px, #5c1717 4px, #5c1717 8px)",
          border: "2px solid #F5E9D3",
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  const rosso = carta.jolly ? false : SEMI_ROSSO[carta.seme];
  return (
    <button
      onClick={onClick}
      style={{
        width: piccola ? 40 : 64,
        height: piccola ? 56 : 90,
        borderRadius: 7,
        background: "#F5E9D3",
        border: selezionata ? "3px solid #D4AF37" : "1.5px solid #b8a888",
        boxShadow: selezionata
          ? "0 6px 14px rgba(212,175,55,0.5), 0 0 0 2px rgba(212,175,55,0.3)"
          : "0 2px 5px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "'Fraunces', Georgia, serif",
        color: carta.jolly ? "#8B6F00" : rosso ? "#C1272D" : "#1A1A1A",
        fontWeight: 700,
        transform: selezionata ? "translateY(-10px)" : "translateY(0)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        padding: 0,
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
    >
      {carta.jolly ? (
        <>
          <div style={{ fontSize: piccola ? 9 : 13 }}>★</div>
          <div style={{ fontSize: piccola ? 8 : 11 }}>JOLLY</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: piccola ? 13 : 20, lineHeight: 1 }}>{carta.valore}</div>
          <div style={{ fontSize: piccola ? 14 : 22, lineHeight: 1 }}>{SEMI_SIMBOLO[carta.seme]}</div>
        </>
      )}
    </button>
  );
}

function nomeRichiesta(r) {
  switch (r.tipo) {
    case "coppiaVestita": return "Coppia Vestita (J/Q/K/A)";
    case "coppiaNonVestita": return "Coppia (2-10)";
    case "coppiaEsatta": return "Coppia";
    case "trisEsatto": return "Tris (semi diversi)";
    case "pokerSemiDiversi": return "Poker (semi diversi)";
    case "scalaReale5": return "Scala Reale (5 carte)";
    case "scalaMin3": return "Scala (3+ carte)";
    default: return r.tipo;
  }
}

export default function App() {
  // ---------- STATO DI CONNESSIONE / STANZA ----------
  const [connesso, setConnesso] = useState(socket.connected);
  const [nome, setNome] = useState("");
  const [codiceInput, setCodiceInput] = useState("");
  const [codice, setCodice] = useState(null);
  const [mioIndice, setMioIndice] = useState(null);
  const [erroreHome, setErroreHome] = useState("");
  const [stato, setStato] = useState(null); // stato di gioco personalizzato ricevuto dal server
  const [giocatoreInizialeLobby, setGiocatoreInizialeLobby] = useState(0);

  // ---------- STATO UI LOCALE DI GIOCO ----------
  const [selezione, setSelezione] = useState([]);
  const [modalitaSceltaMano, setModalitaSceltaMano] = useState(false);
  const [modalitaScendi, setModalitaScendi] = useState(false);
  const [gruppiProposti, setGruppiProposti] = useState([]);
  const [modalitaScendiLibero, setModalitaScendiLibero] = useState(false);
  const [tipoScendiLibero, setTipoScendiLibero] = useState(null);
  const [modalitaChiusura, setModalitaChiusura] = useState(false);
  const [chiusuraGruppi, setChiusuraGruppi] = useState([]);
  const [erroreAzione, setErroreAzione] = useState("");
  const [manoOrdinata, setManoOrdinata] = useState([]); // ordine locale delle carte in mano (drag&drop)

  // ---------- DRAG & DROP ----------
  const dragStartRef = useRef(null);
  const manoContainerRef = useRef(null);
  const draggingIdRef = useRef(null);
  const didDragRef = useRef(false);
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    function onConnect() { setConnesso(true); }
    function onDisconnect() { setConnesso(false); }
    function onStato(nuovoStato) {
      setStato(nuovoStato);
      setMioIndice(nuovoStato.tuoIndice);
    }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("statoAggiornato", onStato);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("statoAggiornato", onStato);
    };
  }, []);

  // Riconcilia l'ordine locale della mano con le carte ricevute dal server
  useEffect(() => {
    const manoServer = stato?.manoGiocatore || [];
    setManoOrdinata((prev) => {
      const prevIds = prev.map((c) => c.id);
      const serverIds = manoServer.map((c) => c.id);
      const kept = prev.filter((c) => serverIds.includes(c.id));
      const nuove = manoServer.filter((c) => !prevIds.includes(c.id));
      return [...kept, ...nuove];
    });
  }, [stato?.manoGiocatore]);

  const emitAzione = useCallback((tipo, payload = {}) => {
    setErroreAzione("");
    socket.emit("azione", { codice, tipo, payload }, (risultato) => {
      if (!risultato?.ok) setErroreAzione(risultato?.errore || "Azione non riuscita.");
    });
  }, [codice]);

  function creaStanza() {
    if (!nome.trim()) { setErroreHome("Inserisci il tuo nome."); return; }
    socket.emit("creaStanza", { nome: nome.trim() }, (risultato) => {
      if (!risultato.ok) { setErroreHome(risultato.errore || "Errore."); return; }
      setCodice(risultato.codice);
      setMioIndice(risultato.idx);
    });
  }

  function entraStanza() {
    if (!nome.trim()) { setErroreHome("Inserisci il tuo nome."); return; }
    if (!codiceInput.trim()) { setErroreHome("Inserisci il codice della stanza."); return; }
    socket.emit("entraStanza", { codice: codiceInput.trim(), nome: nome.trim() }, (risultato) => {
      if (!risultato.ok) { setErroreHome(risultato.errore || "Errore."); return; }
      setCodice(risultato.codice);
      setMioIndice(risultato.idx);
    });
  }

  function iniziaPartitaHost() {
    socket.emit("iniziaPartita", { codice, giocatoreInizialeIdx: giocatoreInizialeLobby }, (risultato) => {
      if (!risultato?.ok) setErroreAzione(risultato?.errore || "Errore nell'avvio della partita.");
    });
  }

  // ---------- DRAG & DROP RIORDINO CARTE IN MANO ----------
  function handleCardPointerDown(e, idCarta) {
    didDragRef.current = false;
    dragStartRef.current = { id: idCarta, x: e.clientX };
  }

  const handleWindowPointerMove = useCallback((e) => {
    if (!dragStartRef.current) return;
    const { id: startId, x: startX } = dragStartRef.current;
    if (!draggingIdRef.current) {
      if (Math.abs(e.clientX - startX) < 6) return;
      draggingIdRef.current = startId;
      didDragRef.current = true;
      setDraggingId(startId);
    }
    const idAttivo = draggingIdRef.current;
    const container = manoContainerRef.current;
    if (!container) return;
    const cards = Array.from(container.querySelectorAll("[data-card-id]"));
    setManoOrdinata((prev) => {
      const currentIds = prev.map((c) => c.id);
      const fromIdx = currentIds.indexOf(idAttivo);
      if (fromIdx === -1) return prev;
      let toIdx = fromIdx;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        if (e.clientX < mid) { toIdx = i; break; }
        toIdx = i + 1;
      }
      if (toIdx > fromIdx) toIdx -= 1;
      toIdx = Math.max(0, Math.min(toIdx, currentIds.length - 1));
      if (toIdx === fromIdx) return prev;
      const arr = [...prev];
      const idx2 = arr.findIndex((c) => c.id === idAttivo);
      const [moved] = arr.splice(idx2, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
  }, []);

  const handleWindowPointerUp = useCallback(() => {
    dragStartRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  function onCartaClick(idCarta) {
    if (didDragRef.current) { didDragRef.current = false; return; }
    setSelezione((sel) => (sel.includes(idCarta) ? sel.filter((x) => x !== idCarta) : [...sel, idCarta]));
  }

  // ============ SCHERMATA HOME (nessuna stanza ancora) ============
  if (!codice) {
    return (
      <div style={styles.tavoloSetup}>
        <style>{fontImport}</style>
        <div style={styles.setupCard}>
          <h1 style={styles.titolo}>Carioca Online</h1>
          <p style={styles.sottotitolo}>{connesso ? "Connesso al server" : "Connessione al server in corso..."}</p>

          <label style={styles.label}>Il tuo nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Il tuo nome" style={{ ...styles.input, marginBottom: 20 }} />

          <button onClick={creaStanza} style={styles.startBtn}>Crea una nuova stanza</button>

          <div style={{ textAlign: "center", color: "#F5E9D3AA", fontSize: 12, margin: "18px 0" }}>oppure</div>

          <label style={styles.label}>Codice stanza di un amico</label>
          <input
            value={codiceInput}
            onChange={(e) => setCodiceInput(e.target.value.toUpperCase())}
            placeholder="Es. ABCD"
            style={{ ...styles.input, marginBottom: 12, textTransform: "uppercase" }}
          />
          <button onClick={entraStanza} style={{ ...styles.startBtn, background: "rgba(245,233,211,0.12)", color: "#F5E9D3", border: "1px solid rgba(212,175,55,0.5)" }}>
            Unisciti alla stanza
          </button>

          {erroreHome && <div style={{ ...styles.messaggio, marginTop: 16 }}>{erroreHome}</div>}
        </div>
      </div>
    );
  }

  if (!stato) {
    return (
      <div style={styles.tavoloSetup}>
        <style>{fontImport}</style>
        <div style={styles.setupCard}>
          <p style={{ color: "#F5E9D3", textAlign: "center" }}>Caricamento della stanza {codice}...</p>
        </div>
      </div>
    );
  }

  // ============ SCHERMATA LOBBY (in attesa che l'host avvii) ============
  if (stato.fase === "lobby") {
    const sonoHost = mioIndice === 0;
    return (
      <div style={styles.tavoloSetup}>
        <style>{fontImport}</style>
        <div style={styles.setupCard}>
          <h1 style={styles.titolo}>Carioca Online</h1>
          <p style={{ textAlign: "center", color: "#D4AF37", fontWeight: 700, fontSize: 22, letterSpacing: 3, marginBottom: 4 }}>{stato.codice}</p>
          <p style={{ textAlign: "center", color: "#F5E9D3AA", fontSize: 12, marginBottom: 24 }}>Condividi questo codice con i tuoi amici</p>

          <label style={styles.label}>Giocatori nella stanza ({stato.numGiocatori}/6)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {stato.nomi.map((n, i) => (
              <div key={i} style={{ ...styles.punteggioChip, display: "flex", justifyContent: "space-between" }}>
                <span>{n}{i === 0 ? " (host)" : ""}{i === mioIndice ? " — tu" : ""}</span>
                <span style={{ color: stato.connessi[i] ? "#7CCB7C" : "#C1272D" }}>{stato.connessi[i] ? "●" : "○"}</span>
              </div>
            ))}
          </div>

          {sonoHost ? (
            <>
              <label style={styles.label}>Chi inizia e sceglie la prima mano</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {stato.nomi.map((n, i) => (
                  <button
                    key={i}
                    onClick={() => setGiocatoreInizialeLobby(i)}
                    style={{
                      ...styles.opzioneManoBtn,
                      padding: "8px 14px",
                      background: giocatoreInizialeLobby === i ? "#D4AF37" : "rgba(255,255,255,0.06)",
                      color: giocatoreInizialeLobby === i ? "#0B4D3A" : "#F5E9D3",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={iniziaPartitaHost} disabled={stato.numGiocatori < 2} style={{ ...styles.startBtn, opacity: stato.numGiocatori < 2 ? 0.5 : 1 }}>
                {stato.numGiocatori < 2 ? "Servono almeno 2 giocatori" : "Inizia partita"}
              </button>
            </>
          ) : (
            <p style={{ textAlign: "center", color: "#F5E9D3AA", fontSize: 13 }}>In attesa che l'host avvii la partita...</p>
          )}

          {erroreAzione && <div style={{ ...styles.messaggio, marginTop: 16 }}>{erroreAzione}</div>}
        </div>
      </div>
    );
  }

  // ============ SCHERMATA FINE MANO ============
  if (stato.fase === "manoFinita") {
    const ultimo = stato.storicoPunteggi[stato.storicoPunteggi.length - 1];
    const sonoHost = mioIndice === 0;
    return (
      <div style={styles.tavoloSetup}>
        <style>{fontImport}</style>
        <div style={styles.setupCard}>
          <h2 style={{ ...styles.titolo, fontSize: 30 }}>Fine mano {stato.round + 1}/9 — {ultimo.manoNome}</h2>
          <p style={{ color: "#D4AF37", fontWeight: 600, marginBottom: 16, textAlign: "center" }}>{stato.messaggio}</p>
          <table style={styles.tabella}>
            <thead><tr><th style={styles.th}>Giocatore</th><th style={styles.th}>Punti mano</th><th style={styles.th}>Totale</th></tr></thead>
            <tbody>
              {stato.nomi.map((n, i) => (
                <tr key={i}>
                  <td style={styles.td}>{n}{i === ultimo.vincitore ? " 👑" : ""}</td>
                  <td style={styles.td}>{ultimo.punti[i]}</td>
                  <td style={{ ...styles.td, fontWeight: 700, color: "#D4AF37" }}>{stato.punteggi[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sonoHost ? (
            <button onClick={() => emitAzione("prossimaMano")} style={{ ...styles.startBtn, marginTop: 24 }}>
              {stato.maniRimanenti.length === 0 ? "Vedi risultato finale" : "Continua alla prossima mano"}
            </button>
          ) : (
            <p style={{ textAlign: "center", color: "#F5E9D3AA", fontSize: 13, marginTop: 20 }}>In attesa che l'host continui...</p>
          )}
        </div>
      </div>
    );
  }

  // ============ SCHERMATA PARTITA FINITA ============
  if (stato.fase === "partitaFinita") {
    const ordinati = stato.nomi.map((n, i) => ({ nome: n, punti: stato.punteggi[i] })).sort((a, b) => a.punti - b.punti);
    return (
      <div style={styles.tavoloSetup}>
        <style>{fontImport}</style>
        <div style={styles.setupCard}>
          <h1 style={styles.titolo}>Partita finita! 🏆</h1>
          <p style={{ color: "#D4AF37", marginBottom: 20, textAlign: "center" }}>Vince chi ha meno punti</p>
          <table style={styles.tabella}>
            <thead><tr><th style={styles.th}>Posizione</th><th style={styles.th}>Giocatore</th><th style={styles.th}>Punti</th></tr></thead>
            <tbody>
              {ordinati.map((g, i) => (
                <tr key={i}>
                  <td style={styles.td}>{i + 1}°{i === 0 ? " 👑" : ""}</td>
                  <td style={styles.td}>{g.nome}</td>
                  <td style={styles.td}>{g.punti}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ============ SCHERMATA GIOCO ============
  const manoGiocatore = manoOrdinata;
  const sonoIoDiTurno = mioIndice === stato.turno;

  return (
    <div style={styles.tavolo}>
      <style>{fontImport}</style>

      <div style={styles.header}>
        <div>
          <div style={styles.manoLabel}>
            {stato.manoAttuale ? `Mano ${stato.round + 1}/9 — ${stato.manoAttuale.nome}` : `Round ${stato.round + 1}/9 — in attesa della scelta`}
          </div>
          <div style={styles.manoDesc}>
            {stato.manoAttuale ? stato.manoAttuale.desc : `Tocca a ${stato.nomi[stato.turno]} scegliere quale mano giocare`}
          </div>
        </div>
        <div style={styles.punteggiHeader}>
          {stato.nomi.map((n, i) => (
            <div key={i} style={{ ...styles.punteggioChip, outline: stato.turno === i ? "2px solid #D4AF37" : "none" }}>
              {n}{i === mioIndice ? " (tu)" : ""}{stato.sceso[i] ? " ✓" : ""}: <strong>{stato.punteggi[i]}</strong>
              <span style={{ color: "#F5E9D3AA", marginLeft: 6 }}>{stato.carteAltri[i]} carte</span>
            </div>
          ))}
        </div>
      </div>

      {stato.messaggio && <div style={styles.messaggio}>{stato.messaggio}</div>}
      {erroreAzione && <div style={{ ...styles.messaggio, borderColor: "#C1272D" }}>{erroreAzione}</div>}

      {/* Pulsante "Scegli la mano" — solo per chi è di turno e la mano non è ancora scelta */}
      {!stato.manoAttuale && sonoIoDiTurno && !modalitaSceltaMano && (
        <button onClick={() => setModalitaSceltaMano(true)} style={{ ...styles.startBtn, maxWidth: 320, margin: "0 auto" }}>
          Scegli la mano
        </button>
      )}
      {!stato.manoAttuale && !sonoIoDiTurno && (
        <p style={{ textAlign: "center", color: "#F5E9D3AA", fontSize: 13 }}>In attesa che {stato.nomi[stato.turno]} scelga la mano...</p>
      )}

      {modalitaSceltaMano && (
        <div style={styles.scendiBox}>
          <div style={{ fontWeight: 700, color: "#D4AF37", marginBottom: 10 }}>Scegli quale mano giocare in questo round:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stato.maniDisponibili
              .filter((m) => stato.maniRimanenti.includes(m.id))
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => { emitAzione("sceltaMano", { idMano: m.id }); setModalitaSceltaMano(false); }}
                  style={styles.opzioneManoBtn}
                >
                  <div style={{ fontWeight: 700, fontFamily: "'Fraunces', serif", fontSize: 16 }}>{m.nome}</div>
                  <div style={{ fontSize: 12, color: "#F5E9D3AA", marginTop: 2 }}>{m.desc}</div>
                </button>
              ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setModalitaSceltaMano(false)} style={styles.annullaBtn}>Annulla</button>
          </div>
        </div>
      )}

      {/* Combinazioni scese sul tavolo */}
      <div style={styles.zonaCombinazioni}>
        {stato.combinazioniScese.map((giocCombo, gi) =>
          giocCombo.length > 0 ? (
            <div key={gi} style={styles.righeGiocatore}>
              <div style={styles.nomeGiocatoreCombo}>{stato.nomi[gi]}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {giocCombo.map((grp, gpi) => (
                  <div
                    key={gpi}
                    onClick={() => {
                      if (sonoIoDiTurno && !modalitaScendi && !modalitaScendiLibero && !modalitaChiusura && stato.sceso[mioIndice] && selezione.length > 0) {
                        emitAzione("attaccaCarte", { giocatoreTarget: gi, gruppoIdx: gpi, ids: selezione });
                        setSelezione([]);
                      }
                    }}
                    style={{ ...styles.gruppoBox, cursor: sonoIoDiTurno && stato.sceso[mioIndice] && selezione.length > 0 ? "pointer" : "default" }}
                  >
                    <div style={{ display: "flex" }}>
                      {grp.carte.map((c, ci) => (
                        <Carta key={c.id} carta={c} piccola style={{ marginLeft: ci === 0 ? 0 : -18 }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Mazzo e pozzo */}
      {stato.manoAttuale && (
        <div style={styles.zonaCentro}>
          <div style={styles.pilaContainer}>
            <div
              onClick={() => sonoIoDiTurno && !stato.haPescato && emitAzione("pescaMazzo")}
              style={{ cursor: sonoIoDiTurno && !stato.haPescato ? "pointer" : "default", opacity: stato.haPescato || !sonoIoDiTurno ? 0.5 : 1 }}
            >
              <Carta dorso />
            </div>
            <div style={styles.pilaLabel}>Mazzo ({stato.mazzoCount})</div>
          </div>
          <div style={styles.pilaContainer}>
            {stato.pozzo.length > 0 ? (
              <div
                onClick={() => sonoIoDiTurno && !stato.haPescato && emitAzione("pescaPozzo")}
                style={{ cursor: sonoIoDiTurno && !stato.haPescato ? "pointer" : "default", opacity: stato.haPescato || !sonoIoDiTurno ? 0.5 : 1 }}
              >
                <Carta carta={stato.pozzo[stato.pozzo.length - 1]} />
              </div>
            ) : (
              <div style={{ width: 64, height: 90 }} />
            )}
            <div style={styles.pilaLabel}>Pozzo</div>
          </div>
        </div>
      )}

      {/* Modalità scendi: gruppi richiesti dalla mano */}
      {modalitaScendi && stato.manoAttuale && (
        <div style={styles.scendiBox}>
          <div style={{ fontWeight: 700, color: "#D4AF37", marginBottom: 8 }}>
            Componi: {stato.manoAttuale.richiesta.map((r) => nomeRichiesta(r)).join(" + ")}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {gruppiProposti.map((gruppo, idx) => (
              <div
                key={idx}
                style={styles.gruppoSlot}
                onClick={() => {
                  if (selezione.length === 0) return;
                  setGruppiProposti((gp) => {
                    const nuovo = gp.map((g) => g.filter((id) => !selezione.includes(id)));
                    nuovo[idx] = [...nuovo[idx], ...selezione];
                    return nuovo;
                  });
                  setSelezione([]);
                }}
              >
                <div style={{ fontSize: 11, color: "#F5E9D3AA", marginBottom: 4 }}>
                  Gruppo {idx + 1} ({nomeRichiesta(stato.manoAttuale.richiesta[idx])})
                </div>
                <div style={{ display: "flex", gap: 4, minHeight: 56, flexWrap: "wrap" }}>
                  {gruppo.map((id) => {
                    const c = manoGiocatore.find((cc) => cc.id === id);
                    return c ? <Carta key={id} carta={c} piccola /> : null;
                  })}
                  {gruppo.length === 0 && <div style={{ color: "#F5E9D355", fontSize: 12, alignSelf: "center" }}>Clicca qui dopo aver selezionato carte</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => {
                emitAzione("confermaScendi", { gruppiIds: gruppiProposti });
                setModalitaScendi(false);
                setGruppiProposti([]);
              }}
              style={styles.confermaBtn}
            >
              Conferma discesa
            </button>
            <button onClick={() => { setModalitaScendi(false); setGruppiProposti([]); }} style={styles.annullaBtn}>Annulla</button>
          </div>
        </div>
      )}

      {/* Scendi libero: tris/poker/scala extra */}
      {modalitaScendiLibero && (
        <div style={styles.scendiBox}>
          <div style={{ fontWeight: 700, color: "#D4AF37", marginBottom: 8 }}>
            Seleziona le carte per {tipoScendiLibero === "tris" ? "il Tris" : tipoScendiLibero === "poker" ? "il Poker" : "la Scala"}
          </div>
          <div style={{ display: "flex", gap: 4, minHeight: 56, flexWrap: "wrap" }}>
            {selezione.length === 0 && <div style={{ color: "#F5E9D355", fontSize: 12, alignSelf: "center" }}>Tocca le carte in mano per selezionarle</div>}
            {selezione.map((id) => {
              const c = manoGiocatore.find((cc) => cc.id === id);
              return c ? <Carta key={id} carta={c} piccola /> : null;
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => {
                emitAzione("confermaScendiLibero", { tipo: tipoScendiLibero, ids: selezione });
                setModalitaScendiLibero(false);
                setTipoScendiLibero(null);
                setSelezione([]);
              }}
              style={styles.confermaBtn}
            >
              Conferma
            </button>
            <button onClick={() => { setModalitaScendiLibero(false); setTipoScendiLibero(null); setSelezione([]); }} style={styles.annullaBtn}>Annulla</button>
          </div>
        </div>
      )}

      {/* Chiusura (mano 7): componi tutta la mano */}
      {modalitaChiusura && (
        <div style={styles.scendiBox}>
          <div style={{ fontWeight: 700, color: "#D4AF37", marginBottom: 8 }}>
            Componi TUTTE le {manoGiocatore.length} carte in gruppi validi (tris, poker o scale da 3+ carte stesso seme — niente jolly)
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {chiusuraGruppi.map((gruppo, idx) => (
              <div
                key={idx}
                style={styles.gruppoSlot}
                onClick={() => {
                  if (selezione.length === 0) return;
                  setChiusuraGruppi((g) => {
                    const nuovo = g.map((x) => x.filter((id) => !selezione.includes(id)));
                    nuovo[idx] = [...nuovo[idx], ...selezione];
                    return nuovo;
                  });
                  setSelezione([]);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#F5E9D3AA" }}>Gruppo {idx + 1}</span>
                  {chiusuraGruppi.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setChiusuraGruppi((g) => g.filter((_, i) => i !== idx)); }}
                      style={{ background: "transparent", border: "none", color: "#C1272D", cursor: "pointer", fontWeight: 700, fontSize: 14 }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, minHeight: 56, flexWrap: "wrap" }}>
                  {gruppo.map((id) => {
                    const c = manoGiocatore.find((cc) => cc.id === id);
                    return c ? <Carta key={id} carta={c} piccola /> : null;
                  })}
                  {gruppo.length === 0 && <div style={{ color: "#F5E9D355", fontSize: 12, alignSelf: "center" }}>Clicca qui dopo aver selezionato carte</div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setChiusuraGruppi((g) => [...g, []])} style={styles.annullaBtn}>+ Nuovo gruppo</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => {
                emitAzione("confermaChiusura", { gruppiIds: chiusuraGruppi });
                setModalitaChiusura(false);
                setChiusuraGruppi([]);
              }}
              style={styles.confermaBtn}
            >
              Conferma chiusura
            </button>
            <button onClick={() => { setModalitaChiusura(false); setChiusuraGruppi([]); }} style={styles.annullaBtn}>Annulla</button>
          </div>
        </div>
      )}

      {/* Azioni normali (mani 1-6, 8, 9) */}
      {stato.manoAttuale && sonoIoDiTurno && !modalitaScendi && !modalitaScendiLibero && !modalitaChiusura && stato.manoAttuale.id !== 7 && (
        <div style={styles.azioni}>
          <button
            onClick={() => { if (selezione.length === 1) { emitAzione("scarta", { idCarta: selezione[0] }); setSelezione([]); } else setErroreAzione("Seleziona esattamente una carta da scartare."); }}
            disabled={!stato.haPescato}
            style={{ ...styles.azioneBtn, opacity: stato.haPescato ? 1 : 0.4 }}
          >
            Scarta carta selezionata
          </button>
          {!stato.sceso[mioIndice] && (
            <button
              onClick={() => { setGruppiProposti(stato.manoAttuale.richiesta.map(() => [])); setModalitaScendi(true); setSelezione([]); }}
              disabled={!stato.haPescato}
              style={{ ...styles.azioneBtn, opacity: stato.haPescato ? 1 : 0.4 }}
            >
              Scendi con {stato.manoAttuale.nome}
            </button>
          )}
          {stato.sceso[mioIndice] && (
            <>
              <button onClick={() => { setTipoScendiLibero("tris"); setModalitaScendiLibero(true); setSelezione([]); }} style={styles.azioneBtnSecondario}>Scendi Tris</button>
              <button onClick={() => { setTipoScendiLibero("poker"); setModalitaScendiLibero(true); setSelezione([]); }} style={styles.azioneBtnSecondario}>Scendi Poker</button>
              <button onClick={() => { setTipoScendiLibero("scala"); setModalitaScendiLibero(true); setSelezione([]); }} style={styles.azioneBtnSecondario}>Scendi Scala</button>
            </>
          )}
        </div>
      )}

      {/* Azioni mano 7: Chiusura */}
      {stato.manoAttuale && stato.manoAttuale.id === 7 && sonoIoDiTurno && !modalitaChiusura && (
        <div style={styles.azioni}>
          <button
            onClick={() => { if (selezione.length === 1) { emitAzione("scarta", { idCarta: selezione[0] }); setSelezione([]); } else setErroreAzione("Seleziona esattamente una carta da scartare."); }}
            disabled={!stato.haPescato}
            style={{ ...styles.azioneBtn, opacity: stato.haPescato ? 1 : 0.4 }}
          >
            Scarta carta selezionata
          </button>
          <button onClick={() => { setChiusuraGruppi([[]]); setModalitaChiusura(true); setSelezione([]); }} disabled={!stato.haPescato} style={styles.azioneBtnSecondario}>
            Tenta chiusura
          </button>
        </div>
      )}

      {/* Mano del giocatore */}
      <div style={styles.zonaMano}>
        <div style={styles.turnoLabel}>
          {sonoIoDiTurno ? (stato.haPescato ? "È il tuo turno — gioca" : "È il tuo turno — pesca una carta") : `Turno di: ${stato.nomi[stato.turno]}`}
          <span style={{ color: "#F5E9D355", fontWeight: 400, marginLeft: 8 }}>(trascina le carte per riordinarle)</span>
        </div>
        <div style={styles.ventaglio} ref={manoContainerRef}>
          {manoGiocatore.map((c, i) => (
            <div
              key={c.id}
              data-card-id={c.id}
              onPointerDown={(e) => handleCardPointerDown(e, c.id)}
              style={{
                marginLeft: i === 0 ? 0 : -24,
                touchAction: "none",
                cursor: "grab",
                position: "relative",
                opacity: draggingId === c.id ? 0.5 : 1,
                zIndex: draggingId === c.id ? 10 : 1,
              }}
            >
              <Carta carta={c} selezionata={selezione.includes(c.id)} onClick={() => onCartaClick(c.id)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ STILI ============
const styles = {
  tavolo: { minHeight: "100vh", background: "radial-gradient(ellipse at center, #0f5c45 0%, #0B4D3A 60%, #073527 100%)", fontFamily: "'Inter', sans-serif", color: "#F5E9D3", padding: "12px 16px 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 },
  tavoloSetup: { minHeight: "100vh", background: "radial-gradient(ellipse at center, #0f5c45 0%, #0B4D3A 60%, #073527 100%)", fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box" },
  setupCard: { background: "rgba(0,0,0,0.25)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 16, padding: "32px 28px", maxWidth: 440, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" },
  titolo: { fontFamily: "'Fraunces', serif", fontSize: 38, color: "#D4AF37", margin: "0 0 4px", textAlign: "center" },
  sottotitolo: { textAlign: "center", color: "#F5E9D3AA", fontSize: 13, marginBottom: 28 },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#D4AF37", marginBottom: 8, display: "block" },
  input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(245,233,211,0.2)", borderRadius: 8, padding: "10px 12px", color: "#F5E9D3", fontSize: 14, fontFamily: "'Inter', sans-serif" },
  startBtn: { width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#D4AF37", color: "#0B4D3A", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "'Inter', sans-serif" },
  opzioneManoBtn: { textAlign: "left", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.35)", borderRadius: 10, padding: "12px 14px", color: "#F5E9D3", cursor: "pointer", fontFamily: "'Inter', sans-serif" },
  tabella: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  th: { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid rgba(212,175,55,0.4)", color: "#D4AF37", fontSize: 12, textTransform: "uppercase" },
  td: { padding: "8px 6px", borderBottom: "1px solid rgba(245,233,211,0.1)", fontSize: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 },
  manoLabel: { fontFamily: "'Fraunces', serif", fontSize: 20, color: "#D4AF37" },
  manoDesc: { fontSize: 12, color: "#F5E9D3AA" },
  punteggiHeader: { display: "flex", gap: 8, flexWrap: "wrap" },
  punteggioChip: { background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "6px 10px", fontSize: 12 },
  messaggio: { background: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  zonaCombinazioni: { minHeight: 40, display: "flex", flexDirection: "column", gap: 8 },
  righeGiocatore: { background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "8px 10px" },
  nomeGiocatoreCombo: { fontSize: 11, color: "#D4AF37", marginBottom: 4, fontWeight: 600 },
  gruppoBox: { background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 6 },
  zonaCentro: { display: "flex", justifyContent: "center", gap: 40, padding: "10px 0" },
  pilaContainer: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  pilaLabel: { fontSize: 11, color: "#F5E9D3AA" },
  scendiBox: { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 12, padding: 14 },
  gruppoSlot: { background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 8, minWidth: 160, cursor: "pointer", border: "1px dashed rgba(212,175,55,0.3)" },
  confermaBtn: { background: "#D4AF37", color: "#0B4D3A", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" },
  annullaBtn: { background: "transparent", color: "#F5E9D3", border: "1px solid rgba(245,233,211,0.3)", borderRadius: 8, padding: "8px 16px", cursor: "pointer" },
  azioni: { display: "flex", gap: 10, flexWrap: "wrap" },
  azioneBtn: { background: "rgba(212,175,55,0.9)", color: "#0B4D3A", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  azioneBtnSecondario: { background: "rgba(245,233,211,0.12)", color: "#F5E9D3", border: "1px solid rgba(212,175,55,0.5)", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  zonaMano: { marginTop: "auto", paddingTop: 10, borderTop: "1px solid rgba(245,233,211,0.15)" },
  turnoLabel: { fontSize: 13, color: "#D4AF37", marginBottom: 8, fontWeight: 600 },
  ventaglio: { display: "flex", justifyContent: "center", flexWrap: "wrap", paddingBottom: 8 },
};
