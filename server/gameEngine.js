// ============ COSTANTI DI GIOCO ============
const SEMI = ["cuori", "quadri", "fiori", "picche"];
const VALORI = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const VALORE_NUM = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
const PUNTI_CARTA = { A: 10, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 10, Q: 10, K: 10, JOLLY: 25 };
const VALORI_VESTITI = ["A", "J", "Q", "K"];
const VALORI_NUMERICI = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];
const NUM_CARTE_MANO = 13;

const MANI = [
  { id: 1, nome: "Coppia Vestita", desc: "Una coppia di Jack, Regine, Re o Assi (semi diversi). Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "coppiaVestita" }], valoriVietati: ["J", "Q", "K", "A"] },
  { id: 2, nome: "Doppia Coppia", desc: "Una coppia vestita (J/Q/K/A) e una coppia non vestita (2-10). Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "coppiaVestita" }, { tipo: "coppiaNonVestita" }], valoriVietati: ["J", "Q", "K", "A"] },
  { id: 3, nome: "Tris", desc: "Tre carte dello stesso valore, tutte di seme diverso", richiesta: [{ tipo: "trisEsatto" }] },
  { id: 4, nome: "Full", desc: "Un tris (semi diversi) più una coppia", richiesta: [{ tipo: "trisEsatto" }, { tipo: "coppiaEsatta" }] },
  { id: 5, nome: "Poker", desc: "Quattro carte dello stesso valore, tutte con seme diverso", richiesta: [{ tipo: "pokerSemiDiversi" }] },
  { id: 6, nome: "Scala Reale", desc: "Cinque carte in sequenza, tutte dello stesso seme. Non si possono scartare né attaccare 5 e 10 finché non sono scesi tutti i giocatori", richiesta: [{ tipo: "scalaReale5" }], valoriVietati: ["5", "10"] },
  { id: 7, nome: "Chiusura", desc: "Nessuna discesa parziale: si vince chiudendo tutta la mano in un colpo solo con tris, poker o scale da 3+ carte (stesso seme), senza jolly", richiesta: [{ tipo: "chiusura" }] },
  { id: 8, nome: "Bomba", desc: "Poker (semi diversi) + scala da 5 dello stesso seme. Non si possono scartare né attaccare 5 e 10 finché non sono scesi tutti i giocatori (a meno che restino solo 5/10 in mano, per lo scarto)", richiesta: [{ tipo: "pokerSemiDiversi" }, { tipo: "scalaReale5" }], valoriVietati: ["5", "10"] },
  { id: 9, nome: "Trik Trak", desc: "Coppia vestita + tris (semi diversi) + scala da 3+ carte stesso seme. Non si possono scartare né attaccare J/Q/K/A finché non sono scesi tutti i giocatori (a meno che restino solo J/Q/K/A in mano, per lo scarto)", richiesta: [{ tipo: "coppiaVestita" }, { tipo: "trisEsatto" }, { tipo: "scalaMin3" }], valoriVietati: ["J", "Q", "K", "A"] },
];

// ============ MAZZO ============
function creaMazzo() {
  const mazzo = [];
  let id = 0;
  for (let m = 0; m < 2; m++) {
    for (const seme of SEMI) {
      for (const valore of VALORI) {
        mazzo.push({ id: `c${id++}`, seme, valore, jolly: false });
      }
    }
    mazzo.push({ id: `j${id++}`, seme: null, valore: "JOLLY", jolly: true });
    mazzo.push({ id: `j${id++}`, seme: null, valore: "JOLLY", jolly: true });
  }
  return mazzo;
}

function mescola(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function puntiCarta(c) {
  return PUNTI_CARTA[c.valore] ?? 5;
}

// ============ VALIDAZIONE COMBINAZIONI ============
function isGruppoStessoValore(carte, { lunghezzaEsatta, valoriAmmessi, semiDiversi = false, permettiJolly = true } = {}) {
  if (lunghezzaEsatta && carte.length !== lunghezzaEsatta) return false;
  if (carte.length < 2) return false;
  const nonJolly = carte.filter((c) => !c.jolly);
  const jollyCount = carte.length - nonJolly.length;
  if (jollyCount > 0 && !permettiJolly) return false;
  if (nonJolly.length === 0) return false;
  const valore = nonJolly[0].valore;
  if (!nonJolly.every((c) => c.valore === valore)) return false;
  if (valoriAmmessi && !valoriAmmessi.includes(valore)) return false;
  if (semiDiversi) {
    const semi = nonJolly.map((c) => c.seme);
    if (new Set(semi).size !== semi.length) return false;
    if (jollyCount > 4 - semi.length) return false;
  } else {
    if (jollyCount > nonJolly.length) return false;
  }
  return true;
}

function isScalaColore(carte, { min = 3, exact = null, permettiJolly = true } = {}) {
  if (exact !== null && carte.length !== exact) return false;
  if (carte.length < min) return false;
  const nonJolly = carte.filter((c) => !c.jolly);
  const jollyCount = carte.length - nonJolly.length;
  if (jollyCount > 0 && !permettiJolly) return false;
  if (nonJolly.length === 0) return false;
  const seme = nonJolly[0].seme;
  if (!nonJolly.every((c) => c.seme === seme)) return false;
  const numeri = nonJolly.map((c) => VALORE_NUM[c.valore]).sort((a, b) => a - b);
  for (let i = 1; i < numeri.length; i++) if (numeri[i] === numeri[i - 1]) return false;
  const minNum = numeri[0];
  const maxNum = numeri[numeri.length - 1];
  const spanNaturale = maxNum - minNum + 1;
  const buchi = spanNaturale - numeri.length;
  if (buchi > jollyCount) return false;
  const jollyResidui = jollyCount - buchi;
  const spanTotale = spanNaturale + jollyResidui;
  return spanTotale === carte.length && spanTotale <= 13;
}

function isCoppiaVestita(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, valoriAmmessi: VALORI_VESTITI, semiDiversi: true, permettiJolly });
}
function isCoppiaNonVestita(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, valoriAmmessi: VALORI_NUMERICI, semiDiversi: true, permettiJolly });
}
function isCoppiaEsatta(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 2, semiDiversi: true, permettiJolly });
}
function isTrisEsatto(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 3, semiDiversi: true, permettiJolly });
}
function isPokerSemiDiversi(carte, permettiJolly = true) {
  return isGruppoStessoValore(carte, { lunghezzaEsatta: 4, semiDiversi: true, permettiJolly });
}
function isScalaReale5(carte, permettiJolly = true) {
  return isScalaColore(carte, { exact: 5, permettiJolly });
}
function isGruppoChiusuraValido(carte) {
  if (carte.length < 3) return false;
  if (carte.length <= 4 && isGruppoStessoValore(carte, { semiDiversi: true, permettiJolly: false })) return true;
  if (isScalaColore(carte, { min: 3, permettiJolly: false })) return true;
  return false;
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

function validaGruppo(carte, richiesta, permettiJolly = true) {
  if (richiesta.tipo === "coppiaVestita") return isCoppiaVestita(carte, permettiJolly);
  if (richiesta.tipo === "coppiaNonVestita") return isCoppiaNonVestita(carte, permettiJolly);
  if (richiesta.tipo === "coppiaEsatta") return isCoppiaEsatta(carte, permettiJolly);
  if (richiesta.tipo === "trisEsatto") return isTrisEsatto(carte, permettiJolly);
  if (richiesta.tipo === "pokerSemiDiversi") return isPokerSemiDiversi(carte, permettiJolly);
  if (richiesta.tipo === "scalaReale5") return isScalaReale5(carte, permettiJolly);
  if (richiesta.tipo === "scalaMin3") return isScalaColore(carte, { min: 3, permettiJolly });
  return false;
}

module.exports = {
  SEMI, VALORI, VALORE_NUM, PUNTI_CARTA, VALORI_VESTITI, VALORI_NUMERICI, NUM_CARTE_MANO, MANI,
  creaMazzo, mescola, puntiCarta,
  isGruppoStessoValore, isScalaColore, isCoppiaVestita, isCoppiaNonVestita, isCoppiaEsatta,
  isTrisEsatto, isPokerSemiDiversi, isScalaReale5, isGruppoChiusuraValido, nomeRichiesta, validaGruppo,
};
