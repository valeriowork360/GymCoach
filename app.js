/* Gym Coach — registro allenamenti con video, chat e consigli sul carico.
   Tutti i dati restano nel browser (localStorage) del telefono. */

const LS = "gymcoach_v1";
const APP_VERSION = "101";
const $ = s => document.querySelector(s);

/* ---------------- stato ---------------- */
function defState(){
  return {
    cyclePos:-1,          // indice nel CYCLE dell'ultimo passaggio completato
    cur:null,             // sessione in corso
    history:[],           // sessioni archiviate
    sugg:{},              // carico consigliato per la prossima volta, per esercizio
    ui:{videoHidden:false},
    settings:{provider:"gemini",orKey:"",orModel:"moonshotai/kimi-k2.6:free",apiKey:"",model:"gemini-3.8-flash",inc:{db:2,bb:1.25,plate:1.25,cable:2.5,machine:2.5,bw:2.5},incLb:{db:5,bb:2.5,plate:2.5,cable:5,machine:10,bw:5},defUnit:"kg",think:"low",ghToken:"",ghRepo:"valeriowork360/GymCoach-dati"},
    sync:{pending:false,last:0,err:""}
  };
}
function loadState(){
  try{
    const s = JSON.parse(localStorage.getItem(LS));
    if(s){ const d=defState(); return {...d,...s,sync:{...d.sync,...s.sync},settings:{...d.settings,...s.settings,inc:{...d.settings.inc,...(s.settings||{}).inc},incLb:{...d.settings.incLb,...(s.settings||{}).incLb}},ui:{...d.ui,...s.ui}}; }
  }catch(e){}
  return defState();
}
/* se pagina e script sono di versioni diverse (aggiornamento a metà), ricarico una volta */
(function(){ try{ const hv=(document.querySelector('meta[name="app-version"]')||{}).content;
  if(hv && hv!==APP_VERSION && !sessionStorage.getItem("gc_reload_"+APP_VERSION)){ sessionStorage.setItem("gc_reload_"+APP_VERSION,"1"); location.replace(location.pathname+"?r="+Date.now()); }
}catch(e){} })();
let st = loadState();
if(!st.settings.perSideMigrated){ if(st.settings.inc.bb===2.5) st.settings.inc.bb=1.25; if(st.settings.incLb.bb===5) st.settings.incLb.bb=2.5; st.settings.perSideMigrated=true; }
if(st.settings.model==="gemini-flash-latest") st.settings.model="gemini-3.8-flash";   // modello Flash più capace del livello gratuito
function save(){ try{ localStorage.setItem(LS, JSON.stringify(st)); }catch(e){ sys("Attenzione: impossibile salvare sul dispositivo."); } }

/* ---------------- utilità ---------------- */
const esc = t => String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* markdown essenziale per le risposte del coach: titoli, elenchi, tabelle, grassetto */
const mdInl = x => esc(x).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[\s(])\*(\S[^*]*?)\*/g,"$1<i>$2</i>");
function md(t){
  const L=String(t||"").replace(/\r/g,"").split("\n"), out=[]; let i=0;
  const isRow=x=>/^\s*\|.*\|\s*$/.test(x), isSep=x=>/^\s*\|[\s:|-]+\|\s*$/.test(x);
  const cells=r=>r.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
  while(i<L.length){
    const l=L[i]; let m;
    if(isRow(l)){ const rows=[]; while(i<L.length&&isRow(L[i])) rows.push(L[i++]);
      const head=rows.length>1&&isSep(rows[1]);
      out.push(`<table class="mt">${rows.filter(r=>!isSep(r)).map((r,k)=>`<tr>${cells(r).map(c=>head&&k===0?`<th>${mdInl(c)}</th>`:`<td>${mdInl(c)}</td>`).join("")}</tr>`).join("")}</table>`); continue; }
    if((m=l.match(/^\s*(#{1,4})\s+(.*)$/))){ out.push(`<div class="mh${Math.min(3,m[1].length)}">${mdInl(m[2])}</div>`); i++; continue; }
    if(/^\s*[-*•]\s+/.test(l)){ let h=""; while(i<L.length&&/^\s*[-*•]\s+/.test(L[i])) h+=`<li>${mdInl(L[i++].replace(/^\s*[-*•]\s+/,""))}</li>`; out.push(`<ul>${h}</ul>`); continue; }
    if(/^\s*\d+[.)]\s+/.test(l)){ let h=""; while(i<L.length&&/^\s*\d+[.)]\s+/.test(L[i])) h+=`<li>${mdInl(L[i++].replace(/^\s*\d+[.)]\s+/,""))}</li>`; out.push(`<ol>${h}</ol>`); continue; }
    if(!l.trim()){ out.push(`<div class="sp"></div>`); i++; continue; }
    out.push(mdInl(l)+(i+1<L.length&&L[i+1].trim()&&!isRow(L[i+1])&&!/^\s*(#|[-*•]\s|\d+[.)]\s)/.test(L[i+1])?"<br>":"")); i++;
  }
  return out.join("");
}
const fmtT = s => { s=Math.max(0,Math.round(s)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
const restTxt = s => s%60===0 ? (s/60)+" min" : fmtT(s);
const kgTxt = k => k==null ? "?" : (Math.round(k*100)/100).toString().replace(".",",");
const dateTxt = ts => new Date(ts).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

/* esercizi personalizzati (creati con "Cambia esercizio") */
st.custom ||= {};
Object.entries(st.custom).forEach(([id,e])=>{ if(!EX[id]) EX[id]=e; if(e.mg && !MUSCLE[id]) MUSCLE[id]=e.mg; });
/* programma di allenamento personalizzabile: si parte da quello di base e ognuno lo modifica (salvato nel browser) */
const BASE_PROGRAM = { sessions:Object.fromEntries(Object.entries(SESSIONS).filter(([k])=>!EXTRA_SESSIONS.includes(k)).map(([k,v])=>[k,v.map(x=>[...x])])), cycle:[...CYCLE] };
function applyProgram(p){
  const prog=p||BASE_PROGRAM;
  Object.keys(SESSIONS).forEach(k=>{ if(!EXTRA_SESSIONS.includes(k)) delete SESSIONS[k]; });
  Object.entries(prog.sessions).forEach(([k,v])=>{ SESSIONS[k]=v.filter(x=>EX[x[0]]).map(x=>[...x]); });
  CYCLE.length=0; prog.cycle.filter(c=>c==="REST"||SESSIONS[c]).forEach(c=>CYCLE.push(c));
  if(!CYCLE.length) BASE_PROGRAM.cycle.forEach(c=>CYCLE.push(c));
}
if(st.program) applyProgram(st.program);
/* video aggiunti dall'utente (link YouTube incollati): vanno in testa ai video dell'esercizio */
st.myVid ||= {};
function applyMyVid(id){ const e=EX[id]; if(!e) return; const mine=st.myVid[id]||[]; e.v=[...mine,...(e.v||[]).filter(([v])=>!mine.some(([m])=>m===v))]; }
Object.keys(st.myVid).forEach(applyMyVid);
function addMyVid(id,raw){ const r=parseYT(raw); if(!r||!r.id) return false; (st.myVid[id] ||= []); if(!st.myVid[id].some(([v])=>v===r.id)) st.myVid[id].unshift([r.id,"Il tuo video"]); applyMyVid(id); save(); return true; }
function delMyVid(id,vid){ st.myVid[id]=(st.myVid[id]||[]).filter(([v])=>v!==vid); EX[id].v=(EX[id].v||[]).filter(([v])=>v!==vid); if(!st.myVid[id].length) delete st.myVid[id]; applyMyVid(id); save(); }
function openVideoAdd(id){
  const e=EX[id], q=encodeURIComponent(e.n+" tecnica esecuzione"), mine=st.myVid[id]||[];
  openSheet("Video per "+e.n,`
    <p class="muted" style="margin:0 0 8px">Cerca un video su YouTube, tocca <b>Condividi → Copia link</b> e incollalo qui. Lo vedrai insieme agli altri video dell'esercizio, solo tu.</p>
    <a class="btn wide" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center;display:block">🔎 Cerca “${esc(e.n)}” su YouTube ↗</a>
    <form class="m-form" id="vaF" style="margin-top:10px"><input class="inp" id="vaIn" placeholder="Incolla il link YouTube" inputmode="url" autocomplete="off"><button class="btn acc" type="submit">Aggiungi</button></form>
    <p class="muted" id="vaMsg" style="min-height:1.2em"></p>
    ${mine.length?`<div class="card"><h3>I tuoi video</h3>${mine.map(([v])=>`<div class="row" style="align-items:center;margin:4px 0"><img src="https://i.ytimg.com/vi/${v}/mqdefault.jpg" alt="" style="width:96px;height:54px;object-fit:cover;border-radius:6px"><a href="https://www.youtube.com/watch?v=${v}" target="_blank" rel="noopener" style="flex:1">youtu.be/${v}</a><button type="button" class="mini" data-vdel="${v}">✕ Togli</button></div>`).join("")}</div>`:""}`);
  $("#vaF").onsubmit=ev=>{ ev.preventDefault(); if(addMyVid(id,$("#vaIn").value)){ if(st.cur&&item()[0]===id){ st.cur.vid=0; save(); drawVideo(); } openVideoAdd(id); $("#vaMsg").textContent="Video aggiunto ✓"; } else $("#vaMsg").textContent="Link non valido: copialo da YouTube (Condividi → Copia link)."; };
  $("#sheetBody").querySelectorAll("[data-vdel]").forEach(b=>b.onclick=()=>{ delMyVid(id,b.dataset.vdel); if(st.cur&&item()[0]===id){ st.cur.vid=0; save(); drawVideo(); } openVideoAdd(id); });
}
/* scheda della sessione corrente, con eventuali esercizi sostituiti */
function mergeSugg(g){ Object.entries(g||{}).forEach(([id,x])=>{ const o=st.sugg[id]; if(!o || (x.date||0)>(o.date||0)) st.sugg[id]=x; }); }
function mergeNotes(n){ if(!n) return; st.exNotes={...(st.exNotes||{}),...n}; }
function mergeCustom(c){ Object.entries(c||{}).forEach(([id,e])=>{ if(!st.custom[id]) st.custom[id]=e; if(!EX[id]) EX[id]=e; if(e.mg && !MUSCLE[id]) MUSCLE[id]=e.mg; }); }
function curList(){
  const subs=(st.cur&&st.cur.subs)||{};
  return SESSIONS[st.cur.session].map((x,k)=>subs[k]&&EX[subs[k]]?[subs[k],...x.slice(1)]:x);
}
function origId(k){ return SESSIONS[st.cur.session][k][0]; }
function item(){ return st.cur ? curList()[st.cur.exIdx] : null; }
if(!st.settings.bar18){ if(st.settings.barKg===20) delete st.settings.barKg; st.settings.bar18=1; }
(function fixCur(){ if(!st.cur) return; if(!SESSIONS[st.cur.session]){ st.cur=null; return; }
  const n=SESSIONS[st.cur.session].length; if(!(st.cur.exIdx<n)) st.cur.exIdx=Math.max(0,n-1); })();
function exOf(it){ return EX[it[0]]; }
function setsOf(i){ return (st.cur.log[i] ||= []); }
function workSets(i){ return setsOf(i).filter(s=>!s.extra); }

/* ultima prestazione registrata di un esercizio nell'archivio */
function lastPerf(exId){
  for(let i=st.history.length-1;i>=0;i--){
    const h=st.history[i]; const e=h.ex.find(x=>x.ex===exId && x.sets.length);
    if(e) return {date:h.start, session:h.session, sets:e.sets};
  }
  return null;
}
/* ---------- unità: kg e libbre ----------
   Ogni serie conserva kg (per i calcoli e lo storico comune) e, se registrata in libbre, u:"lb" e v (valore in lb). */
const LB=0.45359237;
const unitOf = s => s && s.u==="lb" ? "lb" : "kg";
const valOf  = s => s.u==="lb" ? s.v : s.kg;
const toKg   = (v,u) => u==="lb" ? Math.round(v*LB*100)/100 : v;
const fromKg = (k,u) => u==="lb" ? k/LB : k;
const wTxt   = (v,u) => `${kgTxt(v)} ${u}`;
const setW   = s => s.raw ? s.raw : s.u==="lb" ? `${kgTxt(s.v)} lb` : `${kgTxt(s.kg)} kg`;
// peso con l'altra unità tra parentesi (l'originale resta per primo)
const r1 = x => kgTxt(Math.round(x*10)/10);
const setWB  = s => { const w=setW(s); if(s.kg==null) return w; const lb=/\blb\b/.test(w), kg=/\bkg\b/.test(w);
  if(lb&&kg) return w; if(s.u==="lb"||lb) return `${w} (≈${r1(s.kg)} kg)`; return `${w} (≈${r1(s.kg/LB)} lb)`; };
const modeOf = id => (EX[id]&&EX[id].kind!=="time") ? (EX[id].lm || LOAD_MODE[EX[id].eq||"machine"] || "totale") : "";
function incFor(id,u){ const eq=EX[id].eq||"machine"; return (u==="lb"?st.settings.incLb[eq]:st.settings.inc[eq])||(u==="lb"?5:2.5); }
function setTxt(s){ return s.sec!=null ? `${s.sec} s ✓` : `${setWB(s)} × ${s.rr||(s.reps??"?")} (RIR ${s.rt||(s.rir??"?")})`; }
/* riga di dettaglio con tipo di serie, macchina e note (per archivio e storico) */
function setLine(s){ return s.sec!=null ? `${s.sec} s ✓` : `${setTxt(s)}${s.tipo?` · ${s.tipo}`:s.extra?" · extra":""}${s.m?` · ${s.m}`:""}${s.note?` · ${s.note}`:""}`; }
function perfTxt(sets){ const ws=sets.filter(s=>!s.extra); if(ws.length && ws[0].sec!=null) return `${ws.length} giri da ${ws[0].sec} s`; return ws.map(setTxt).join(" · "); }
function cleanSet({kg,reps,rir,extra,sec,u,v}){ return sec!=null ? {sec,...(extra?{extra:true}:{})} : {kg,reps,rir,...(u==="lb"?{u,v}:{}),...(extra?{extra:true}:{})}; }
const isTimeIt = it => !!(it && EX[it[0]].kind==="time");
const rirTxt = r => r==null ? "?" : r%1 ? `${Math.floor(r)}–${Math.ceil(r)}` : String(r);
/* serie che contano nei grafici: allenanti + extra vere (non riscaldamento, avvicinamento o prove) */
const countsInStats = s => s.sec==null && (!s.extra || !s.tipo || s.tipo==="extra");
const isExtraSess = s => typeof EXTRA_SESSIONS!=="undefined" && EXTRA_SESSIONS.includes(s);
const holdTxt = it => `${it[2]} s${EX[it[0]].sides?" per lato":""}`;

/* ---------------- logica del coach ---------------- */
const e1rm = (w,r,q) => w*(1+(r+q)/30);                // stima con formula di Epley (vale in kg e in lb)
const loadFor = (e,r,q) => e/(1+(r+q)/30);
function roundInc(w,inc){ return Math.max(inc, Math.round(w/inc)*inc); }

/* carico consigliato (nella stessa unità della serie) per centrare il range a RIR 2–3 */
function targetLoad(it,set){
  const [id,,lo,hi]=it, u=unitOf(set), inc=incFor(id,u), w0=valOf(set);
  if(!w0) return null;
  const mid=(lo+hi)/2, e=e1rm(w0,set.reps,set.rir);
  let w=roundInc(loadFor(e,mid,(RIR_MIN+RIR_MAX)/2),inc);
  const maxStep=Math.max(inc, w0*0.15);
  w=clamp(w,w0-maxStep,w0+maxStep);
  return roundInc(w,inc);
}
function judge(it,set){
  const [,,lo,hi]=it;
  if(set.rir>RIR_MAX) return "light";
  if(set.rir<RIR_MIN) return set.reps>=lo ? "near" : "heavy";
  if(set.reps>hi) return "light";
  if(set.reps<lo) return "heavy";
  return "ok";
}
function coachSet(it,set){
  const [id,,lo,hi]=it, u=unitOf(set), inc=incFor(id,u), w0=valOf(set), v=judge(it,set);
  let w=targetLoad(it,set);
  if(w0 && w!=null){
    if(v==="heavy" && w>=w0) w=Math.max(inc,w0-inc);
    if(v==="light" && w<=w0) w=w0+inc;
    if(v==="ok"||v==="near") w=w0;
  }
  let why;
  if(v==="ok") why=`<span class="ok">✔ Carico giusto</span>: ${set.reps} rip nel range ${lo}–${hi} a RIR ${rirTxt(set.rir)}.`;
  else if(v==="near") why=`<span class="down">⚠ Vicino al cedimento</span>: RIR ${rirTxt(set.rir)}, ma ${set.reps} rip sono ${set.reps>hi?"sopra":"nel"} range ${lo}–${hi}, quindi il carico va bene: la prossima fermati a 2–3 rip dal cedimento.`;
  else if(v==="heavy") why=`<span class="down">⬇ Troppo pesante</span>: ${set.rir<RIR_MIN?`RIR ${rirTxt(set.rir)} è troppo vicino al cedimento`:`${set.reps} rip sono sotto il minimo di ${lo}`}.`;
  else why=`<span class="up">⬆ Troppo leggero</span>: ${set.rir>RIR_MAX?`RIR ${rirTxt(set.rir)}, ti restavano troppe ripetizioni`:`${set.reps} rip superano il massimo di ${hi}`}.`;
  return {v,w,u,why};
}
/* consiglio per la prossima seduta (double progression), nell'unità dell'ultima serie */
/* sedute passate di un esercizio (più recente prima), solo serie allenanti con carico */
function perfsOf(id){
  const out=[]; for(let i=st.history.length-1;i>=0;i--){ const h=st.history[i], e=h.ex.find(x=>x.ex===id);
    const ws=e?e.sets.filter(x=>!x.extra&&x.kg!=null&&x.sec==null):[]; if(ws.length) out.push({date:h.start,sets:ws}); }
  return out;
}
/* seduta "al top": il carico massimo è arrivato in cima al range con RIR ≥ 2 */
function topOf(ws){ const mx=Math.max(...ws.map(x=>x.kg)); const at=ws.filter(x=>Math.abs(x.kg-mx)<0.01); return {kg:mx,set:at[at.length-1],at}; }
function atTop(ws,hi){ const t=topOf(ws); return t.at.some(x=>(x.reps??0)>=hi && (x.rir??-1)>=RIR_MIN); }
/* consiglio di carico dallo storico: si sale solo se le ultime 2 sedute sono al top con lo stesso carico, altrimenti si mantiene */
function ruleSugg(id,curSets){
  const it=(st.cur&&item()[0]===id)?item():slotOf(id), hi=it[3];
  const ps=perfsOf(id).map(p=>p.sets);
  const seq = curSets&&curSets.filter(x=>!x.extra&&x.kg!=null).length ? [curSets.filter(x=>!x.extra&&x.kg!=null),...ps] : ps;
  if(!seq.length) return null;
  const t1=topOf(seq[0]), u=unitOf(t1.set), w1=valOf(t1.set), inc=incFor(id,u);
  const same = seq[1] && Math.abs(topOf(seq[1]).kg-t1.kg)/t1.kg < 0.03;
  if(atTop(seq[0],hi) && same && atTop(seq[1],hi))
    return {v:Math.round((w1+inc)*100)/100,u,up:true,txt:`Due sedute di fila con ${wTxt(w1,u)} a ${hi} rip e RIR ≥ ${RIR_MIN}: **sali a ${wTxt(Math.round((w1+inc)*100)/100,u)}**.`};
  const why = atTop(seq[0],hi) ? `ultima volta al top (${hi} rip a RIR ≥ ${RIR_MIN}); se ci riesci di nuovo, la prossima volta si sale`
            : `per salire servono 2 sedute di fila a ${hi} rip con RIR 2–3`;
  return {v:w1,u,up:false,txt:`**Mantieni ${wTxt(w1,u)}**: ${why}.`};
}
function nextTime(it,sets,prevSets){
  const [id,,lo,hi]=it;
  const ws=sets.filter(s=>!s.extra); if(!ws.length) return null;
  // serie di riferimento: la più pesante che ha raggiunto il minimo del range (altrimenti l'ultima)
  const okR=ws.filter(x=>x.kg!=null&&(x.reps??0)>=lo), last=okR.length?okR.reduce((a,b)=>b.kg>=a.kg?b:a):ws[ws.length-1];
  const u=unitOf(last), inc=incFor(id,u), w0=valOf(last);
  const mk=(v,txt)=>({v,u,kg:v==null?null:toKg(v,u),txt});
  if(!w0) return mk(null,"Prossima volta punta ad aggiungere ripetizioni mantenendo RIR 2–3.");
  if(ws.every(s=>s.reps>=hi && s.rir>=RIR_MIN)){
    const prevOk = prevSets && prevSets.length && Math.abs(topOf(prevSets).kg-topOf(ws).kg)/topOf(ws).kg<0.03 && atTop(prevSets,hi);
    if(prevOk) return mk(w0+inc,`Seconda seduta di fila al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta sali a ${wTxt(w0+inc,u)}**.`);
    return mk(w0,`Al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta resta a ${wTxt(w0,u)}** e conferma; se lo rifai, poi si sale a ${wTxt(w0+inc,u)}.`);
  }
  const v=judge(it,last);
  if(v==="near") return mk(w0,`Carico giusto ma serie al cedimento: **la prossima volta resta a ${wTxt(w0,u)}** e fermati a RIR 2–3.`);
  if(v==="heavy"){ const w=Math.max(inc,Math.min(targetLoad(it,last)??w0, w0-inc)); return mk(w,`La prossima volta parti da **${wTxt(w,u)}** per restare nel range a RIR 2–3.`); }
  if(v==="light"){ const w=Math.max(targetLoad(it,last)??w0, w0+inc); return mk(w,`La prossima volta prova **${wTxt(w,u)}**.`); }
  return mk(w0,`La prossima volta **resta a ${wTxt(w0,u)}** e prova ad aggiungere ripetizioni fino a ${hi} in entrambe le serie.`);
}
/* carico consigliato per oggi: {v,u} nell'unità usata l'ultima volta */
function suggested(exId){
  const s=st.sugg[exId]; if(s && s.kg!=null) return s.u==="lb"?{v:s.v,u:"lb"}:{v:s.kg,u:"kg"};
  // nessun numero (o solo una nota): consiglio calcolato dalle ultime sedute
  if(!EX[exId] || EX[exId].kind==="time") return null;
  const r=ruleSugg(exId); return r?{v:r.v,u:r.u,rule:r}:null;
}
function suggestedKg(exId){ const g=suggested(exId); return g?toKg(g.v,g.u):null; }
function suggTxt(exId){ const g=suggested(exId); if(!g) return null; return g.u==="lb"?`${wTxt(g.v,"lb")} (≈${r1(toKg(g.v,"lb"))} kg)`:`${wTxt(g.v,"kg")} (≈${r1(g.v/LB)} lb)`; }
/* unità da usare per l'esercizio corrente se l'utente non la dice */
function prefUnit(){
  const i=st.cur.exIdx, id=item()[0], ov=(st.cur.unitPref||{})[i]; if(ov) return ov;
  const ss=setsOf(i).filter(x=>x.kg!=null); if(ss.length) return unitOf(ss[ss.length-1]);
  const g=suggested(id); if(g) return g.u;
  return st.settings.defUnit||"kg";
}
/* riferimento in kg per capire se un numero è più plausibile in kg o in libbre */
function refKg(id){
  const ss=setsOf(st.cur.exIdx).filter(x=>x.kg!=null); if(ss.length) return ss[ss.length-1].kg;
  return suggestedKg(id);
}

/* ---------------- parser delle serie ---------------- */
const WORDS={zero:0,uno:1,una:1,un:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8,nove:9,dieci:10,undici:11,dodici:12,tredici:13,quattordici:14,quindici:15,sedici:16,diciassette:17,diciotto:18,diciannove:19,venti:20,ventuno:21,ventidue:22,ventitre:23,"ventitré":23,ventiquattro:24,venticinque:25,ventisei:26,ventisette:27,ventotto:28,ventinove:29,trenta:30,quaranta:40,cinquanta:50,sessanta:60,settanta:70,ottanta:80,novanta:90,cento:100};
function norm(t){
  t=t.toLowerCase().replace(/’/g,"'");
  t=t.replace(/[a-zàèéìòù]+/g,w=>WORDS[w]!=null?String(WORDS[w]):w);
  t=t.replace(/(\d+)\s*e\s*mezzo/g,(m,a)=>a+".5").replace(/(\d),(\d)/g,"$1.$2");
  return t;
}
function parseSet(raw){
  let t=" "+norm(raw)+" ", kg=null, unit=null, reps=null, rir=null, m;
  const take=(re,f)=>{ m=t.match(re); if(m){ f(m); t=t.replace(m[0]," "); return true;} return false; };
  const rr=(a,b)=>b!=null&&b!==""&&+b>+a ? (+a + +b)/2 : +a;   // "1-2" o "1/2" = 1,5; "1.5" = 1,5
  take(/\brir\s*(?:di|=|:)?\s*(\d(?:\.5)?)(?:\s*[-–\/]\s*(\d))?(?!\d)/,m=>rir=rr(m[1],m[2])) || take(/\b(\d(?:\.5)?)(?:\s*[-–\/]\s*(\d))?\s*rir\b/,m=>rir=rr(m[1],m[2])) || take(/@\s*(\d(?:\.5)?)(?:\s*[-–\/]\s*(\d))?(?!\d)/,m=>rir=rr(m[1],m[2])) || take(/\b(\d)\s*(?:in canna|di riserva|buffer)/,m=>rir=+m[1]);
  take(/(\d+(?:\.\d+)?)\s*(lbs?|libbr[ae]|pounds?|kg|kili|kilo|chili|chilo|k)\b/,m=>{ kg=+m[1]; unit=/^(lb|libbr|pound)/.test(m[2])?"lb":"kg"; });
  take(/(\d+)\s*(?:rip\w*|reps?|volte|ripetizioni)\b/,m=>reps=+m[1]);
  if(kg==null && reps==null) take(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+)\b/,m=>{kg=+m[1];reps=+m[2];});
  if(reps==null) take(/(?:\bx|×|\bper)\s*(\d+)\b/,m=>reps=+m[1]);
  if(kg==null) take(/(?:\bcon|\bcarico|\bpeso|\ba)\s*(\d+(?:\.\d+)?)\b/,m=>kg=+m[1]);
  const left=(t.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
  for(const n of left){
    if(reps==null && kg!=null){ reps=n; continue; }
    if(kg==null && reps!=null){ kg=n; continue; }
    if(kg==null && reps==null){ kg=n; continue; }
    if(rir==null && n<=6){ rir=n; continue; }
  }
  let wOnly=false;
  if(kg!=null && reps==null && rir==null && left.length===1){
    // un numero da solo: piccolo = ripetizioni ("9"), grande o con decimali = carico ("165", "22.5")
    const hi=st.cur&&item()?item()[3]:15;
    if(Number.isInteger(kg) && kg<=hi+8){ reps=kg; kg=null; } else wOnly=true;
  }
  if(kg!=null && unit!=null && reps==null && rir==null) wOnly=true;   // "165 lb" da solo = carico
  if(reps!=null && (reps<1||reps>60)) reps=null;
  if(rir!=null && rir>10) rir=null;
  if(unit==null){ if(/\b(lbs?|libbr[ae]|pounds?)\b/.test(t)) unit="lb"; else if(/\b(kg|chili|kili)\b/.test(t)) unit="kg"; }
  return {kg,unit,reps,rir,found:reps!=null||rir!=null&&kg!=null||wOnly&&kg!=null};
}
const isQuestion = t => /\?/.test(t) || /^\s*(come|perch|cosa|qual|quant[oie]? |quando|posso|devo|dovrei|meglio|ho (dolore|male)|mi fa|che |dove|spiega|consigli|è normale|e se|va bene)/i.test(t);

/* ---------------- chat ---------------- */
function addMsg(who,text,cls=""){
  if(!st.cur) return;
  st.cur.chat.push({who,text,cls,t:Date.now()});
  if(st.cur.chat.length>300) st.cur.chat=st.cur.chat.slice(-300);
  save(); drawMsg({who,text,cls});
}
const bot=(t,cls)=>addMsg("bot",t,cls), sys=t=>addMsg("sys",t), user=t=>addMsg("user",t);
function drawMsg(m){
  const d=document.createElement("div");
  d.className=`msg ${m.who} ${m.cls||""}`;
  d.innerHTML = m.who==="bot" ? m.text : esc(m.text);   // i testi del bot sono generati dall'app già sicuri
  $("#chat").appendChild(d); d.querySelectorAll(".qw").forEach(centerQW); $("#chat").scrollTop=1e9;
  return d;
}

/* tasti rapidi con i carichi vicini a quelli dell'ultima volta (e al consigliato) */
function quickWeights(id,focusV,focusU){
  const e=EX[id]; if(!e||e.kind==="time") return "";
  const p=lastPerf(id), g=suggested(id), cur=setsOf(st.cur.exIdx).filter(x=>x.kg!=null&&!x.extra);
  const ov=(st.cur.unitPref||{})[st.cur.exIdx];
  const u=focusU || ov || (cur.length?unitOf(cur[cur.length-1]):g?g.u:p&&p.sets.some(x=>x.kg!=null)?unitOf(p.sets.filter(x=>x.kg!=null).pop()):prefUnit());
  const inc=(u==="lb"?st.settings.incLb:st.settings.inc)[e.eq||"machine"] || (u==="lb"?5:2.5);
  const R=v=>Math.round(v*100)/100, snap=v=>R(Math.max(inc,Math.round(v/inc)*inc));
  const inU=(v,vu)=>vu===u?v:snap(fromKg(toKg(v,vu),u));
  let c = focusV!=null&&focusV!=="__vals" ? inU(focusV,focusU||u) : g ? inU(g.v,g.u) : cur.length ? inU(valOf(cur[cur.length-1]),unitOf(cur[cur.length-1])) : null;
  if(c==null && p){ const ls=p.sets.filter(x=>x.kg!=null&&!x.extra); if(ls.length) c=inU(valOf(ls[ls.length-1]),unitOf(ls[ls.length-1])); }
  if(c==null) c=e.eq==="bw"?0:u==="lb"?45:20;
  c=R(c);
  const step=u==="kg"&&inc<2.5&&Math.abs(c/2.5-Math.round(c/2.5))<1e-6?2.5:inc;   // es. manubri 7,5 → 5 / 10
  // gamma ampia: dal minimo fino a ~3 volte il consigliato (almeno 40 passi sopra), così si trova qualsiasi carico
  const arr=[]; const top=Math.max(c*3, c+40*step), kmin=-Math.ceil(c/step), kmax=Math.min(Math.ceil((top-c)/step),150);
  for(let k=kmin;k<=kmax;k++){ const v=R(c+k*step); if(v>0||(e.eq==="bw"&&v===0)) arr.push(v); }
  if(focusV==="__vals") return {u,c,arr};
  return `<div class="qw" data-qex="${st.cur.exIdx}|${id}"><button type="button" class="qu" data-qunit="${u==="lb"?"kg":"lb"}" title="Passa a ${u==="lb"?"chili":"libbre"}">${u} ⇄</button>${arr.map(v=>`<button type="button" class="${v===c?"acc":""}" data-qw="${v}|${u}|${st.cur.exIdx}|${id}">${kgTxt(v)}</button>`).join("")}</div>`;
}
/* scorre la riga dei pesi in modo che il consigliato sia al centro */
function centerQW(row){ const a=row.querySelector(".acc"); if(!a) return; const ra=a.getBoundingClientRect(), rr=row.getBoundingClientRect(); row.scrollLeft+=ra.left-rr.left-rr.width/2+ra.width/2; }
$("#chat").addEventListener("click",ev=>{
  const qu=ev.target.closest("[data-qunit]");
  if(qu && st.cur){ const row=qu.closest(".qw"), [k,id]=row.dataset.qex.split("|");
    const okEx = (+k===st.cur.exIdx && item()[0]===id) || (extraIdx()===+k && curList()[+k] && curList()[+k][0]===id);
    if(!okEx) return sys("Quei tasti erano per un altro esercizio: usa quelli dell'ultimo messaggio.");
    (st.cur.unitPref ||= {})[+k]=qu.dataset.qunit; save(); drawChips(); drawExbar();
    row.outerHTML=withEx(+k,()=>quickWeights(id)); document.querySelectorAll('#chat .qw').forEach(r=>{ if(r.dataset.qex===`${k}|${id}`) centerQW(r); }); return; }
  const b=ev.target.closest("[data-qw]"); if(!b||!st.cur) return;
  const [v,u,k,id]=b.dataset.qw.split("|");
  const okEx = (+k===st.cur.exIdx && item()[0]===id) || (extraIdx()===+k && curList()[+k] && curList()[+k][0]===id);
  if(!okEx){ sys("Quei tasti erano per un altro esercizio: usa quelli dell'ultimo messaggio."); return; }
  unlockAudio(); user(`${kgTxt(+v)} ${u}`); st.cur.pending=null;
  logSet({kg:+v,unit:u,unitOk:true,reps:null,rir:null});
});
function introExercise(){
  if(isTimeIt(item())) return introTimed();
  const it=item(), e=exOf(it), [id,n,lo,hi,rest]=it, list=curList();
  const p=lastPerf(id), g=suggested(id), mode=modeOf(id), xn=(st.exNotes||{})[id];
  const conv=(v,u)=>u==="lb"?`${kgTxt(v)} lb <span class="muted">(${r1(v*LB)} kg)</span>`:`${kgTxt(v)} kg <span class="muted">(${r1(v/LB)} lb)</span>`;
  let t=`<div class="ih">${st.cur.exIdx+1}/${list.length} — ${esc(e.n)}</div>`;
  if(e.s) t+=`<div class="muted">${esc(e.s)}</div>`;
  if(lo>8||hi>12) t+=`<div class="iw">⚠ TARGET: ${lo}–${hi} RIPETIZIONI</div><div class="iw2">Range più alto dello standard 8–12</div>`;
  if(e.note) t+=`<div class="down" style="margin-top:4px">⚠ ${esc(e.note)}</div>`;
  // oggi
  t+=`<div class="is ok">Oggi — proposta</div>`;
  t+= g ? `<div class="ok"><b class="okb">Carico consigliato: ${conv(g.v,g.u)} ${mode}.</b></div>${g.rule?`<div class="muted">${md(g.rule.txt)}</div>`:""}`
        : `<div>${p||xn?"Scegli il carico in base all'ultima volta"+(xn&&xn.ref?" e alla nota qui sotto":"")+".":`Prima volta: un carico con cui arrivi a ~${Math.round((lo+hi)/2)} rip lasciandone 2–3 in canna.`} <span class="muted">Carico ${mode}.</span></div>`;
  const done=workSets(st.cur.exIdx);
  t+=`<table class="mt it"><tr><th>Serie</th><th>Carico</th><th>Reps</th><th>RIR</th><th>Rec.</th></tr>${Array.from({length:n},(_,k)=>{ const d=done[k];
    return d ? `<tr class="done"><td>${k+1} ✓</td><td>${esc(setW(d))}</td><td>${d.reps??"?"}</td><td>${d.rir??"?"}</td><td>${restTxt(rest)}</td></tr>`
             : `<tr><td>${k+1}</td><td>${g?(k===0?wTxt(g.v,g.u):"da confermare"):"—"}</td><td>${lo}–${hi}</td><td>${RIR_MIN}–${RIR_MAX}</td><td>${restTxt(rest)}</td></tr>`; }).join("")}</table>`;
  // storico
  if(p){ const ws=p.sets.filter(x=>x.sec==null); let nn=0;   // tutte le serie, anche extra / riscaldamento (in grigio)
    t+=`<div class="is warn">Storico — ${dateTxt(p.date)}${p.session?` · ${esc(p.session)}`:""}</div>`;
    t+=`<table class="mt it"><tr><th>Serie</th><th>Carico</th><th>Reps</th><th>RIR</th></tr>${ws.map(x=>{ const ex=!!x.extra, c=ex?"":"wv";
      return `<tr class="${ex?"xr":""}"><td>${ex?esc(x.tipo&&x.tipo!=="extra"?x.tipo.slice(0,6)+".":"extra"):++nn}</td><td class="${c}">${esc(setWB(x))}</td><td class="${c}">${x.rr?esc(x.rr):x.reps??"?"}</td><td class="${c}">${x.rt?esc(x.rt):rirTxt(x.rir)}</td></tr>`; }).join("")}</table>`;
    const ms=[...new Set(ws.map(x=>x.m).filter(Boolean))]; if(ms.length) t+=`<div class="muted">${esc(ms.join(" · "))}</div>`;
  }
  if(xn && xn.ref) t+=`<div class="note">📌 ${esc(xn.ref)} <span class="muted">(${esc(xn.agg||"")})</span></div>`;
  // riscaldamento (solo proposto, non registrato)
  if(g && !done.length && st.cur.exIdx===firstOfMuscle(st.cur.exIdx)){
    const inc=(g.u==="lb"?st.settings.incLb:st.settings.inc)[e.eq||"machine"]||(g.u==="lb"?5:2.5);
    const w=Math.max(inc,Math.round(g.v*0.55/inc)*inc);
    t+=`<div class="is">Riscaldamento</div><div>Una serie leggera: <b>${wTxt(w,g.u)} × 10</b> <span class="muted">(non va registrata)</span></div>`;
  }
  // tecnica
  const cue=(xn&&xn.cue?xn.cue:e.cue)||"";
  const parts=cue.split(/\s+·\s+|(?<=[.!])\s+(?=[A-ZÀ-Ú"«])/).map(x=>x.trim().replace(/\.$/,"")).filter(Boolean);
  if(parts.length) t+=`<div class="is">Tecnica</div><ul>${parts.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  // azione
  const qw=quickWeights(id);
  if(setsOf(st.cur.exIdx).length) t+=exSummary(st.cur.exIdx,id).replace("Riepilogo —","Già registrate —")+`<div style="margin-top:6px"><b>${done.length>=n?`Tutte le ${n} serie sono registrate.`:`Ora: serie ${done.length+1} di ${n}.`}</b>${done.length<n&&qw?" Tocca il carico usato:":""}</div>`;
  else t+=`<div style="margin-top:6px"><b>Prima serie: ${g?wTxt(g.v,g.u)+", ":""}${lo}–${hi} rip, RIR ${RIR_MIN}–${RIR_MAX}.</b> ${qw?"Tocca il carico usato oppure dimmi il risultato:":"Dimmi il risultato (es. <i>20 kg 11 rip RIR 2</i>)."}</div>`;
  if(qw) t+=qw;
  bot(t,"intro");
}
/* primo esercizio della sessione per quel gruppo muscolare (per proporre il riscaldamento) */
function firstOfMuscle(k){
  const list=curList(), g=x=>MUSCLE[x]||(EX[x]&&EX[x].like&&MUSCLE[EX[x].like])||x;
  const mg=g(list[k][0]); for(let i=0;i<k;i++) if(g(list[i][0])===mg) return i; return k;
}

function introTimed(){
  const it=item(), e=exOf(it), [id,n,sec,,rest]=it, list=curList(), done=workSets(st.cur.exIdx).length;
  let t=`<b>${st.cur.exIdx+1}/${list.length} · ${esc(e.n)}</b>${e.s?` <span class="muted">(${esc(e.s)})</span>`:""}<br>${n} giri × ${holdTxt(it)} · pausa ${rest} s<br><span class="muted">${esc(e.cue)}</span>`;
  t+= done ? `<br><span class="muted">Già fatti ${done}/${n} giri.</span>` : `<br><span class="muted">Tocca <b>▶ Avvia</b>: il timer conta ${e.sides?"un lato, suona per cambiare lato, poi l'altro":"la durata"} e registra il giro da solo. Oppure scrivi <i>fatto</i>.</span>`;
  bot(t,"intro");
}

/* ---------------- gestione input ---------------- */
async function onSend(text){
  text=text.trim(); if(!text||!st.cur) return;
  unlockAudio(); user(text);
  const t=text.toLowerCase().trim();

  // comandi
  if(/^(annulla|cancella)( ultima)?( serie)?$/.test(t)) return undoSet();
  if(/^(salta|prossimo|successivo|avanti|next)( esercizio)?$/.test(t)) return goEx(st.cur.exIdx+1);
  if(/^(indietro|precedente)( esercizio)?$/.test(t)) return goEx(st.cur.exIdx-1);
  if(/^(fine|termina|finito|chiudi)( la)?( sessione| allenamento)?$/.test(t)) return finishSession();
  if(/^(storico|progressi)$/.test(t)) return showHistoryEx();
  if(isHistoryQ(t) && !/(perch|consigl|dovrei|devo|meglio)/.test(t)) return showHistoryEx(findExInText(t)||item()[0]);
  { const m=t.match(/^(?:cambia|sostituisci)(?: esercizio)?(?: con)?\s*(.*)$/); if(m) return openSwap(text.slice(text.length-m[1].length).trim()); }
  if(isTimeIt(item())){
    if(/^(avvia|via|start|inizia|parti|timer)\b/.test(t)) return startHold();
    if(/^(fatto|fatta|ok|finito|completato|done|giro fatto)\b/.test(t)) return logTimed();
    return askAI(text);
  }

  // risposta a una domanda in sospeso (RIR, ripetizioni, carico)
  const pend=st.cur.pending;
  if(pend){
    const p=parseSet(text), only=t.match(/^\D*(\d+(?:[.,]\d+)?)\D*$/);
    if(pend.need==="unit"){
      let u=null;
      if(/lb|libbr|pound/.test(t)) u="lb"; else if(/kg|chil|kil/.test(t)) u="kg"; else if(/^s[iì]\b/.test(t)) u=pend.alt; else if(/^no\b/.test(t)) u=pend.unit;
      if(u){ return logSet({...pend,unit:u,unitOk:true}); }
    }
    if(pend.need==="rir"){ const hm=t.match(/^\D*(\d)\s*[-–\/]\s*(\d)\D*$/); const v=p.rir??(hm&&+hm[2]>+hm[1]?(+hm[1]+ +hm[2])/2:only?+only[1].replace(",","."):null); if(v!=null && v<=10) return logSet({...pend,rir:v}); }
    if(pend.need==="reps"){ const v=p.reps??(only?+only[1]:null); if(v) return logSet({...pend,reps:v,rir:pend.rir??p.rir}); }
    if(pend.need==="kg"){ const v=p.kg??(only?+only[1].replace(",","."):null); if(v!=null) return logSet({...pend,kg:v,unit:p.unit??null}); }
  }

  const p=parseSet(text);
  // modalità "tutto a Gemini": l'AI interpreta anche le serie; senza rete si torna al riconoscimento locale
  if(st.settings.allAI && aiReady() && navigator.onLine) return askAI(text,null,true);
  if(!isQuestion(t) && p.found){ st.cur.pending=null; return logSet(p); }
  return askAI(text);
}
/* ripiego locale quando l'AI non risponde in modalità "tutto a Gemini" */
function localFallback(text){
  const p=parseSet(text);
  if(!isQuestion(text.toLowerCase()) && p.found){ sys("L'AI non risponde: registro la serie con il riconoscimento automatico."); st.cur.pending=null; logSet(p); return true; }
  return false;
}

/* esegue fn come se l'esercizio corrente fosse quello in posizione i (serve per le serie extra sull'esercizio precedente) */
function withEx(i,fn){ if(i==null||i===st.cur.exIdx) return fn(); const keep=st.cur.exIdx; st.cur.exIdx=i; try{ return fn(); } finally{ st.cur.exIdx=keep; } }
const extraIdx = () => st.cur && st.cur.nextExtra && typeof st.cur.nextExtra==="object" ? st.cur.nextExtra.i : null;
function logSet(p){
  { const ei=extraIdx(); if(ei!=null && ei!==st.cur.exIdx && !p.__in){ withEx(ei,()=>logSet({...p,__in:true})); save(); drawExbar(); drawTop(); drawChips();
      if(!st.cur.nextExtra && !st.cur.pending) bot(`Cosa fai adesso?${choiceHtml(ei)}`);   // altra extra o prossimo esercizio
      return; } }
  const it=item(), [id,n,lo,hi,rest]=it, i=st.cur.exIdx, sets=setsOf(i), ws=workSets(i);
  let val=p.kg, u=p.unit||null;
  if(val==null){
    const prev=sets.filter(x=>x.kg!=null).pop();
    if(prev){ val=valOf(prev); u=u||unitOf(prev); }
    else { const g=suggested(id); if(g){ val=g.v; u=u||g.u; } }
  }
  if(val==null){ st.cur.pending={need:"kg",reps:p.reps,rir:p.rir}; save(); bot(`Con che carico? (es. <i>24 kg</i> o <i>50 lb</i>)`); return drawChips(); }
  if(u==null) u=prefUnit();
  // controllo kg/libbre: se il numero somiglia molto di più allo storico nell'altra unità, chiedo conferma
  if(!p.unitOk && p.kg!=null){
    const ref=refKg(id), alt=u==="kg"?"lb":"kg";
    if(ref){ const eSame=Math.abs(toKg(val,u)-ref)/ref, eAlt=Math.abs(toKg(val,alt)-ref)/ref;
      if(eAlt<0.2 && eSame>0.35){
        st.cur.pending={need:"unit",kg:val,unit:u,alt,reps:p.reps,rir:p.rir}; save();
        bot(`Hai scritto <b>${wTxt(val,u)}</b>, ma il tuo ultimo carico su questo esercizio è circa <b>${kgTxt(Math.round(fromKg(ref,u)*10)/10)} ${u}</b> (≈ ${kgTxt(Math.round(fromKg(ref,alt)))} ${alt}). Intendevi <b>${wTxt(val,alt)}</b>?`);
        return drawChips();
      }
    }
  }
  if(p.reps==null){ st.cur.pending={need:"reps",kg:val,unit:u,unitOk:true,rir:p.rir}; save(); bot(`Quante ripetizioni con ${wTxt(val,u)}?`); return drawChips(); }
  if(p.rir==null){ st.cur.pending={need:"rir",kg:val,unit:u,unitOk:true,reps:p.reps}; save(); bot(`${wTxt(val,u)} × ${p.reps}: quante <b>RIR</b> ti sentivi (ripetizioni rimaste in canna)?`); return drawChips(); }
  st.cur.pending=null;
  const extra = ws.length>=n || !!st.cur.nextExtra; st.cur.nextExtra=false;
  const set={kg:toKg(val,u),...(u==="lb"?{u:"lb",v:val}:{}),reps:p.reps,rir:p.rir,...(p.rir%1?{rt:`${Math.floor(p.rir)}–${Math.ceil(p.rir)}`}:{}),t:Date.now(),...(extra?{extra:true}:{})};
  sets.push(set); save();
  const c=coachSet(it,set), num=ws.length+1, conv=u==="lb"?` <span class="muted">(≈${kgTxt(Math.round(set.kg*10)/10)} kg)</span>`:"";
  let txt = extra ? `Serie extra su <b>${esc(EX[id].n)}</b> registrata: ${setW(set)} × ${set.reps}, RIR ${rirTxt(set.rir)} <span class="muted">(non conta nelle serie allenanti)</span>.`
                  : `Serie ${num}/${n}: <b>${setW(set)} × ${set.reps}</b> <span class="muted">${modeOf(id)}</span>${conv}, RIR ${rirTxt(set.rir)}.<br>${c.why}`;
  const lastOfEx = !extra && num>=n;
  if(!extra && !lastOfEx){
    if(c.v==="ok"||c.v==="near") txt+=` Serie ${num+1}: <b>resta a ${wTxt(val,u)}</b>${c.v==="near"?" e fermati prima":""}.`;
    else if(c.w!=null) txt+=` Serie ${num+1}: <b>${c.v==="heavy"?"scendi":"sali"} a ${wTxt(c.w,u)}</b>.`;
    txt+=`<br>Recupero ${restTxt(rest)}.`;
    txt+=quickWeights(id, c.v==="ok"||c.w==null?val:c.w, u);
  }
  bot(txt+exSummary(i,id)+(extra && !p.__in && workSets(i).length>=n ? `<div style="margin-top:6px">Cosa fai adesso?</div>${choiceHtml(i)}` : ""));
  if(lastOfEx){
    const nt=nextTime(it,setsOf(i),(perfsOf(id)[0]||{}).sets);
    if(nt){ (st.cur.prevSugg ||= {})[id] = st.sugg[id] ?? null; st.sugg[id]={kg:nt.kg,...(nt.u==="lb"?{u:"lb",v:nt.v}:{}),txt:nt.txt,date:Date.now()}; bot(`<b>${esc(EX[id].n)} completato.</b> ${md(nt.txt)}`); }
    afterExercise(i,rest);
  } else startTimer(rest);   // recupero anche dopo una serie extra
  drawExbar(); drawChips();
}
function toggleUnit(){
  const nu=prefUnit()==="lb"?"kg":"lb"; (st.cur.unitPref ||= {})[st.cur.exIdx]=nu; save();
  const r=refKg(item()[0]);
  bot(`Da ora su questo esercizio uso le <b>${nu==="lb"?"libbre":"chili"}</b>${r?` (l'ultimo carico equivale a circa <b>${kgTxt(Math.round(fromKg(r,nu)*2)/2)} ${nu}</b>)`:""}. Puoi sempre scrivere l'unità nel messaggio.${quickWeights(item()[0])}`);
  drawChips();
}
function afterExercise(i,rest){
  save(); syncNow(true);
  const list=curList();
  const nextIdx=list.findIndex((x,k)=>k>i && workSets(k).length<x[1]);
  if(nextIdx>=0){ startTimer(rest); goEx(nextIdx,true); }
  else { const pending=list.findIndex((x,k)=>workSets(k).length<x[1]);
    if(pending>=0){ bot(`Manca ancora <b>${esc(EX[list[pending][0]].n)}</b>.`); startTimer(rest); goEx(pending,true); }
    else { stopTimer(); bot(`🏁 <b>Hai completato tutta la sessione ${st.cur.session}!</b> Tocca <b>Fine sessione</b> per archiviarla.`); }
  }
}
/* esercizi a tempo (mobilità, stretching) */
function startHold(){
  const it=item(), e=exOf(it), sec=it[2];
  unlockAudio();
  startTimer(sec*(e.sides?2:1),{label:e.sides?"Lato 1":"Tenuta",sideAt:e.sides?sec:null,hold:true});
  drawChips();
}
/* riepilogo di tutto l'esercizio dopo ogni serie: serie allenanti ed eventuali extra */
function exSummary(i,id){
  const ss=setsOf(i).filter(x=>x.sec==null); if(!ss.length) return "";
  let n=0;
  return `<div class="is" style="margin-top:8px">Riepilogo — ${esc(EX[id].n)}</div><table class="mt it"><tr><th>Serie</th><th>Carico</th><th>Reps</th><th>RIR</th></tr>${ss.map(x=>`<tr class="${x.extra?"xr":"done"}"><td>${x.extra?"extra":++n}</td><td>${esc(setWB(x))}</td><td>${x.reps??"?"}</td><td>${x.rt?esc(x.rt):rirTxt(x.rir)}</td></tr>`).join("")}</table>`;
}
function logTimed(inner){
  { const ei=extraIdx(); if(ei!=null && ei!==st.cur.exIdx && inner!==true){ withEx(ei,()=>logTimed(true)); save(); drawExbar(); drawTop(); drawChips(); bot(`Cosa fai adesso?${choiceHtml(ei)}`); return; } }
  const it=item(), e=exOf(it), [id,n,sec,,rest]=it, i=st.cur.exIdx, ws=workSets(i);
  stopTimer();
  const extra=ws.length>=n || !!st.cur.nextExtra, num=ws.length+1; st.cur.nextExtra=false;
  setsOf(i).push({sec,t:Date.now(),...(extra?{extra:true}:{})}); save();
  if(extra) bot("Giro extra registrato ✓");
  else if(num<n){ bot(`Giro ${num}/${n} fatto ✓ Pausa ${rest} s, poi giro ${num+1}.`); startTimer(rest,{label:"Pausa"}); }
  else { bot(`<b>${esc(e.n)}</b> completato ✓`); afterExercise(i,rest); }
  drawExbar(); drawChips();
}

function undoSet(){
  const i=st.cur.exIdx, sets=setsOf(i);
  if(!sets.length){
    // se l'esercizio corrente è vuoto, annulla l'ultima serie dell'esercizio precedente
    const prev=Object.keys(st.cur.log).map(Number).filter(k=>st.cur.log[k].length).sort((a,b)=>b-a)[0];
    if(prev==null) return bot("Non c'è nessuna serie da annullare.");
    const s=st.cur.log[prev].pop(); restoreSugg(curList()[prev][0]); save();
    bot(`↶ <b>Tolta</b> da ${esc(EX[curList()[prev][0]].n)}: ${esc(setTxt(s))}${s.extra?" (extra)":""}. Torno a quell'esercizio:`);
    return goEx(prev);
  }
  const s=sets.pop(); restoreSugg(item()[0]); st.cur.pending=null; st.cur.nextExtra=false; save(); stopTimer();
  bot(undoStatus(s));
  drawExbar(); drawChips();
}
/* scelta dopo un esercizio completato / una serie extra: altra extra oppure prossimo esercizio */
function nextIdxAfter(i){ const l=curList(); if(i!==st.cur.exIdx) return st.cur.exIdx; let k=l.findIndex((x,j)=>j>i&&workSets(j).length<x[1]); if(k<0) k=l.findIndex((x,j)=>workSets(j).length<x[1]); return k; }
function choiceHtml(i){
  const l=curList(), k=nextIdxAfter(i);
  return `<div class="qact"><button type="button" class="qa" data-act="extra|${i}">＋ Un'altra serie extra</button>${k>=0?`<button type="button" class="qa acc" data-act="go|${k}">➡ ${esc(EX[l[k][0]].n)}</button>`:`<button type="button" class="qa acc" data-act="end|0">🏁 Fine sessione</button>`}</div>`;
}
$("#chat").addEventListener("click",ev=>{
  const b=ev.target.closest("[data-act]"); if(!b||!st.cur) return;
  const [a,v]=b.dataset.act.split("|"), k=+v; unlockAudio();
  b.closest(".qact").querySelectorAll("button").forEach(x=>x.disabled=true);
  if(a==="go"){ st.cur.nextExtra=false; save(); if(k===st.cur.exIdx){ introExercise(); drawChips(); } else goEx(k); }
  else if(a==="end") finishSession();
  else if(a==="extra"){ const it=curList()[k]; if(!it) return; st.cur.nextExtra={i:k}; st.cur.pending=null; save();
    bot(`<b>Un'altra serie extra su ${esc(EX[it[0]].n)}.</b> ${isTimeIt(it)?"Scrivi «fatto» quando hai finito.":"Tocca il carico usato, poi ripetizioni e RIR:"}${isTimeIt(it)?"":withEx(k,()=>quickWeights(it[0]))}`); drawChips(); }
});
/* dopo "Annulla": cosa è stato tolto, cosa resta registrato e cosa fare adesso */
function undoStatus(s){
  const it=item(), [id,n]=it, i=st.cur.exIdx, ws=workSets(i), tm=isTimeIt(it);
  let t=`↶ <b>Tolta</b> l'ultima ${tm?"registrazione":"serie"}: ${esc(setTxt(s))}${s.extra?" (extra)":""}.`;
  t+=`<div class="is">Stato attuale — ${esc(EX[id].n)}</div>`;
  t+= setsOf(i).length ? exSummary(i,id).replace(/^<div class="is"[^>]*>[^<]*<\/div>/,"") : `<div class="muted">Nessuna serie registrata per questo esercizio.</div>`;
  t+= ws.length<n ? `<div style="margin-top:6px"><b>Ora: ${tm?"giro":"serie"} ${ws.length+1} di ${n}.</b> ${tm?"Tocca ▶ Avvia o scrivi «fatto».":"Tocca il carico usato, poi ripetizioni e RIR:"}</div>${tm?"":quickWeights(id)}`
                  : `<div style="margin-top:6px"><b>Tutte le ${n} serie sono registrate.</b> Cosa fai adesso?</div>${choiceHtml(i)}`;
  return t;
}

function restoreSugg(id){
  const ps=st.cur.prevSugg;
  if(ps && id in ps){ if(ps[id]==null) delete st.sugg[id]; else st.sugg[id]=ps[id]; delete ps[id]; }
}
function goEx(k,auto){
  const list=curList();
  if(k<0) return bot("Sei già al primo esercizio.");
  if(k>=list.length) return bot("Era l'ultimo esercizio. Tocca <b>Fine sessione</b> per archiviare.");
  st.cur.exIdx=k; st.cur.vid=0; st.cur.pending=null; save(); if(pickW) setPickW(false);
  drawVideo(); drawExbar(); drawTop(); introExercise(); drawChips();
  showVideosTop();
}

function findExInText(t){
  const low=t.toLowerCase(); let best=null,score=0;
  for(const [id,e] of Object.entries(EX)){
    const words=e.n.toLowerCase().replace(/[^a-zàèéìòù0-9 ]/g," ").split(/\s+/).filter(w=>w.length>=4&&!["manubri","macchina","sopra","testa","piedi","con"].includes(w));
    const sc=words.filter(w=>low.includes(w)).length; if(sc>score){ score=sc; best=id; }
  }
  return score?best:null;
}
const isHistoryQ = t => /(ultim[ao] (volta|carico|seduta|sessione|allenamento)|che (carico|peso) (avevo|ho usato|ho fatto)|quant[oie] (kg|chili|rip\w*|ripetizioni) (avevo|ho fatto)|quanto (avevo|ho) (fatto|sollevato|spinto|tirato)|storico (di|del|della|dello)|la volta scorsa|l'altra volta)/i.test(t);
function showHistoryEx(forId){
  const id=forId||item()[0], e=EX[id], ses=[];
  for(let i=st.history.length-1;i>=0 && ses.length<5;i--){ const h=st.history[i], x=h.ex.find(y=>y.ex===id&&y.sets.length); if(x) ses.push({h,sets:x.sets}); }
  if(!ses.length) return bot(`Nessuno storico per <b>${esc(e.n)}</b>: non l'hai ancora registrato nell'app.`);
  const hi=((st.cur&&item()[0]===id)?item():slotOf(id))[3];
  let t=`<div class="ih">Storico — ${esc(e.n)}</div><div class="muted">Ultime ${ses.length} sedute, la più recente in alto · carico ${modeOf(id)}</div>`;
  ses.forEach(({h,sets},k)=>{
    const ms=[...new Set(sets.map(x=>x.m).filter(Boolean))];
    t+=`<div class="is ${k===0?"warn":""}">${dateTxt(h.start)} · ${esc(h.session)}</div>`;
    if(ms.length) t+=`<div class="muted">${esc(ms.join(" · "))}</div>`;
    let n=0;
    t+=`<table class="mt it"><tr><th>Serie</th><th>Carico</th><th>Reps</th><th>RIR</th></tr>${sets.map(x=>{
      const lab = x.extra ? (x.tipo?x.tipo.slice(0,5)+".":"extra") : String(++n);
      const top = !x.extra && (x.reps??0)>=hi && (x.rir??-1)>=RIR_MIN;
      return `<tr class="${x.extra?"xr":""}"><td>${lab}</td><td class="${x.extra?"":"wv"}">${esc(x.sec!=null?x.sec+" s":setWB(x))}</td><td>${x.rr?esc(x.rr):x.reps??"?"}${top?" ✓":""}</td><td>${x.rt?esc(x.rt):x.rir??"?"}</td></tr>`; }).join("")}</table>`;
    const notes=sets.map(x=>x.note).filter(Boolean); if(notes.length) t+=`<div class="muted">${esc([...new Set(notes)].join(" · "))}</div>`;
  });
  const g=suggested(id);
  if(g) t+=`<div class="is ok">Prossima volta</div><div><b class="okb">${suggTxt(id)}</b> <span class="muted">${modeOf(id)}</span></div>${g.rule?`<div class="muted">${md(g.rule.txt)}</div>`:st.sugg[id]&&st.sugg[id].txt?`<div class="muted">${md(st.sugg[id].txt)}</div>`:""}`;
  t+=`<div class="muted" style="margin-top:6px">✓ = cima del range (${hi} rip) a RIR ≥ ${RIR_MIN}. Grafico completo in 📈.</div>`;
  bot(t,"intro");
}

/* ---------------- AI (Gemini, opzionale) ---------------- */
/* Linee guida del coach: sintesi delle evidenze su ipertrofia (aggiornata a fine 2026) */
const COACH_KNOWLEDGE = `LINEE GUIDA BASATE SULLE EVIDENZE (usale per motivare i consigli; cita lo studio solo se pertinente e senza inventare riferimenti):
- Vicinanza al cedimento: l'ipertrofia cresce avvicinandosi al cedimento ma con rendimenti decrescenti; 1–3 RIR dà quasi tutto lo stimolo con meno fatica (meta-analisi Refalo 2023; Robinson 2024). Per questo il target è RIR 2–3; occasionalmente RIR 1 sull'ultima serie di esercizi di isolamento/macchine è accettabile, mai sistematico sui multiarticolari.
- La stima del RIR è imprecisa soprattutto nei meno esperti e con ripetizioni alte (si tende a sottostimare quante ne restano): se le ripetizioni salgono molto tra sedute a parità di RIR dichiarato, il RIR era probabilmente sottostimato.
- Volume: rapporto dose-risposta con rendimenti decrescenti; molte persone crescono bene con ~6–12 serie dirette a settimana per muscolo vicino al cedimento (Schoenfeld 2017; Pelland 2024). Il programma attuale è più basso per scelta: non aumentare il volume senza verificare recupero e prestazioni.
- Frequenza: a parità di volume conta poco; distribuire il volume su 2 sedute/settimana è comodo per qualità delle serie.
- Recuperi: recuperi più lunghi (≥2 min, 3 min sui multiarticolari) favoriscono prestazioni e ipertrofia rispetto a 1 min (Schoenfeld 2016; Singer 2024). Se l'utente recupera più a lungo per mantenere le ripetizioni, va bene.
- Allungamento: esercizi che caricano il muscolo in posizione allungata danno spesso più ipertrofia (es. estensioni tricipiti sopra la testa vs pushdown, Maeo 2023; parziali in allungamento, Pedrosa 2022; Wolf 2023). Valorizzare la fase bassa/allungata, eccentrica controllata (~2–3 s), senza rimbalzi.
- Progressione: double progression nel range indicato; incrementi minimi possibili; se la performance cala per 2 sedute di fila o il recupero è scarso valuta sonno, alimentazione, stress e un deload (riduzione volume ~30–50% per una settimana).
- Proteine ~1,6–2,2 g/kg/giorno, sonno 7–9 h: menzionali solo se pertinenti alla domanda.
- Dolore: distinguere fatica muscolare da dolore articolare/acuto. Con dolore articolare: ridurre carico/range, cambiare variante, fermarsi se peggiora; se persiste consigliare un professionista. Mai diagnosi.
- Sostituzioni: proponi un esercizio con stesso pattern e muscolo bersaglio, preferibilmente stabile (macchina/cavo) e con buon carico in allungamento.`;

function exHistoryTxt(id,max=4){
  const rows=[];
  for(let i=st.history.length-1;i>=0 && rows.length<max;i--){ const h=st.history[i], e=h.ex.find(x=>x.ex===id&&x.sets.length); if(e) rows.push(`${dateTxt(h.start)} ${h.session}: ${perfTxt(e.sets)}`); }
  return rows.length?rows.join(" | "):"nessuno";
}
function recentSessionsTxt(max=3){
  return st.history.slice(-max).map(h=>`${dateTxt(h.start)} ${h.session} (${Math.round((h.end-h.start)/60000)} min): `+h.ex.map(e=>`${EX[e.ex]?EX[e.ex].n:e.ex} ${perfTxt(e.sets)}`).join("; ")).join("\n")||"nessuna";
}
function allExLastTxt(){
  const rows=[];
  for(const id of Object.keys(EX)){ const p=lastPerf(id); if(p) rows.push(`- ${EX[id].n}: ${dateTxt(p.date)} (${p.session}) ${perfTxt(p.sets)}${st.sugg[id]&&st.sugg[id].kg!=null?` → prossimo carico consigliato ${suggTxt(id)}`:""}`); }
  return rows.join("\n")||"nessun dato registrato";
}
function aiContext(){
  const it=item(), [id,n,lo,hi,rest]=it, e=EX[id];
  const today=curList().map((x,k)=>{const s=workSets(k);return `- ${k===st.cur.exIdx?"▶ ":""}${EX[x[0]].n}: ${isTimeIt(x)?`${x[1]} giri × ${holdTxt(x)}`:`${x[1]}×${x[2]}–${x[3]}`}, recupero ${x[4]}s${s.length?` | fatto oggi: ${perfTxt(s)}`:""}`}).join("\n");
  const days=st.history.length?Math.round((Date.now()-st.history[st.history.length-1].end)/86400000):null;
  return `Sei il coach personale dell'utente (personal trainer esperto, aggiornato sulla ricerca scientifica su ipertrofia e forza), dentro la sua app di registro allenamenti. Rispondi SEMPRE in italiano.
STILE: diretto e concreto, come un coach in palestra. Rispondi alla domanda nella prima frase, poi dai indicazioni operative con numeri precisi (kg, ripetizioni, RIR, secondi, gradi) basate sui SUOI dati qui sotto. Niente frasi generiche o da manuale, niente elenchi di avvertenze. Se un dato manca, fai una sola domanda mirata. Lunghezza: 40–140 parole, salvo richiesta di approfondire.
PROGRAMMA: obiettivo ipertrofia e progressione tecnica/forza. PPL + Upper/Lower (ciclo PUSH→PULL→LEGS→REST→UPPER→REST→LOWER, senza giorni fissi), 2 serie allenanti per esercizio, RIR target 2–3, double progression (prima ripetizioni nel range, poi carico quando entrambe le serie arrivano al limite alto a RIR 2–3). Le serie extra non contano. Non convertire unità, fori o kg/lato tra macchine diverse. CONVENZIONE CARICHI: manubri = peso di un manubrio; bilanciere, Smith e macchine a dischi = peso PER LATO (dischi su un lato, bilanciere escluso); macchine a pacco pesi e cavi = peso TOTALE indicato sul pacco; esercizi con due cavi (croci ai cavi, croci inverse ai cavi incrociati) = peso di UN pacco, cioè per lato. Rispetta sempre questa convenzione nei numeri che dai.
L'utente si allena in palestre diverse: a volte i pesi sono in kg, a volte in libbre (1 lb = 0,4536 kg). Rispondi nella stessa unità che sta usando per quell'esercizio e, se utile, indica l'equivalente. Incrementi minimi in kg: manubri ${kgTxt(st.settings.inc.db)}, bilanciere ${kgTxt(st.settings.inc.bb)}, cavi ${kgTxt(st.settings.inc.cable)}, macchine ${kgTxt(st.settings.inc.machine)}; in libbre: manubri ${kgTxt(st.settings.incLb.db)}, bilanciere ${kgTxt(st.settings.incLb.bb)}, cavi ${kgTxt(st.settings.incLb.cable)}, macchine ${kgTxt(st.settings.incLb.machine)}.
${COACH_KNOWLEDGE}

FORMATO DELLA RISPOSTA:
- Se il messaggio comunica una serie appena fatta, rispondi SOLO con questa riga: #SERIE kg=<numero o ?> unita=<kg|lb|?> rip=<numero o ?> rir=<numero o ?>
- Se l'utente vuole sostituire l'esercizio corrente (es. macchina occupata), rispondi SOLO con: #CAMBIA <nome dell'esercizio>
- In tutti gli altri casi rispondi direttamente, senza JSON e senza preamboli. Puoi usare markdown leggero quando aiuta la lettura in palestra: **grassetto** per i numeri chiave, titoletti brevi con "### " (es. "### Oggi — proposta", "### Storico — 30/10"), elenchi puntati con "- " e piccole tabelle markdown (es. | Serie | Carico | Reps | RIR |) per piani o confronti di serie. Per risposte brevi basta il testo.

DATI DELL'UTENTE
Sessione in corso: ${st.cur.session}, iniziata alle ${new Date(st.cur.start).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}${days!=null?`; giorni dall'ultima sessione: ${days}`:""}.
Scheda di oggi (▶ = esercizio corrente):
${today}
Esercizio corrente: ${e.n}${e.s?` (${e.s})`:""}${id!==origId(st.cur.exIdx)?` (sostituisce ${EX[origId(st.cur.exIdx)].n} della scheda)`:""}, ${isTimeIt(it)?`esercizio a tempo di mobilità/stretching: ${n} giri × ${holdTxt(it)}, niente carichi`:`attrezzo: ${EQ_LABEL[e.eq]}, ${n} serie × ${lo}–${hi} rip, RIR 2–3`}, recupero ${rest}s. Tecnica: ${e.cue}${(st.exNotes||{})[id]?` Note personali dallo storico: ${(st.exNotes[id].ref||"")} Cue personali: ${(st.exNotes[id].cue||"")}`:""}${e.note?` Nota: ${e.note}`:""}
Carico di questo esercizio: ${modeOf(id)}. Alternative mirate (stesso muscolo e stesso stimolo) se chiede di cambiarlo: ${(typeof ALT!=="undefined"&&ALT[origId(st.cur.exIdx)]||[]).map(([a,w])=>`${EX[a]?EX[a].n:a} (${w})`).join("; ")||"scegli tu con lo stesso pattern e muscolo bersaglio"}.
Serie fatte oggi su questo esercizio: ${perfTxt(setsOf(st.cur.exIdx))||"nessuna"}.
Storico di questo esercizio (più recente prima): ${exHistoryTxt(id)}.
Carico consigliato oggi dall'app: ${suggTxt(id)??"non definito"}. Unità che sta usando ora: ${prefUnit()}.
Ultime sessioni:
${recentSessionsTxt()}
Ultima prestazione registrata per ogni esercizio (usala per rispondere a domande su carichi e ripetizioni passate; se un dato non c'è, dillo chiaramente invece di inventarlo):
${allExLastTxt()}`;
}
async function callGemini(sys,prompt,onDelta,img,opt={}){
  const key=st.settings.apiKey; if(!key) return {err:"manca la chiave Gemini"};
  const models=[...new Set([...(opt.models||[]),st.settings.model||"gemini-3.8-flash","gemini-3.8-flash","gemini-flash-latest","gemini-3.6-flash","gemini-2.5-flash"])];
  let err="", retried=false;
  // livelli di ragionamento da provare se il modello rifiuta quello scelto
  const lv0=["minimal","low","medium"].includes(st.settings.think)?st.settings.think:"low";
  let levels=lv0==="minimal"?["minimal","low",null]:[lv0,null];
  for(const model of models){
    const lvl=levels[0], think=lvl!=null && /^gemini-(3|flash-latest|2\.5)/.test(model);
    let got="";
    try{
      const ctl=new AbortController(); let to=setTimeout(()=>ctl.abort(),45000);
      const gc = !think ? {} : /^gemini-2\.5/.test(model) ? {thinkingConfig:{thinkingBudget:{minimal:0,low:512,medium:2048}[lvl]}} : {thinkingConfig:{thinkingLevel:lvl}};
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,{
        method:"POST",signal:ctl.signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:"user",parts:[...(img?[{inlineData:{mimeType:img.mime,data:img.data}}]:[]),{text:prompt}]}],generationConfig:gc})});
      if(r.status===404){ clearTimeout(to); err="modello Gemini non trovato"; continue; }
      if(r.status===429){ clearTimeout(to); if(opt.models){ err="limite gratuito di Gemini raggiunto per ora"; continue; } return {err:"limite gratuito di Gemini raggiunto per ora"}; }
      if(r.status===400||r.status===401||r.status===403){ clearTimeout(to); const j=await r.json().catch(()=>({})); const m=(j.error&&j.error.message)||"";
        if(think && r.status===400 && /think/i.test(m)){ levels=levels.slice(1); models.splice(models.indexOf(model)+1,0,model); continue; }
        return {err:/API key/i.test(m)?"chiave Gemini non valida":"Gemini: "+(m||r.status)}; }
      if(r.status>=500){ clearTimeout(to); err="i server di Gemini sono sovraccarichi"; if(!retried){ retried=true; await new Promise(z=>setTimeout(z,1500)); models.splice(models.indexOf(model)+1,0,model); } continue; }
      if(!r.ok){ clearTimeout(to); err="Gemini: errore "+r.status; continue; }
      // lettura dello stream (Server-Sent Events): il testo compare man mano
      const rd=r.body.getReader(), dec=new TextDecoder(); let buf="", block="", raw="";
      for(;;){
        const {done,value}=await rd.read(); if(done) break;
        clearTimeout(to); to=setTimeout(()=>ctl.abort(),30000);
        const piece=dec.decode(value,{stream:true}); buf+=piece; if(raw.length<200000) raw+=piece;
        let k; while((k=buf.indexOf("\n"))>=0){
          const line=buf.slice(0,k).replace(/\r$/,""); buf=buf.slice(k+1);
          if(line.startsWith("data:")) block+=line.slice(5).trim();
          else if(line==="" && block){ try{ const j=JSON.parse(block); const parts=(j.candidates||[])[0]?.content?.parts||[];
              for(const p of parts) if(p.text && !p.thought) got+=p.text;
              if(j.promptFeedback&&j.promptFeedback.blockReason) err="Gemini: domanda bloccata ("+j.promptFeedback.blockReason+")";
            }catch(e){} block=""; if(onDelta && got) onDelta(got); }
        }
      }
      if(block){ try{ const j=JSON.parse(block); for(const p of ((j.candidates||[])[0]?.content?.parts||[])) if(p.text&&!p.thought) got+=p.text; }catch(e){} }
      if(!got && /^\s*[\[{]/.test(raw)){ try{ [].concat(JSON.parse(raw)).forEach(j=>{ for(const p of ((j.candidates||[])[0]?.content?.parts||[])) if(p.text&&!p.thought) got+=p.text; }); }catch(e){} }
      clearTimeout(to);
      if(got) return {out:got,by:model};
      err=err||"Gemini: risposta vuota";
    }catch(e){
      if(got) return {out:got,by:model,partial:true};
      if(navigator.onLine===false) return {err:"nessuna connessione",offline:true};
      err = e.name==="AbortError" ? "Gemini non ha risposto in tempo" : `errore di rete con Gemini (${e.message||e.name})`;
      if(!retried){ retried=true; await new Promise(z=>setTimeout(z,1200)); models.splice(models.indexOf(model)+1,0,model); }
    }
  }
  return {err};
}
async function callOpenRouter(sys,prompt,onDelta,img){
  const key=st.settings.orKey; if(!key) return {err:"manca la chiave OpenRouter"};
  const models=[...new Set([st.settings.orModel||"moonshotai/kimi-k2.6:free","moonshotai/kimi-k2.6:free","moonshotai/kimi-k2:free","openrouter/free"])];
  try{
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+key,"HTTP-Referer":location.origin,"X-Title":"Gym Coach"},
      body:JSON.stringify({model:models[0],models,messages:[{role:"system",content:sys},{role:"user",content:img?[{type:"text",text:prompt},{type:"image_url",image_url:{url:`data:${img.mime};base64,${img.data}`}}]:prompt}]})});
    if(r.status===401) return {err:"chiave OpenRouter non valida"};
    if(r.status===402) return {err:"credito OpenRouter esaurito"};
    if(r.status===429) return {err:"limite gratuito di OpenRouter raggiunto (50 domande al giorno senza credito)"};
    if(!r.ok){ const j=await r.json().catch(()=>({})); return {err:"OpenRouter: "+((j.error&&j.error.message)||r.status)}; }
    const j=await r.json(); const out=(j.choices||[])[0]?.message?.content||"";
    return out?{out,by:j.model||models[0]}:{err:"OpenRouter: risposta vuota"};
  }catch(e){ return navigator.onLine===false?{err:"nessuna connessione",offline:true}:{err:`errore di rete con OpenRouter (${e.message||e.name})`}; }
}
function aiReady(){ return !!(st.settings.apiKey||st.settings.orKey); }
let wentHidden=false, retryImg=null;
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden") wentHidden=true;
  else if(st.cur && st.cur.aiRetry){ const t=st.cur.aiRetry; st.cur.aiRetry=null; save(); sys("Riprovo la domanda rimasta in sospeso…"); askAI(t,retryImg); retryImg=null; }
});
async function askAI(text,img,viaAll){
  if(!aiReady()){
    bot(`Non ho capito il messaggio come serie. Per registrarla scrivi per esempio <i>24 kg 9 rip RIR 2</i>.<br>Per farmi domande libere aggiungi una chiave gratuita (Gemini o OpenRouter/Kimi) in ⚙ Impostazioni.`);
    return;
  }
  const recent=st.cur.chat.slice(-9,-1).filter(m=>m.who!=="sys").map(m=>(m.who==="user"?"Utente: ":"Coach: ")+m.text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,300)).join("\n");
  const photoNote = img ? `\nL'utente ha allegato una FOTO (di solito un macchinario o un attrezzo di una palestra nuova). Identifica l'attrezzo; dì chiaramente se va bene per l'esercizio corrente oppure a quale alternativa mirata corrisponde (se è meglio cambiare esercizio, rispondi con #CAMBIA <nome>); spiega in breve come regolarlo (sedile, appoggi, perno, impugnatura) e come si legge il carico secondo la convenzione dell'app (per lato o totale, kg o lb in base a ciò che si vede su pacco o dischi). Se la foto non è chiara chiedi un'altra inquadratura.` : "";
  const prompt=(recent?`Conversazione recente:\n${recent}\n\n`:"")+`Nuovo messaggio dell'utente: ${text}${photoNote}`;
  const typing=drawMsg({who:"bot",text:"…",cls:"typing"});
  wentHidden=document.visibilityState==="hidden";
  const sysTxt=aiContext();
  const order=st.settings.provider==="openrouter"?[callOpenRouter,callGemini]:[callGemini,callOpenRouter];
  let res=null; const errs=[];
  for(const f of order){
    if(f===callGemini&&!st.settings.apiKey || f===callOpenRouter&&!st.settings.orKey) continue;
    res=await f(sysTxt,prompt,txt=>{ if(!/^\s*#/.test(txt)){ typing.classList.remove("typing"); typing.innerHTML=md(txt); $("#chat").scrollTop=1e9; } },img); if(res.out) break; errs.push(res.err); if(res.offline) break;
  }
  typing.remove();
  if((!res||!res.out) && localFallback(text)) return;
  if((!res||!res.out) && wentHidden && !errs.every(e=>e==="nessuna connessione")){
    st.cur.aiRetry=text; retryImg=img||null; save();
    if(document.visibilityState==="visible"){ st.cur.aiRetry=null; save(); sys("La richiesta si era interrotta mentre eri in un'altra app: riprovo…"); return askAI(text,img,viaAll); }
    sys("Richiesta interrotta perché sei uscito dall'app: la ripeto appena torni qui.");
    return;
  }
  if(!res||!res.out){ bot(esc(errs.length && errs.every(e=>e==="nessuna connessione") ? "Il telefono risulta offline: per le domande serve internet. Le serie le registro anche offline." : "Non sono riuscito a rispondere ("+errs.join("; ")+"). Riprova tra poco; se succede spesso tieni l'app aperta in primo piano mentre aspetti la risposta.")); return; }
  const out=res.out.trim();
  const ms=out.match(/^#SERIE\b(.*)$/m);
  if(ms){ const g=k=>{ const m=ms[1].match(new RegExp(k+"\\s*=\\s*([\\w.,]+)")); return m&&m[1]!=="?"?m[1]:null; };
    if(isTimeIt(item())) return logTimed();
    const num=v=>v==null?null:+String(v).replace(",",".");
    st.cur.pending=null; return logSet({kg:num(g("kg")),unit:g("unita")==="lb"?"lb":g("unita")==="kg"?"kg":null,reps:num(g("rip")),rir:num(g("rir"))}); }
  const mc=out.match(/^#CAMBIA\s+(.+)$/m);
  if(mc){ bot(md(`Ok, apro il cambio esercizio con **${mc[1].trim()}**: conferma o scegline un altro.`)); return openSwap(mc[1].trim()); }
  let j=null; if(/^\s*\{/.test(out)){ try{ j=JSON.parse(out); }catch(e){} }
  if(j && j.azione==="cambia" && j.esercizio){ bot(md(`Ok, apro il cambio esercizio con **${j.esercizio}**: conferma o scegline un altro.`)); return openSwap(j.esercizio); }
  if(j && j.azione==="serie" && isTimeIt(item())) return logTimed();
  if(j && j.azione==="serie" && (j.rip!=null || j.rir!=null)){ st.cur.pending=null; return logSet({kg:j.kg??null,unit:j.unita==="lb"?"lb":j.unita==="kg"?"kg":null,reps:j.rip??null,rir:j.rir??null}); }
  bot(md(j&&j.testo ? j.testo : out.replace(/^```\w*|```$/g,"")));
}

/* ---------------- timer di recupero ---------------- */
let tEnd=0,tTot=0,tInt=null,beeped=false,ac=null,tOpts={},sideBeeped=false;
function unlockAudio(){ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==="suspended") ac.resume(); }catch(e){} }
function beep(){
  try{ if(ac){ [0,.3,.6].forEach(o=>{const os=ac.createOscillator(),g=ac.createGain();os.frequency.value=880;os.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.3,ac.currentTime+o);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+o+.22);os.start(ac.currentTime+o);os.stop(ac.currentTime+o+.25);}); } }catch(e){}
  try{ navigator.vibrate && navigator.vibrate([400,150,400]); }catch(e){}
}
function shortBeep(){ try{ if(ac){ const os=ac.createOscillator(),g=ac.createGain();os.frequency.value=660;os.connect(g);g.connect(ac.destination);g.gain.setValueAtTime(.3,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.25);os.start();os.stop(ac.currentTime+.3);} }catch(e){} try{ navigator.vibrate&&navigator.vibrate(250); }catch(e){} }
function startTimer(sec,opts={}){ tOpts=opts; tTot=sec; tEnd=Date.now()+sec*1000; beeped=false; sideBeeped=false;
  $(".t-lab").textContent=opts.label||"Recupero"; $("#timer").classList.toggle("hold",!!opts.hold);
  if(st.cur){st.cur.timer={end:tEnd,tot:tTot,label:opts.label||"Recupero",sideAt:opts.sideAt||null,hold:!!opts.hold};save();}
  $("#timer").hidden=false; clearInterval(tInt); tick(); tInt=setInterval(tick,250); }
function stopTimer(){ clearInterval(tInt); tOpts={}; $("#timer").hidden=true; if(st.cur){st.cur.timer=null;save();} }
function tick(){
  const left=(tEnd-Date.now())/1000;
  $("#tVal").textContent = left>=0 ? fmtT(left) : "+"+fmtT(-left);
  $("#tVal").classList.toggle("over",left<0);
  $("#tBar").style.width=clamp(100*(1-left/tTot),0,100)+"%";
  if(tOpts.sideAt && !sideBeeped && left<=tOpts.sideAt && left>0){ sideBeeped=true; shortBeep(); $(".t-lab").textContent="Cambia lato · Lato 2"; }
  if(left<=0 && !beeped){ beeped=true; beep(); if(tOpts.hold && st.cur && isTimeIt(item())){ logTimed(); return; } }
  if(left<-3*3600) stopTimer();   // continua a contare il tempo dall'ultima serie (fino a 3 ore)
}
$("#tPlus").onclick=()=>{ tEnd+=15000; tTot+=15; beeped=false; if(st.cur){st.cur.timer={end:tEnd,tot:tTot};save();} tick(); };
$("#tStop").onclick=stopTimer;

/* ---------------- schermo sempre acceso ---------------- */
let wake=null;
async function keepAwake(){ try{ if((st.cur||ymPlaying) && "wakeLock" in navigator && !wake){ wake=await navigator.wakeLock.request("screen"); wake.addEventListener("release",()=>wake=null); } }catch(e){} }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"){ keepAwake(); if(st.cur&&st.cur.timer) tick(); } });

/* ---------------- disegno ---------------- */
function drawTop(){
  if(!st.cur){ $("#topSess").textContent="Gym Coach"; $("#topSub").textContent="Registro allenamenti"; return; }
  const list=curList(), done=list.reduce((a,x,k)=>a+Math.min(x[1],workSets(k).length),0), tot=list.reduce((a,x)=>a+x[1],0);
  $("#topSess").textContent=st.cur.session;
  $("#topSub").textContent=`Esercizio ${st.cur.exIdx+1}/${list.length} · ${done}/${tot} ${isExtraSess(st.cur.session)?"giri":"serie"} · iniziata ${new Date(st.cur.start).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`;
}
function drawVideo(){
  const e=exOf(item());
  if(!e.v.length){
    destroyGrid(); destroyExerciseVideo(); yvWant=null;
    const q=encodeURIComponent(e.n+" tecnica esecuzione");
    $("#frame").classList.remove("multi"); $("#player").classList.remove("multi");
    $("#frame").innerHTML=`<div style="display:grid;place-items:center;text-align:center;color:var(--mut);padding:16px;gap:8px">Nessun video per questo esercizio.<button type="button" class="btn acc" id="vAdd0">＋ Aggiungi un video</button></div>`;
    $("#player").classList.remove("collapsed");
    $("#vchips").innerHTML=`<a class="vchip ghost" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--mut)">🔎 Cerca su YouTube ↗</a>`;
    $("#vAdd0").onclick=()=>openVideoAdd(item()[0]); return;
  }
  const vi=clamp(st.cur.vid||0,0,e.v.length-1), [id]=e.v[vi];
  const multi = st.ui.vidLayout!=="single" && e.v.length>1;
  $("#player").classList.toggle("collapsed",!!st.ui.videoHidden);
  $("#player").classList.toggle("small",!st.ui.videoHidden && st.ui.vsize!=="l");
  applyVH(); applyMW();
  $("#frame").classList.toggle("multi",multi);
  $("#player").classList.toggle("multi",multi);
  if(st.ui.videoHidden){ destroyGrid(); destroyExerciseVideo(); }
  else if(multi){ destroyExerciseVideo(); buildGrid(e,vi); }
  else { destroyGrid(); showExerciseVideo(id); }
  const sizeLbl = st.ui.videoHidden ? "▣ Mostra video" : st.ui.vsize==="l" ? "▭ Video piccolo" : "☐ Solo chat";
  $("#vchips").innerHTML = `<button class="vchip ghost size" id="vSize">${sizeLbl}</button>` + e.v.map(([vid,ch],k)=>`<button class="vchip ${k===vi&&!st.ui.videoHidden?"on":""}" data-k="${k}">${multi?"":"▶ "}${esc(ch)}</button>`).join("")
    + (e.v.length>1?`<button class="vchip ghost" id="vLayout">${multi?"▢ Uno alla volta":"▦ Affiancati"}</button>`:"")
    + (st.ui.videoHidden||st.ui.vsize==="l"?"":`<button class="vchip ghost" id="vBig">▢ Video grande</button>`)
    + `<button class="vchip ghost" id="vAdd">＋ Video</button>`
    + `<a class="vchip ghost" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--mut)">Apri in YouTube ↗</a>`;
  $("#vAdd").onclick=()=>openVideoAdd(item()[0]);
  $("#vchips").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ st.cur.vid=+b.dataset.k; st.ui.videoHidden=false; save(); if(multi&&grid){ setGridActive(+b.dataset.k,true); drawVideoChips(); } else drawVideo(); });
  const lay=$("#vLayout"); if(lay) lay.onclick=()=>{ st.ui.vidLayout = multi?"single":"multi"; save(); drawVideo(); };
  // dimensione: piccolo (predefinito) → solo chat → piccolo; "grande" a parte
  $("#vSize").onclick=()=>{ st.ui.vh=null; if(st.ui.videoHidden){ st.ui.videoHidden=false; st.ui.vsize="s"; } else if(st.ui.vsize==="l") st.ui.vsize="s"; else st.ui.videoHidden=true; save(); drawVideo(); };
  const vb=$("#vBig"); if(vb) vb.onclick=()=>{ st.ui.vh=null; st.ui.vsize="l"; save(); drawVideo(); };
}
function drawVideoChips(){ const vi=st.cur.vid||0; $("#vchips").querySelectorAll("[data-k]").forEach(b=>b.classList.toggle("on",+b.dataset.k===vi)); }

/* ---------------- più video affiancati (scorri di lato) ---------------- */
let grid=null;
function buildGrid(e,active){
  const key=e.v.map(x=>x[0]).join(",");
  if(grid && grid.key===key){ setGridActive(active,false); return; }
  destroyGrid();
  $("#frame").innerHTML=`<div class="vgrid" id="vgrid">${e.v.map(([vid,ch],k)=>`<div class="vcard" data-k="${k}"><div id="ytG${k}"></div><button class="vlab" data-k="${k}" type="button">${k===active?"🔊":"🔇"} ${esc(ch)}</button></div>`).join("")}</div>`;
  grid={key,ids:e.v.map(x=>x[0]),players:[],ready:[],active};
  $("#vgrid").querySelectorAll(".vlab").forEach(b=>b.onclick=()=>{ const k=+b.dataset.k; unlockAudio();
    if(grid && grid.active===k){ setVolV(st.ui.volV>0?0:(st.ui.lastVolV||60)); }
    else { st.cur.vid=k; save(); if(st.ui.volV<=0) st.ui.volV=st.ui.lastVolV||60; setGridActive(k,false); drawVideoChips(); drawMusic(); }
    setGridActive(grid.active,false); });
  if(apiOk()) startGridPlayers();
  setGridActive(active,false);
}
function startGridPlayers(){
  if(!grid || grid.io) return;
  const g=grid;
  g.io=new IntersectionObserver(ents=>ents.forEach(en=>{ const k=+en.target.dataset.k; if(en.isIntersecting && !g.players[k] && grid===g) makeGridPlayer(g,k); }),{root:$("#vgrid"),threshold:0.15});
  document.querySelectorAll("#vgrid .vcard").forEach(c=>g.io.observe(c));
}
function makeGridPlayer(g,k){
  const card=document.querySelector(`#vgrid .vcard[data-k="${k}"]`); seekZones(card,()=>g.ready[k]?g.players[k]:null);
  g.players[k]=new YT.Player("ytG"+k,{width:"100%",height:"100%",videoId:g.ids[k],
    playerVars:{autoplay:1,mute:1,playsinline:1,rel:0,modestbranding:1,controls:0,disablekb:1,iv_load_policy:3,fs:0},
    events:{ onReady:e=>{ g.ready[k]=true; applyVolV(); try{ e.target.playVideo(); }catch(_){} },
             onStateChange:e=>{ if(e.data===YT.PlayerState.ENDED){ e.target.seekTo(0); e.target.playVideo(); } } }});
}
function setGridActive(k,scroll){
  if(!grid) return; grid.active=k;
  document.querySelectorAll("#vgrid .vcard").forEach(c=>{ const on=+c.dataset.k===k; c.classList.toggle("on",on); const l=c.querySelector(".vlab"); if(l) l.textContent=(on&&st.ui.volV>0?"🔊 ":"🔇 ")+l.textContent.replace(/^\S+\s/,""); });
  if(scroll){ const c=document.querySelector(`#vgrid .vcard[data-k="${k}"]`); if(c) c.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"}); }
  applyVolV();
}
function destroyGrid(){
  if(!grid) return;
  try{ grid.io&&grid.io.disconnect(); }catch(e){}
  grid.players.forEach(p=>{ try{ p&&p.destroy(); }catch(e){} });
  grid=null; $("#frame").innerHTML="";
}

/* ---------------- Duetto: video dell'esercizio + musica, ognuno col suo volume ---------------- */
st.ui.volV ??= 0;
st.ui.music = {src:null,raw:"",title:"",vol:35,loop:true,recent:[],...(st.ui.music||{})};
const apiOk=()=>!!(window.YT&&YT.Player);
let yv=null,yvReady=false,yvId=null,yvWant=null, ym=null,ymReady=false,ymPlaying=false,ymWant=false;
function parseYT(s){
  s=(s||"").trim(); if(!s) return null;
  if(/^[\w-]{11}$/.test(s)) return {id:s,list:null};
  try{
    const u=new URL(/^https?:/i.test(s)?s:"https://"+s);
    const list=u.searchParams.get("list"); let id=u.searchParams.get("v");
    if(u.hostname.includes("youtu.be")) id=u.pathname.slice(1).split("/")[0];
    const m=u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/); if(m) id=m[2];
    if(id&&!/^[\w-]{11}$/.test(id)) id=null;
    return (id||list)?{id,list}:null;
  }catch(e){ return null; }
}
function applyVolV(){
  const v=st.ui.volV;
  if(grid){ grid.players.forEach((p,k)=>{ if(!p||!grid.ready[k]) return; try{ if(k===grid.active && v>0){ p.unMute(); p.setVolume(v); } else p.mute(); }catch(e){} }); return; }
  if(!yvReady) return; try{ if(v<=0) yv.mute(); else { yv.unMute(); yv.setVolume(v); } }catch(e){}
}
function showExerciseVideo(id){
  yvWant=id;
  if(!apiOk()) return;                          // il lettore si crea quando l'API di YouTube è pronta
  if(yv){ if(yvReady && yvId!==id){ yv.loadVideoById(id); yvId=id; applyVolV(); } return; }
  $("#frame").innerHTML='<div id="ytV"></div>';
  seekZones($("#frame"),()=>yvReady?yv:null);
  yv=new YT.Player("ytV",{width:"100%",height:"100%",videoId:id,
    playerVars:{autoplay:1,mute:1,playsinline:1,rel:0,modestbranding:1,controls:0,disablekb:1,iv_load_policy:3,fs:0},
    events:{
      onReady:e=>{ yvReady=true; yvId=id; if(yvWant&&yvWant!==id){ yv.loadVideoById(yvWant); yvId=yvWant; } applyVolV(); try{ e.target.playVideo(); }catch(err){} },
      onStateChange:e=>{ if(e.data===YT.PlayerState.ENDED){ yv.seekTo(0); yv.playVideo(); } }
    }});
}
/* doppio tocco a sinistra/destra = indietro/avanti di 10 s (come nell'app YouTube); un tocco = play/pausa */
function seekZones(parent,getP,onSingle){
  if(!parent || parent.querySelector(":scope > .seekz")) return;
  const z=document.createElement("div"); z.className="seekz";
  z.innerHTML='<div data-d="-10"><span>« 10 s</span></div><div data-d="0" class="mid"><span></span></div><div data-d="10"><span>10 s »</span></div><b class="pz" hidden>⏸</b><i class="vprog"><i></i></i>';
  const pz=z.querySelector(".pz"), bar=z.querySelector(".vprog>i");
  const toggle=()=>{ if(onSingle){ onSingle(); return; } const p=getP(); if(!p) return; let playing=false; try{ playing=p.getPlayerState()===1; playing?p.pauseVideo():p.playVideo(); }catch(e){}
    const sp=z.querySelector(".mid span"); sp.textContent=playing?"⏸":"▶"; const el=z.querySelector(".mid"); el.classList.remove("fl"); void el.offsetWidth; el.classList.add("fl"); clearTimeout(el._r); el._r=setTimeout(()=>el.classList.remove("fl"),600); };
  z.querySelectorAll("[data-d]").forEach(el=>{ let t=0, tm=null, sum=0;
    el.addEventListener("click",ev=>{ ev.stopPropagation(); ev.preventDefault(); const now=Date.now(), d=+el.dataset.d;
      if(!d){ toggle(); return; }
      if(now-t<380){ clearTimeout(tm); t=now; const p=getP(); if(!p) return;
        try{ p.seekTo(Math.max(0,(p.getCurrentTime()||0)+d),true); }catch(e){}
        sum=(sum||0)+d; const sp=el.querySelector("span"); sp.textContent=d<0?`« ${-sum} s`:`${sum} s »`; el.classList.remove("fl"); void el.offsetWidth; el.classList.add("fl");
        clearTimeout(el._r); el._r=setTimeout(()=>{ sum=0; el.classList.remove("fl"); },700); }
      else { t=now; sum=0; tm=setTimeout(()=>{ t=0; toggle(); },380); }
    }); });
  // stato di pausa e avanzamento (i comandi di YouTube sono nascosti)
  if(!onSingle){ const iv=setInterval(()=>{ if(!z.isConnected){ clearInterval(iv); return; } const p=getP(); if(!p) return;
    try{ const s0=p.getPlayerState(), d=p.getDuration()||0, c=p.getCurrentTime()||0; pz.hidden=s0!==2; bar.style.width=d?Math.min(100,c/d*100)+"%":"0"; }catch(e){} },400); }
  parent.appendChild(z);
}
function destroyExerciseVideo(){ if(!yv) return; try{ yv.destroy(); }catch(e){} yv=null; yvReady=false; yvId=null; $("#frame").innerHTML=""; }

function ensureMusic(){
  const m=st.ui.music; if(!apiOk()||ym||!m.src) return;
  const pv={playsinline:1,rel:0,modestbranding:1}; if(m.src.list){ pv.listType="playlist"; pv.list=m.src.list; if(m.plIdx>0) pv.index=m.plIdx; }
  const resume = m.pos>3 && (m.src.list ? true : m.posId===m.src.id) ? Math.floor(m.pos) : 0;   // riparte da dove era
  if(resume) pv.start=resume;
  $("#mPh").hidden=true;
  ym=new YT.Player("ytM",{width:"100%",height:"100%",videoId:m.src.list?undefined:m.src.id,playerVars:pv,
    events:{
      onReady:()=>{ ymReady=true; ym.setVolume(m.vol); if(resume){ try{ ym.seekTo(resume,true); if(!ymWant) ym.pauseVideo(); }catch(e){} } if(ymWant) ym.playVideo(); drawMusic(); },
      onStateChange:e=>{ const S=YT.PlayerState;
        if(e.data===S.ENDED && m.loop){ if(m.src&&m.src.list) ym.playVideoAt(0); else { ym.seekTo(0); ym.playVideo(); } return; }
        ymPlaying=(e.data===S.PLAYING||e.data===S.BUFFERING);
        if(e.data===S.PLAYING){ ymWant=false; noteTitle(); keepAwake(); }
        if(e.data===S.PAUSED) saveMusicPos(true);
        drawMusic(); },
      onError:e=>{ ymPlaying=false; ymWant=false; drawMusic(e.data===101||e.data===150?"Questo brano non si può riprodurre fuori da YouTube":"Link non disponibile"); }
    }});
}
function noteTitle(){
  const m=st.ui.music; let t=""; try{ t=(ym.getVideoData()||{}).title||""; }catch(e){}
  if(t){ m.title=t; m.recent=[{raw:m.raw,title:t,list:!!(m.src&&m.src.list)},...m.recent.filter(r=>r.raw!==m.raw)].slice(0,8); save(); }
}
function loadMusic(raw,autoplay=true){
  const src=parseYT(raw); if(!src){ drawMusic("Link non valido: copialo da YouTube (Condividi → Copia link)"); return false; }
  const m=st.ui.music; m.src=src; m.raw=raw.trim(); m.title=""; m.pos=0; m.posId=null; m.plIdx=0; save();
  ymWant=autoplay; unlockAudio();
  if(!ym) ensureMusic();
  else if(ymReady){ if(src.list) ym.loadPlaylist({list:src.list,listType:"playlist",index:0}); else ym.loadVideoById(src.id); ym.setVolume(m.vol); if(!autoplay) ym.pauseVideo(); }
  drawMusic(); return true;
}
function toggleMusic(){
  const m=st.ui.music; unlockAudio();
  if(!m.src){ $("#mPanel").hidden=false; drawMusic(); $("#mIn").focus(); return; }
  if(!ym){ ymWant=true; ensureMusic(); drawMusic(); return; }
  if(!ymReady){ ymWant=!ymWant; drawMusic(); return; }
  if(ymPlaying) ym.pauseVideo(); else ym.playVideo();
}
function drawMusic(msg){
  const m=st.ui.music;
  $("#mTitle").textContent = m.title || (m.src ? (m.src.list?"Playlist caricata":"Brano caricato") : "Musica");
  $("#mSub").textContent = msg || (m.src ? (ymPlaying?"In riproduzione":ymWant?"Avvio…":"In pausa")+(m.src.list?" · playlist":"")+(m.loop?" · ripeti":"") : "Tocca per incollare un link YouTube");
  $("#mPlay").textContent = !m.src ? "＋" : (ymPlaying||ymWant) ? "❚❚" : "▶"; $("#mPlay").classList.toggle("on",ymPlaying);
  if(msg && st.cur) sys("🎵 "+msg);
  $("#mPh").hidden = !!ym;
  $("#volV").value=st.ui.volV; $("#oV").textContent=st.ui.volV;
  $("#muteV").textContent=st.ui.volV>0?"🔊":"🔇"; $("#muteV").classList.toggle("on",st.ui.volV>0);
  $("#muteM").textContent=m.vol>0?"🎵":"🔕"; $("#muteM").classList.toggle("on",m.vol>0 && ymPlaying);
  $("#volM").value=m.vol; $("#oM").textContent=m.vol;
  $("#mLoop").checked=!!m.loop;
  $("#mMore").textContent = $("#mPanel").hidden ? "⌄" : "⌃";
  $("#mRecent").innerHTML = m.recent.map((r,k)=>`<button class="vchip ${r.raw===m.raw?"on":""}" data-r="${k}">${r.list?"☰ ":"♪ "}${esc(r.title.length>28?r.title.slice(0,27)+"…":r.title)}</button>`).join("");
  $("#mRecent").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ loadMusic(m.recent[+b.dataset.r].raw,true); $("#mPanel").hidden=true; drawMusic(); });
}
$("#mPlay").onclick=toggleMusic;
/* avanti/indietro nella musica (il riquadro non accetta tocchi, quindi comandi nostri) */
let seekDrag=false;
const hms=t=>{ t=Math.max(0,Math.floor(t||0)); const h=Math.floor(t/3600), m=Math.floor(t%3600/60), x=String(t%60).padStart(2,"0"); return h?`${h}:${String(m).padStart(2,"0")}:${x}`:`${m}:${x}`; };
function drawSeek(){
  const ok=!!(ym&&ymReady&&st.ui.music.src); $("#mSeek").hidden=!ok; if(!ok) return;
  let d=0,c=0; try{ d=ym.getDuration()||0; c=ym.getCurrentTime()||0; }catch(e){}
  if(!seekDrag){ $("#mPos").max=Math.max(1,Math.round(d)); $("#mPos").value=Math.round(c); }
  $("#mTime").textContent=`${hms(seekDrag?+$("#mPos").value:c)} / ${hms(d)}`;
}
let posSaved=0;
function saveMusicPos(force){
  if(!ym||!ymReady||!st.ui.music.src) return;
  try{ const m=st.ui.music, t=ym.getCurrentTime()||0; if(t<1) return;
    m.pos=t; m.posId=(ym.getVideoData()||{}).video_id||m.src.id; if(m.src.list&&ym.getPlaylistIndex) m.plIdx=Math.max(0,ym.getPlaylistIndex()||0);
    if(force||Date.now()-posSaved>5000){ posSaved=Date.now(); save(); } }catch(e){}
}
setInterval(()=>{ if(!document.hidden) drawSeek(); if(ymPlaying) saveMusicPos(false); },1000);
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") saveMusicPos(true); });
window.addEventListener("pagehide",()=>saveMusicPos(true));
document.querySelectorAll("[data-sk]").forEach(b=>b.onclick=()=>{ if(!ym||!ymReady) return; try{ const t=Math.max(0,(ym.getCurrentTime()||0)+(+b.dataset.sk)); ym.seekTo(t,true); }catch(e){} setTimeout(drawSeek,200); });
$("#mPos").addEventListener("input",()=>{ seekDrag=true; drawSeek(); });
$("#mPos").addEventListener("change",()=>{ seekDrag=false; try{ ym.seekTo(+$("#mPos").value,true); }catch(e){} setTimeout(drawSeek,200); });
seekZones($("#mTile"),()=>ymReady&&ym?ym:null,()=>toggleMusic());
$("#mMore").onclick=()=>{ $("#mPanel").hidden=!$("#mPanel").hidden; drawMusic(); if(!$("#mPanel").hidden) loadDuetto(); };
/* libreria di Duetto: gli stessi autori YouTube, con i video più recenti (aggiornati da Duetto ogni 8 ore) */
const DUETTO_URL="https://valeriowork360.github.io/duetto/videos.json";
let duetto=null, dlTab="new";
function dlCache(){ try{ return JSON.parse(localStorage.getItem("gc_duetto")||"null"); }catch(e){ return null; } }
async function loadDuetto(){
  if(!duetto) duetto=dlCache(); drawDuetto();
  if(duetto && duetto._t && Date.now()-duetto._t<30*60e3) return;
  // libreria propria di Gym Coach (music.json, aggiornata ogni 7 ore); Duetto solo come riserva
  try{ let r=await fetch("music.json?t="+Date.now(),{cache:"no-store"}).catch(()=>null); if(!r||!r.ok) r=await fetch(DUETTO_URL+"?t="+Date.now(),{cache:"no-store"}); if(!r.ok) throw 0; const j=await r.json(); j._t=Date.now(); duetto=j;
    try{ localStorage.setItem("gc_duetto",JSON.stringify(j)); }catch(e){} drawDuetto(); }
  catch(e){ if(!duetto) $("#dlList").innerHTML=`<p class="muted">Libreria non raggiungibile ora (serve internet).</p>`; }
}
const durTxt=s=>!s?"":s>=3600?`${Math.floor(s/3600)} h ${Math.round(s%3600/60)} min`:`${Math.round(s/60)} min`;
function drawDuetto(){
  if(!duetto) return;
  const ch=duetto.channels||[], pl=(duetto.playlists||[]).filter(p=>p.videos&&p.videos.length);
  $("#dlUpd").textContent=duetto.updated?`· agg. ${new Date(duetto.updated).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`:"";
  const tabs=[["new","🆕 Più recenti"],...pl.map((p,k)=>["p"+k,"☰ "+p.title]),...ch.map((c,k)=>["c"+k,c.name])];
  $("#dlTabs").innerHTML=tabs.map(([k,l])=>`<button class="vchip ${k===dlTab?"on":""}" data-dl="${k}">${esc(l.length>26?l.slice(0,25)+"…":l)}</button>`).join("");
  $("#dlTabs").querySelectorAll("[data-dl]").forEach(b=>b.onclick=()=>{ dlTab=b.dataset.dl; drawDuetto(); });
  let vids=[];
  if(dlTab==="new") vids=ch.flatMap(c=>c.videos.map(v=>({...v,ch:c.name}))).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,30);
  else if(dlTab[0]==="p") vids=(pl[+dlTab.slice(1)]||{videos:[]}).videos.map(v=>({...v,ch:pl[+dlTab.slice(1)].title}));
  else { const c=ch[+dlTab.slice(1)]; vids=c?c.videos.map(v=>({...v,ch:c.name})):[]; }
  $("#dlList").innerHTML=vids.map(v=>`<button class="dl-it ${st.ui.music.src&&st.ui.music.src.id===v.id?"on":""}" data-v="${v.id}" data-t="${esc(v.title)}"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt=""><span><b>${esc(v.title)}</b><i>${esc(v.ch)}${v.dur?" · "+durTxt(v.dur):""}${v.date?" · "+dateTxt(Date.parse(v.date)):""}</i></span></button>`).join("")||`<p class="muted">Nessun video.</p>`;
  $("#dlList").querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{ if(loadMusic("https://www.youtube.com/watch?v="+b.dataset.v,true)){ st.ui.music.title=b.dataset.t; save(); $("#mPanel").hidden=true; drawMusic(); } });
}
$("#mForm").onsubmit=e=>{ e.preventDefault(); if(loadMusic($("#mIn").value,true)){ $("#mIn").value=""; $("#mIn").blur(); $("#mPanel").hidden=true; drawMusic(); } };
$("#mLoop").onchange=e=>{ st.ui.music.loop=e.target.checked; save(); drawMusic(); };
function setVolV(v){ st.ui.volV=v; if(v>0) st.ui.lastVolV=v; save(); applyVolV(); if(grid) setGridActive(grid.active,false); drawMusic(); }
function setVolM(v){ st.ui.music.vol=v; if(v>0) st.ui.lastVolM=v; if(ymReady) ym.setVolume(v); save(); drawMusic(); }
$("#volV").oninput=e=>setVolV(+e.target.value);
$("#volM").oninput=e=>setVolM(+e.target.value);
$("#muteV").onclick=()=>{ unlockAudio(); setVolV(st.ui.volV>0?0:(st.ui.lastVolV||60)); };
$("#muteM").onclick=()=>{ setVolM(st.ui.music.vol>0?0:(st.ui.lastVolM||35)); };
window.onYouTubeIframeAPIReady=()=>{ if(grid) startGridPlayers(); else if(st.cur&&!st.ui.videoHidden&&yvWant) showExerciseVideo(yvWant); ensureMusic(); drawMusic(); };
function loadYTApi(){ const sc=document.createElement("script"); sc.src="https://www.youtube.com/iframe_api"; sc.async=true; document.head.appendChild(sc); }
loadYTApi();
setTimeout(()=>{ if(!apiOk()) loadYTApi(); },8000);

function drawExbar(){
  const it=item(), e=exOf(it), [,n,lo,hi,rest]=it, ws=workSets(st.cur.exIdx);
  let dots=""; for(let s=0;s<n;s++){ const x=ws[s]; dots+=`<span class="dot ${x?"done":s===ws.length?"next":""}" title="Serie ${s+1}">${x?(x.sec!=null?"✓":x.reps):s+1}</span>`; }
  const g=isTimeIt(it)?null:suggested(it[0]), sk=g?wTxt(g.v,g.u):null;
  const rx=isTimeIt(it)?`${n} giri × ${holdTxt(it)} · pausa ${rest} s`:`${n}×${lo}–${hi} · RIR ${RIR_MIN}–${RIR_MAX} · rec ${restTxt(rest)}${sk!=null?` · oggi ${sk}${g.u==="lb"?` (≈${r1(g.v*LB)} kg)`:` (≈${r1(g.v/LB)} lb)`} ${modeOf(it[0])}`:` · kg ${modeOf(it[0])}`}`;
  const list=curList(), tm=isTimeIt(it), wide=!tm && (lo>8||hi>12);
  const tgt = tm ? `<span class="xt-g">${n} giri × ${holdTxt(it)}</span>` : wide ? `<span class="xt-w">⚠ Target ${lo}–${hi} rip.</span>` : `<span class="xt-g">${lo}–${hi} rip.</span>`;
  const sub = tm ? `pausa ${rest} s` : `${n} serie · RIR ${RIR_MIN}–${RIR_MAX} · rec ${restTxt(rest)}`;
  const load = g ? `<div class="xl"><small>Oggi</small><b>${esc(sk)}</b><i>≈ ${g.u==="lb"?r1(g.v*LB)+" kg":r1(g.v/LB)+" lb"} · ${esc(modeOf(it[0]))}</i></div>` : (!tm?`<div class="xl"><small>Oggi</small><b>—</b><i>${esc(modeOf(it[0]))}</i></div>`:"");
  $("#exbar").innerHTML=`<div class="nm"><span class="xn">${st.cur.exIdx+1}/${list.length} — ${esc(e.n)}</span>${tgt}<span class="rx">${sub}</span></div><div class="xr">${load}<div class="dots">${dots}</div></div>`;
  drawTop();
}
let pickW=false;
function drawChips(){
  const pend0=st.cur&&st.cur.pending;
  if(pickW && st.cur && !isTimeIt(item()) && !(pend0&&pend0.need)){
    const ei=extraIdx()??st.cur.exIdx, id=curList()[ei][0], {u,c,arr}=withEx(ei,()=>quickWeights(id,"__vals")), ch=$("#chips");
    ch.innerHTML=`<button class="chip unitsw" data-wu="${u==="lb"?"kg":"lb"}" title="Passa a ${u==="lb"?"chili":"libbre"}">${u} ⇄</button>`+arr.map(v=>`<button class="chip ${v===c?"acc":""}" data-w="${v}">${kgTxt(v)}</button>`).join("");
    ch.querySelectorAll("[data-w]").forEach(b=>b.onclick=()=>{ setPickW(false); unlockAudio(); user(`${kgTxt(+b.dataset.w)} ${u}`); st.cur.pending=null; logSet({kg:+b.dataset.w,unit:u,unitOk:true,reps:null,rir:null}); });
    ch.querySelector("[data-wu]").onclick=()=>{ (st.cur.unitPref ||= {})[ei]=ch.querySelector("[data-wu]").dataset.wu; save(); drawExbar(); drawChips(); };
    const a=ch.querySelector(".acc"); if(a) ch.scrollLeft=a.offsetLeft-ch.offsetLeft-ch.clientWidth/2+a.offsetWidth/2;
    return;
  }
  drawChips0();
  const pend=st.cur&&st.cur.pending, ch=$("#chips");
  if(pend&&pend.need==="reps") ch.insertAdjacentHTML("afterbegin",`<span class="chip lab">Ripetizioni</span>`);
  if(pend&&pend.need==="rir") ch.insertAdjacentHTML("afterbegin",`<span class="chip lab">RIR</span>`);
}
function drawChips0(){
  const c=$("#chips"), pend=st.cur&&st.cur.pending;
  let html="";
  if(pend && pend.need==="unit") html=`<button class="chip acc" data-say="${pend.alt}">Sì, ${wTxt(pend.kg,pend.alt)}</button><button class="chip" data-say="${pend.unit}">No, ${wTxt(pend.kg,pend.unit)}</button>`;
  else if(pend && pend.need==="rir") html=[0,1,1.5,2,2.5,3,4,5,6].map(v=>`<button class="chip ${v>=RIR_MIN&&v<=RIR_MAX?"acc":""}" data-say="RIR ${v}">RIR ${v%1?`${Math.floor(v)}/${Math.ceil(v)}`:v}</button>`).join("");
  else if(pend && pend.need==="reps"){ const [, ,lo,hi]=item(); for(let v=1;v<=Math.max(30,hi+10);v++) html+=`<button class="chip ${v>=lo&&v<=hi?"acc":""}" data-say="${v} rip">${v}</button>`; }
  else {
    const list=curList(), allDone=list.every((x,k)=>workSets(k).length>=x[1]), it=item();
    html=(isTimeIt(it)?`<button class="chip acc" data-cmd="hold">▶ Avvia ${holdTxt(it)}</button><button class="chip acc" data-cmd="done">✓ Fatto</button>`:"")
      +`<button class="chip" data-cmd="undo">↶ Annulla</button>`
      +`<button class="chip ${st.cur.nextExtra?"acc":""}" data-cmd="extra">${st.cur.nextExtra?`⭐ Extra su ${esc((EX[curList()[extraIdx()??st.cur.exIdx][0]]||{n:""}).n.split(" ").slice(0,2).join(" "))} ✕`:"＋ Serie extra"}</button>`
      +(isTimeIt(it)?"":`<button class="chip" data-cmd="unit">⚖ ${prefUnit()==="lb"?"Libbre (lb)":"Chili (kg)"} ⇄</button>`)
      +`<button class="chip" data-cmd="swap">🔁 Cambia esercizio</button>`
      +`<button class="chip" data-cmd="next">Esercizio successivo →</button>`
      +`<button class="chip" data-cmd="hist">📈 Storico</button>`
      +`<button class="chip" data-cmd="list">☰ Elenco</button>`
      +`<button class="chip ${allDone?"acc":""}" data-cmd="end">🏁 Fine sessione</button>`;
  }
  c.innerHTML=html;
  if(pend && pend.need==="reps"){ const [, ,lo]=item(), b=c.querySelector(`[data-say="${Math.max(1,lo-3)} rip"]`); c.scrollLeft=b?b.offsetLeft-c.offsetLeft-6:0; } else c.scrollLeft=0;
  $("#msg").placeholder = st.cur && isTimeIt(item()) ? "Scrivi «fatto» o fai una domanda" : "Es. 24 kg 9 rip RIR 2 — o fai una domanda";
  c.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>onSend(b.dataset.say));
  c.querySelectorAll("[data-cmd]").forEach(b=>b.onclick=()=>{ unlockAudio(); ({unit:toggleUnit,swap:()=>openSwap(),hold:startHold,done:logTimed,undo:undoSet,extra:()=>{
        if(st.cur.nextExtra){ st.cur.nextExtra=false; save(); return drawChips(); }
        const i=st.cur.exIdx, t=(!setsOf(i).length && i>0) ? i-1 : i;   // esercizio appena iniziato: l'extra va su quello precedente
        st.cur.nextExtra={i:t}; st.cur.pending=null; save();
        const it=curList()[t], nm=EX[it[0]].n, tm=isTimeIt(it);
        if(t!==i) bot(`<b>Serie extra su ${esc(nm)}</b> (esercizio precedente). ${tm?"Scrivi «fatto» quando hai finito.":"Tocca il carico usato, poi ripetizioni e RIR:"}${tm?"":withEx(t,()=>quickWeights(it[0]))}`);
        else sys(`La prossima ${tm?"giro":"serie"} di ${nm} la registro come extra (non conta nelle serie allenanti).`);
        drawChips(); },next:()=>goEx(st.cur.exIdx+1),hist:showHistoryEx,list:openList,end:finishSession})[b.dataset.cmd](); });
}
function drawChat(){ $("#chat").innerHTML=""; (st.cur.chat||[]).forEach(drawMsg); }

/* altezza reale dello schermo visibile (barre del browser, tastiera, rotazione): la barra dei comandi resta sempre in vista */
function fitApp(){
  const vv=window.visualViewport, h=Math.round(vv?vv.height:innerHeight);
  document.documentElement.style.setProperty("--appH",h+"px");
  if(window.scrollY||document.documentElement.scrollTop) window.scrollTo(0,0);
  checkCbar();
}
function checkCbar(){
  const bar=document.querySelector(".cbar"), btn=$("#cbtn"); if(!bar||!btn) return;
  const on=!!st.cur && !$("#workout").hidden; if(!on){ btn.classList.remove("show"); return; }
  const r=bar.getBoundingClientRect(), vh=window.visualViewport?visualViewport.height:innerHeight;
  btn.classList.toggle("show", r.height<4 || r.top>vh-8 || r.bottom<0);
}
["resize","orientationchange","scroll"].forEach(ev=>window.addEventListener(ev,()=>setTimeout(fitApp,60),{passive:true}));
if(window.visualViewport){ visualViewport.addEventListener("resize",()=>setTimeout(fitApp,60)); visualViewport.addEventListener("scroll",()=>setTimeout(checkCbar,60)); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) setTimeout(fitApp,150); });
$("#msg").addEventListener("blur",()=>setTimeout(fitApp,300));
setInterval(checkCbar,1500);
$("#cbtn").onclick=()=>{ window.scrollTo(0,0); if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); fitApp(); const bar=document.querySelector(".cbar"); if(bar) bar.scrollIntoView({block:"end"}); window.scrollTo(0,0); setTimeout(checkCbar,200); };
fitApp();
/* aggiornamento dell'app: svuota la cache e ricarica (dati e chiavi restano) */
async function doUpdate(){
  document.querySelectorAll("#updBtn,#btnUpd").forEach(b=>{ b.classList.add("spin"); b.disabled=true; });
  try{ saveMusicPos(true); }catch(e){}
  try{ const rs=await navigator.serviceWorker?.getRegistrations?.()||[]; await Promise.all(rs.map(r=>r.unregister())); }catch(e){}
  try{ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); }catch(e){}
  location.replace(location.pathname+"?u="+Date.now());
}
$("#updBtn").onclick=doUpdate; $("#btnUpd").onclick=doUpdate;
/* barra in alto a scomparsa durante l'allenamento: una linguetta sottile la fa riapparire */
let topTimer=null;
function setTop(show,auto){
  document.body.classList.toggle("tophid",!!st.cur && !show);
  clearTimeout(topTimer); if(show && st.cur && auto) topTimer=setTimeout(()=>setTop(false),6000);
}
$("#topGrip").onclick=()=>{ st.ui.topShown=false; save(); setTop(true,true); };
$("#btnTopHide").onclick=()=>{ st.ui.topShown=false; save(); setTop(false); };
document.querySelector("header.top").addEventListener("click",ev=>{ if(document.body.classList.contains("tophid")) return; if(ev.target.closest("button")&&ev.target.id!=="btnTopHide") clearTimeout(topTimer); });
function render(){
  setTop(!st.cur || !!st.ui.topShown);
  if(st.cur){
    $("#home").hidden=true; $("#workout").hidden=false;
    drawTop(); drawVideo(); drawExbar(); drawChat(); drawChips(); drawMusic();
    const tm=st.cur.timer;
    if(tm && tm.end>Date.now()-3*3600e3 && !(tm.hold && tm.end<Date.now())){ tEnd=tm.end; tTot=tm.tot; tOpts={label:tm.label,sideAt:tm.sideAt,hold:tm.hold}; beeped=tEnd<Date.now(); sideBeeped=!!tm.sideAt && (tEnd-Date.now())/1000<=tm.sideAt; $(".t-lab").textContent=tm.label||"Recupero"; $("#timer").hidden=false; clearInterval(tInt); tick(); tInt=setInterval(tick,250); }
    keepAwake();
  } else { $("#workout").hidden=true; $("#home").hidden=false; stopTimer(); drawTop(); drawHome(); }
}

/* ---------------- split preimpostate (con gli esercizi delle tue schede) ---------------- */
const PRESETS = [
 {k:"mine", n:"PPL + Upper/Lower (il tuo programma)", d:"5 sedute su 7 giorni", p:()=>clone(BASE_PROGRAM)},
 {k:"fbab", n:"Full Body A/B (la tua scheda precedente)", d:"2–3 sedute a settimana, alternando A e B", p:()=>({sessions:{
   "FULL BODY A":[["leg_press",2,9,12,180],["bb_bench",2,6,10,180],["lat_pd",2,8,12,150],["db_rdl",2,8,12,180],["lat_raise",2,12,20,90],["cable_crunch",2,10,15,90]],
   "FULL BODY B":[["smith_sq",2,8,12,180],["db_incl",2,8,12,150],["cs_row",2,8,12,150],["leg_curl",2,10,15,120],["db_ohp",2,8,12,150],["db_curl",2,10,15,90],["rope_pd",2,10,15,90]]},
   cycle:["FULL BODY A","REST","FULL BODY B","REST"]})},
 {k:"fbabc", n:"Full Body A / B / C", d:"3 sedute a settimana", p:()=>({sessions:{
   "FULL BODY A":[["leg_press",2,9,12,180],["bb_bench",2,6,10,180],["lat_pd",2,8,12,150],["db_rdl",2,8,12,180],["lat_raise",2,12,20,90],["cable_crunch",2,10,15,90]],
   "FULL BODY B":[["smith_sq",2,8,12,180],["db_incl",2,8,12,150],["cs_row",2,8,12,150],["leg_curl",2,10,15,120],["db_ohp",2,8,12,150],["db_curl",2,10,15,90],["rope_pd",2,10,15,90]],
   "FULL BODY C":[["hack_sq",2,9,12,180],["db_flat",2,6,10,180],["cable_row",2,8,12,150],["back_ext",2,10,15,120],["rev_pec",2,12,20,90],["hammer",2,10,15,90],["oh_ext",2,10,15,90]]},
   cycle:["FULL BODY A","REST","FULL BODY B","REST","FULL BODY C","REST","REST"]})},
 {k:"ulfb", n:"Upper / Lower / Full Body", d:"3 sedute a settimana", p:()=>({sessions:{
   "UPPER":clone(BASE_PROGRAM.sessions.UPPER||[]),
   "LOWER":clone(BASE_PROGRAM.sessions.LOWER||[]),
   "FULL BODY":[["hack_sq",2,9,12,180],["db_flat",2,6,10,180],["cable_row",2,8,12,150],["db_ohp",2,8,12,150],["leg_curl",2,10,15,120],["hammer",2,10,15,90]]},
   cycle:["UPPER","REST","LOWER","REST","FULL BODY","REST","REST"]})},
 {k:"pplfb", n:"Push / Pull / Legs / Full Body", d:"4 sedute a settimana", p:()=>({sessions:{
   "PUSH":clone(BASE_PROGRAM.sessions.PUSH||[]),"PULL":clone(BASE_PROGRAM.sessions.PULL||[]),"LEGS":clone(BASE_PROGRAM.sessions.LEGS||[]),
   "FULL BODY":[["hack_sq",2,9,12,180],["bb_bench",2,6,10,180],["cable_row",2,8,12,150],["back_ext",2,10,15,120],["rev_pec",2,12,20,90],["cable_crunch",2,10,15,90]]},
   cycle:["PUSH","PULL","REST","LEGS","FULL BODY","REST","REST"]})},
 {k:"ul4", n:"Upper / Lower (4 giorni)", d:"4 sedute a settimana, due versioni A e B", p:()=>({sessions:{
   "UPPER A":clone(BASE_PROGRAM.sessions.UPPER||[]),
   "LOWER A":clone(BASE_PROGRAM.sessions.LOWER||[]),
   "UPPER B":[["db_flat",2,6,10,180],["cable_row",2,8,12,150],["db_ohp",2,8,12,150],["sa_pd",2,10,15,90],["lat_raise",2,12,20,90],["hammer",2,10,15,90],["oh_ext",2,10,15,90]],
   "LOWER B":[["smith_sq",2,8,12,180],["back_ext",2,10,15,120],["lunge_db",2,8,12,150],["seat_curl",2,10,15,120],["calf",2,10,20,90],["cable_crunch",2,10,15,90]]},
   cycle:["UPPER A","LOWER A","REST","UPPER B","LOWER B","REST","REST"]})},
 {k:"ppl6", n:"Push / Pull / Legs × 2 (6 giorni)", d:"6 sedute a settimana", p:()=>({sessions:{
   "PUSH":clone(BASE_PROGRAM.sessions.PUSH||[]),"PULL":clone(BASE_PROGRAM.sessions.PULL||[]),"LEGS":clone(BASE_PROGRAM.sessions.LEGS||[])},
   cycle:["PUSH","PULL","LEGS","PUSH","PULL","LEGS","REST"]})},
];
function presetHtml(){
  return `<div class="card"><h3>Split pronte</h3><p class="muted" style="margin:0 0 8px">Scegline una come punto di partenza: la carico qui sotto e poi puoi modificarla prima di salvare. Usano gli esercizi delle tue schede.</p>
    ${PRESETS.map(x=>{ const pp=x.p(); return `<div class="pset"><div><b>${esc(x.n)}</b><span class="muted">${esc(x.d)} · ${Object.keys(pp.sessions).map(esc).join(" · ")}</span></div><button type="button" class="mini" data-preset="${x.k}">Usa</button></div>`; }).join("")}</div>`;
}

/* ---------------- editor del programma ---------------- */
let pw=null, pwPick=null;
const clone=o=>JSON.parse(JSON.stringify(o));
function openProgram(){
  if(st.cur) return openSheet("Programma",`<p>Chiudi prima la sessione in corso (🏁 Fine sessione): poi puoi modificare il programma.</p>`);
  pw=clone(st.program||BASE_PROGRAM); pwPick=null; drawProgram();
}
function exGroup(id){ return MUSCLE[id]||(EX[id]&&EX[id].mg)||(EX[id]&&EX[id].like&&MUSCLE[EX[id].like])||"Altri"; }
function drawProgram(keepScroll){
  const sc=$("#sheetBody").scrollTop;
  if(pwPick) return drawPicker();
  const names=Object.keys(pw.sessions);
  const row=(n,x,k)=>{ const e=EX[x[0]]; return `<div class="pr"><div class="pn">${esc(e?e.n:x[0])}<span class="muted"> · ${esc(exGroup(x[0]))}</span></div>
    <div class="pf">${e&&e.kind==="time"?`<label>Giri<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|1" value="${x[1]}"></label><label>Secondi<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|2" value="${x[2]}"></label>`:`<label>Serie<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|1" value="${x[1]}"></label><label>Rip min<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|2" value="${x[2]}"></label><label>Rip max<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|3" value="${x[3]}"></label>`}<label>Rec. s<input class="inp" inputmode="numeric" data-f="${esc(n)}|${k}|4" value="${x[4]}"></label>
    <span class="pb"><button type="button" class="mini" data-mv="${esc(n)}|${k}|-1" aria-label="Sposta su">↑</button><button type="button" class="mini" data-mv="${esc(n)}|${k}|1" aria-label="Sposta giù">↓</button><button type="button" class="mini" data-rm="${esc(n)}|${k}" aria-label="Togli">✕</button></span></div></div>`; };
  openSheet("Il tuo programma",`
    <p class="muted" style="margin:0 0 10px">Il programma resta salvato su questo telefono (e nel backup, se attivo). ${st.program?"Stai modificando il tuo programma personalizzato.":"Parti dal programma di base: le modifiche valgono solo per te."}</p>
    ${presetHtml()}
    <div class="card"><h3>Divisione della settimana</h3><p class="muted" style="margin:0 0 8px">L'ordine con cui si ripetono le sedute. REST = giorno di riposo.</p>
      <div class="pcyc">${pw.cycle.map((c,k)=>`<span class="pc ${c==="REST"?"rest":""}"><b>${k+1}.</b> ${esc(c)}<button type="button" data-cm="${k}|-1" aria-label="Prima">‹</button><button type="button" data-cm="${k}|1" aria-label="Dopo">›</button><button type="button" data-cx="${k}" aria-label="Togli">✕</button></span>`).join("")}</div>
      <div class="row" style="margin-top:8px"><select class="inp" id="pcAdd">${[...names,"REST"].map(n=>`<option>${esc(n)}</option>`).join("")}</select><button type="button" class="btn" id="pcAddB">+ Aggiungi</button></div></div>
    ${names.map(n=>`<div class="card ps"><div class="ps-h"><input class="inp ps-n" data-rn="${esc(n)}" value="${esc(n)}" aria-label="Nome della seduta"><button type="button" class="mini" data-sdel="${esc(n)}">🗑 Elimina</button></div>
      ${pw.sessions[n].map((x,k)=>row(n,x,k)).join("")||`<p class="muted">Nessun esercizio.</p>`}
      <button type="button" class="btn wide" data-addex="${esc(n)}">+ Aggiungi esercizio</button></div>`).join("")}
    <button type="button" class="btn wide" id="pNewS">+ Nuova seduta</button>
    <p class="muted" id="pMsg" style="min-height:1.2em"></p>
    <div class="row"><button type="button" class="btn acc" id="pSave">Salva programma</button><button type="button" class="btn" id="pCancel">Annulla</button></div>
    <button type="button" class="btn wide ghost" id="pReset" style="margin-top:10px">↺ Torna al programma di base</button>`);
  const B=$("#sheetBody"); if(keepScroll) B.scrollTop=sc;
  const num=(v,d)=>{ const n=parseInt(v,10); return isNaN(n)?d:n; };
  B.querySelectorAll("[data-f]").forEach(i=>i.onchange=()=>{ const [n,k,f]=i.dataset.f.split("|"), x=pw.sessions[n][+k];
    x[+f]=Math.max(f==="4"?0:1,num(i.value,x[+f])); if(x[3]!=null){ if(f==="2"&&x[2]>x[3]) x[3]=x[2]; if(f==="3"&&x[3]<x[2]) x[2]=x[3]; } drawProgram(true); });
  B.querySelectorAll("[data-mv]").forEach(b=>b.onclick=()=>{ const [n,k,d]=b.dataset.mv.split("|"), a=pw.sessions[n], i=+k, j=i+(+d); if(j<0||j>=a.length) return; [a[i],a[j]]=[a[j],a[i]]; drawProgram(true); });
  B.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ const [n,k]=b.dataset.rm.split("|"); pw.sessions[n].splice(+k,1); drawProgram(true); });
  B.querySelectorAll("[data-cm]").forEach(b=>b.onclick=()=>{ const [k,d]=b.dataset.cm.split("|"), a=pw.cycle, i=+k, j=i+(+d); if(j<0||j>=a.length) return; [a[i],a[j]]=[a[j],a[i]]; drawProgram(true); });
  B.querySelectorAll("[data-cx]").forEach(b=>b.onclick=()=>{ pw.cycle.splice(+b.dataset.cx,1); drawProgram(true); });
  $("#pcAddB").onclick=()=>{ pw.cycle.push($("#pcAdd").value); drawProgram(true); };
  B.querySelectorAll("[data-rn]").forEach(i=>i.onchange=()=>{ const old=i.dataset.rn, nu=i.value.trim().toUpperCase().slice(0,24);
    if(!nu||nu===old) return drawProgram(true);
    if(nu==="REST"||pw.sessions[nu]||EXTRA_SESSIONS.includes(nu)){ $("#pMsg").textContent=`Il nome «${nu}» è già usato.`; i.value=old; return; }
    pw.sessions=Object.fromEntries(Object.entries(pw.sessions).map(([k,v])=>[k===old?nu:k,v])); pw.cycle=pw.cycle.map(c=>c===old?nu:c); drawProgram(true); });
  B.querySelectorAll("[data-sdel]").forEach(b=>b.onclick=()=>{ const n=b.dataset.sdel;
    if(!b.dataset.armed){ b.dataset.armed=1; b.textContent="Tocca ancora per eliminare"; return; }
    delete pw.sessions[n]; pw.cycle=pw.cycle.filter(c=>c!==n); drawProgram(true); });
  B.querySelectorAll("[data-addex]").forEach(b=>b.onclick=()=>{ pwPick={sess:b.dataset.addex,g:null,q:""}; drawProgram(); });
  B.querySelectorAll("[data-preset]").forEach(b=>b.onclick=()=>{ const x=PRESETS.find(y=>y.k===b.dataset.preset); pw=x.p(); drawProgram(); $("#pMsg").textContent=`Caricata «${x.n}». Controlla e tocca Salva programma.`; setTimeout(()=>{ const m=$("#pMsg"); if(m) m.scrollIntoView({block:"center"}); },50); });
  $("#pNewS").onclick=()=>{ let k=1; while(pw.sessions["SEDUTA "+k]) k++; const n="SEDUTA "+k; pw.sessions[n]=[]; pw.cycle.push(n); drawProgram(true); setTimeout(()=>{ const i=B.querySelector(`[data-rn="${n}"]`); if(i){ i.scrollIntoView({block:"center"}); i.select(); } },50); };
  $("#pCancel").onclick=()=>{ pw=null; closeSheet(); };
  $("#pReset").onclick=e=>{ const b=e.target; if(!b.dataset.armed){ b.dataset.armed=1; b.textContent="Tocca ancora: torni al programma di base"; return; }
    st.program=null; applyProgram(null); recomputeCycle(); save(); syncNow(); pw=null; closeSheet(); render(); };
  $("#pSave").onclick=()=>{
    const empty=Object.keys(pw.sessions).filter(n=>!pw.sessions[n].length);
    if(!Object.keys(pw.sessions).length) return $("#pMsg").textContent="Serve almeno una seduta.";
    if(empty.length) return $("#pMsg").textContent=`Aggiungi almeno un esercizio a: ${empty.join(", ")} (oppure eliminala).`;
    if(!pw.cycle.some(c=>c!=="REST")) return $("#pMsg").textContent="Metti almeno una seduta nella divisione della settimana.";
    const same=JSON.stringify(pw)===JSON.stringify(BASE_PROGRAM);
    st.program=same?null:clone(pw); applyProgram(st.program); recomputeCycle(); save(); syncNow(); pw=null; closeSheet(); render();
  };
}
function drawPicker(){
  const pk=pwPick, ids=Object.keys(EX).filter(id=>EX[id].kind!=="time"||MUSCLE[id]);
  const groups=[...MUSCLE_ORDER, ...new Set(ids.map(exGroup).filter(g=>!MUSCLE_ORDER.includes(g)))];
  const q=pk.q.toLowerCase();
  const list=ids.filter(id=>(!pk.g||exGroup(id)===pk.g)&&(!q||EX[id].n.toLowerCase().includes(q))).sort((a,b)=>groups.indexOf(exGroup(a))-groups.indexOf(exGroup(b))||EX[a].n.localeCompare(EX[b].n));
  openSheet(`Aggiungi a ${pk.sess}`,`
    <input class="inp" id="pkQ" placeholder="Cerca esercizio…" value="${esc(pk.q)}" autocomplete="off">
    <div class="m-recent" style="margin:8px 0">${["Tutti",...groups].map(g=>`<button type="button" class="vchip ${(pk.g||"Tutti")===g?"on":""}" data-g="${esc(g)}">${esc(g)}</button>`).join("")}</div>
    <div class="pk">${list.map(id=>`<button type="button" class="pk-it" data-id="${id}"><b>${esc(EX[id].n)}</b><span class="muted">${esc(exGroup(id))} · ${EQ_LABEL[EX[id].eq]||"macchina"}${EX[id].v&&EX[id].v.length?" · 🎬 "+EX[id].v.length+" video":""}</span></button>`).join("")||`<p class="muted">Nessun esercizio trovato.</p>`}</div>
    <div class="card"><h3>Non c'è? Crealo</h3>
      <input class="inp" id="pkNew" placeholder="Nome (es. Pullover ai cavi)" value="${esc(pk.q)}" autocomplete="off">
      <div class="row" style="margin-top:6px"><select class="inp" id="pkG">${MUSCLE_ORDER.map(g=>`<option ${g===pk.g?"selected":""}>${g}</option>`).join("")}</select>
      <select class="inp" id="pkE">${Object.entries(EQ_LABEL).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></div>
      <input class="inp" id="pkVid" placeholder="Link video YouTube (facoltativo)" inputmode="url" autocomplete="off" style="margin-top:6px">
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent((pk.q||"esercizio")+" tecnica esecuzione")}" target="_blank" rel="noopener" class="muted" style="font-size:12.5px">🔎 Cerca il video su YouTube ↗</a>
      <button type="button" class="btn acc wide" id="pkMake" style="margin-top:6px">Crea e aggiungi</button></div>
    <button type="button" class="btn wide" id="pkBack">← Torna al programma</button>`);
  const B=$("#sheetBody");
  const add=id=>{ const sl=slotOf(id), tm=EX[id].kind==="time"; pw.sessions[pk.sess].push(tm?[id,2,EX[id].sec||45,null,60]:[id,2,sl[2]||8,sl[3]||12,sl[4]||120]); pwPick=null; drawProgram(); setTimeout(()=>{ const c=[...B.querySelectorAll(".ps")].find(x=>x.querySelector(`[data-rn="${pk.sess}"]`)); if(c) c.scrollIntoView({block:"end"}); },50); };
  const qi=$("#pkQ"); qi.oninput=()=>{ pk.q=qi.value; const pos=qi.selectionStart; drawPicker(); const n=$("#pkQ"); n.focus(); n.setSelectionRange(pos,pos); };
  B.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>{ pk.g=b.dataset.g==="Tutti"?null:b.dataset.g; drawPicker(); });
  B.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>add(b.dataset.id));
  $("#pkMake").onclick=()=>{ const n=$("#pkNew").value.trim(); if(!n) return $("#pkNew").focus();
    const id=findOrCreateEx(n); const e=EX[id]; if(st.custom[id]){ st.custom[id].mg=$("#pkG").value; st.custom[id].eq=$("#pkE").value; e.mg=st.custom[id].mg; e.eq=st.custom[id].eq; e.s=e.mg; MUSCLE[id]=e.mg; save(); }
    const lv=$("#pkVid").value.trim(); if(lv) addMyVid(id,lv);
    add(id); };
  $("#pkBack").onclick=()=>{ pwPick=null; drawProgram(); };
}

/* ---------------- home e ciclo ---------------- */
function nextStep(){ return (st.cyclePos+1)%CYCLE.length; }
function drawHome(){
  const ni=nextStep(), nx=CYCLE[ni];
  const nextSess = nx==="REST" ? CYCLE[(ni+1)%CYCLE.length] : nx;
  const last=st.history[st.history.length-1];
  const cyc=CYCLE.map((c,k)=>`<span class="${k===ni?"next":k<=st.cyclePos?"done":""}">${c}</span>`).join("");
  const cnt=s=>isExtraSess(s)?`${SESSIONS[s].length} esercizi · ~${Math.round(SESSIONS[s].reduce((a,x)=>a+x[1]*(x[2]*(EX[x[0]].sides?2:1)+x[4]),0)/60)} min`:`${SESSIONS[s].length} esercizi · ${SESSIONS[s].reduce((a,x)=>a+x[1],0)} serie`;
  $("#home").innerHTML=`
    <h1>Gym Coach</h1>
    <p class="lead">${last?`Ultima sessione: <b>${last.session}</b> il ${new Date(last.start).toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"})}.`:"Nessuna sessione registrata finora."}</p>
    <div class="cyc">${cyc}</div>
    ${nx==="REST"?`<div class="card" style="margin:0 0 12px"><h3>Prossimo passaggio: riposo</h3><p class="muted" style="margin:0 0 10px">Se hai già riposato, segnalo e passa a ${nextSess}.</p><button class="btn" id="restDone">Riposo fatto ✓</button></div>`:""}
    <button class="big" data-s="${nextSess}">▶ Inizia ${nextSess}<small>${cnt(nextSess)}${nx==="REST"?" · dopo il riposo":""}</small></button>
    <div class="grid">${Object.keys(SESSIONS).filter(s=>s!==nextSess&&!isExtraSess(s)).map(s=>`<button class="sbtn" data-s="${s}"><b>${s}</b><span>${cnt(s)}</span></button>`).join("")}</div>
    <button class="btn wide ghost" id="homeProg" style="margin-top:8px">✏️ ${st.program?"Il tuo programma":"Personalizza il programma"}</button>
    <h3 class="sec">Recupero attivo <span class="muted">· fuori dal ciclo</span></h3>
    <div class="grid">${(typeof EXTRA_SESSIONS!=="undefined"?EXTRA_SESSIONS:[]).map(s=>`<button class="sbtn alt" data-s="${s}"><b>${s}</b><span>${cnt(s)}</span></button>`).join("")}</div>
    <div class="card"><h3>Come funziona</h3><p class="muted" style="margin:0">Durante ogni esercizio vedi i suoi video. A fine serie scrivi o detta, per esempio <i>24 kg 9 rip RIR 2</i>: registro la serie, ti dico se il carico è giusto, alto o basso, e parte il recupero. Puoi anche fare domande sull'esercizio${st.settings.apiKey?"":" (serve la chiave Gemini gratuita in ⚙)"}.</p></div>`;
  $("#home").querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>startSession(b.dataset.s));
  const ep=$("#homeProg"); if(ep) ep.onclick=()=>openProgram();
  const rd=$("#restDone"); if(rd) rd.onclick=()=>{ st.cyclePos=ni; save(); drawHome(); };
}
function startSession(s){
  unlockAudio();
  st.cur={id:uid(),session:s,start:Date.now(),exIdx:0,vid:0,log:{},chat:[],pending:null,timer:null};
  save(); render();
  sys(`Sessione ${s} iniziata alle ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`);
  introExercise(); drawChips();
}
/* conferma a scorrimento: il pulsante diventa una barra da trascinare fino in fondo */
function slideConfirm(btn,label,onDone,danger){
  const w=document.createElement("div"); w.className="slide"+(danger?" danger":"");
  w.innerHTML=`<span class="sl-lab">${label}</span><div class="sl-knob" role="slider" aria-label="${label}">➜</div>`;
  btn.replaceWith(w);
  const k=w.querySelector(".sl-knob"); let x0=0,drag=false,max=0,done=false;
  const set=x=>{ k.style.transform=`translateX(${x}px)`; w.style.setProperty("--p",max?x/max:0); };
  k.addEventListener("pointerdown",e=>{ if(done) return; drag=true; x0=e.clientX; max=w.clientWidth-k.offsetWidth-8; k.setPointerCapture(e.pointerId); w.classList.add("on"); });
  k.addEventListener("pointermove",e=>{ if(!drag) return; set(clamp(e.clientX-x0,0,max)); });
  const end=e=>{ if(!drag) return; drag=false; w.classList.remove("on"); const x=clamp(e.clientX-x0,0,max);
    if(x>=max*0.9){ done=true; set(max); w.classList.add("ok"); w.querySelector(".sl-lab").textContent="✓"; setTimeout(onDone,180); }
    else { k.style.transition="transform .2s"; set(0); setTimeout(()=>k.style.transition="",220); } };
  k.addEventListener("pointerup",end); k.addEventListener("pointercancel",end);
}
function finishSession(){
  if(!st.cur) return;
  const list=curList();
  const ex=list.map((x,k)=>({ex:x[0],...(x[0]!==origId(k)?{al_posto_di:origId(k)}:{}),sets:(st.cur.log[k]||[]).map(cleanSet)})).filter(e=>e.sets.length);
  const total=ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), planned=list.reduce((a,x)=>a+x[1],0);
  if(!ex.length){
    openSheet("Fine sessione",`<p>Non hai registrato nessuna serie, quindi non c'è niente da salvare.</p><p class="muted">Scarta la sessione: non finisce nell'archivio e cancello anche la sua chat dal backup su GitHub.</p><div class="row"><button class="btn danger" id="discard">🗑 Scarta sessione</button><button class="btn" id="keep">Continua</button></div>`);
    $("#discard").onclick=e=>slideConfirm(e.target,"Scorri per scartare →",()=>{ discardSession(); closeSheet(); render(); },true);
    $("#keep").onclick=closeSheet; return;
  }
  openSheet("Fine sessione",`<p>Hai registrato <b>${total}/${planned}</b> ${isExtraSess(st.cur.session)?"giri":"serie allenanti"} in ${ex.length} esercizi.</p><p class="muted">La sessione verrà salvata nell'archivio${isExtraSess(st.cur.session)?" (il ciclo PPL non cambia)":" e il ciclo passerà al passaggio successivo"}.</p><div class="row"><button class="btn acc" id="confirmEnd">Salva e chiudi</button><button class="btn" id="keep">Continua ad allenarmi</button></div>
    <div class="card"><h3>Era solo una prova?</h3><p class="muted" style="margin:0 0 10px">Scarta la sessione: non finisce nell'archivio, i carichi consigliati tornano com'erano e cancello anche la sua chat e i suoi dati dal backup su GitHub.</p><button class="btn danger" id="discardAll">🗑 Scarta sessione</button></div>`);
  $("#keep").onclick=closeSheet;
  $("#discardAll").onclick=e=>slideConfirm(e.target,"Scorri per scartare →",()=>{ discardSession(); closeSheet(); render(); },true);
  $("#confirmEnd").onclick=()=>saveEnd();   // conferma diretta: un tocco salva e chiude
  const saveEnd=()=>{
    st.history.push({id:st.cur.id,session:st.cur.session,start:st.cur.start,end:Date.now(),ex,chat:chatPlain(st.cur.chat)});
    st.history.slice(0,-15).forEach(h=>{ if(h.chat && h.chatSynced) delete h.chat; });   // sul telefono restano le chat delle ultime 15 sessioni
    const pos=CYCLE.indexOf(st.cur.session); if(pos>=0) st.cyclePos=pos;
    st.cur=null; save(); syncNow(); closeSheet(); stopTimer();
    try{ wake && wake.release(); }catch(e){}
    render();
  };
}

/* ---------------- fogli: elenco, archivio, impostazioni ---------------- */
function openSheet(title,html){ $("#sheetTitle").textContent=title; $("#sheetBody").innerHTML=html; $("#sheet").hidden=false; }
function closeSheet(){ $("#sheet").hidden=true; }
$("#sheetClose").onclick=closeSheet;
$("#sheet").onclick=e=>{ if(e.target.id==="sheet") closeSheet(); };

function openList(){
  if(!st.cur){ openSheet("Esercizi","<p class='muted'>Inizia una sessione per vedere l'elenco.</p>"); return; }
  const list=curList();
  openSheet(st.cur.session+" · esercizi", list.map((x,k)=>{ const d=workSets(k).length, full=d>=x[1];
    return `<button class="li ${k===st.cur.exIdx?"cur":""} ${full?"done":""}" data-k="${k}"><span class="i">${full?"✓":k+1}</span><span class="nm">${esc(EX[x[0]].n)}</span><span class="rx">${d}/${x[1]} · ${isTimeIt(x)?holdTxt(x):`${x[2]}–${x[3]}`}${x[0]!==origId(k)?" · 🔁":""}</span></button>`; }).join("")
    +`<button class="btn danger wide" id="endFromList">🏁 Fine sessione</button>`);
  $("#sheetBody").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ closeSheet(); goEx(+b.dataset.k); });
  $("#endFromList").onclick=()=>{ closeSheet(); finishSession(); };
}
$("#btnList").onclick=openList;

function exportJSON(){ return JSON.stringify({app:"gym-coach",version:1,exported:new Date().toISOString(),...(st.program?{program:st.program}:{}),...(Object.keys(st.myVid).length?{myVid:st.myVid}:{}),cyclePos:st.cyclePos,sugg:st.sugg,custom:st.custom,history:st.history},null,1); }
function exportText(){
  return st.history.map(h=>`${h.session} — ${new Date(h.start).toLocaleDateString("it-IT")}\n`+h.ex.map(e=>`  ${EX[e.ex]?EX[e.ex].n:e.ex}: ${e.sets.map(setLine).join(", ")}`).join("\n")).join("\n\n");
}
function openArchive(){
  const hs=[...st.history].reverse();
  const items=hs.length?hs.map(h=>{
    const n=h.ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), dur=Math.round((h.end-h.start)/60000);
    return `<details class="hs"><summary><span><b>${h.session}</b> <span class="muted">${new Date(h.start).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit",year:"2-digit"})}</span></span><span class="muted">${n} ${isExtraSess(h.session)?"giri":"serie"} · ${h.imported?"importata":dur+" min"}</span></summary>
      <div class="det">${h.ex.map(e=>`<div><b>${esc(EX[e.ex]?EX[e.ex].n:e.ex)}</b>${e.al_posto_di?` <span>(al posto di ${esc(EX[e.al_posto_di]?EX[e.al_posto_di].n:e.al_posto_di)})</span>`:""}${e.sets.map(s=>`<br><span class="${s.extra?"xs":""}">${esc(setLine(s))}</span>`).join("")}</div>`).join("")}
      <div class="row">${h.chat&&h.chat.length?`<button class="btn" data-chat="${h.id}">💬 Vedi chat</button>`:""}<button class="btn danger" data-del="${h.id}">Elimina sessione</button></div></div></details>`;
  }).join(""):`<p class="muted">Ancora nessuna sessione archiviata.</p>`;
  openSheet("Archivio",`${items}
    <div class="card"><h3>Backup</h3><p class="muted" style="margin:0 0 10px">${st.settings.ghToken?`Backup automatico su GitHub attivo (${esc(st.settings.ghRepo)}): serie, master per esercizio e chat di ogni sessione. ${esc(syncStatus())}`:"I dati sono salvati solo su questo telefono: attiva il backup automatico in ⚙ oppure esporta ogni tanto un file."}</p>
    <div class="row"><button class="btn" id="exFile">⬇ Esporta file</button><button class="btn" id="exCopy">📋 Copia testo</button><label class="btn" style="display:inline-block">⬆ Importa file<input type="file" id="imFile" accept="application/json,.json" hidden></label></div><p class="muted" id="exMsg"></p></div>`);
  $("#sheetBody").querySelectorAll("[data-chat]").forEach(b=>b.onclick=()=>openChat(b.dataset.chat));
  $("#sheetBody").querySelectorAll("[data-del]").forEach(b=>b.onclick=e=>slideConfirm(e.currentTarget,"Scorri per eliminare →",()=>{ deleteSession(b.dataset.del); openArchive(); },true));
  $("#exFile").onclick=()=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([exportJSON()],{type:"application/json"})); a.download=`gym-coach-${new Date().toISOString().slice(0,10)}.json`; a.click(); };
  $("#exCopy").onclick=async()=>{ try{ await navigator.clipboard.writeText(exportText()||"Nessuna sessione."); $("#exMsg").textContent="Copiato negli appunti."; }catch(e){ $("#exMsg").textContent="Copia non riuscita su questo browser."; } };
  $("#imFile").onchange=async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ const j=JSON.parse(await f.text()); if(!Array.isArray(j.history)) throw 0;
      const ids=new Set(st.history.map(h=>h.id)); let added=0;
      j.history.forEach(h=>{ if(!ids.has(h.id)){ st.history.push(h); added++; } });
      st.history.sort((a,b)=>a.start-b.start);
      mergeSugg(j.sugg);
      mergeCustom(j.custom); mergeNotes(j.exNotes);
      if(j.program && !st.program && !st.cur){ st.program=j.program; applyProgram(st.program); }
      if(j.myVid) Object.entries(j.myVid).forEach(([k,v])=>{ if(!st.myVid[k]){ st.myVid[k]=v; applyMyVid(k); } });
      const last=st.history[st.history.length-1];
      if(added && last && last.imported && j.history.some(h=>h.id===last.id)) recomputeCycle();
      else if(typeof j.cyclePos==="number" && st.cyclePos<0) st.cyclePos=j.cyclePos;
      save(); syncNow(); if(!st.cur) drawHome(); openArchive(); $("#exMsg").textContent=`Importate ${added} sessioni.`;
    }catch(err){ $("#exMsg").textContent="File non valido."; }
  };
}
$("#btnArchive").onclick=openArchive;

function openSettings(){
  const s=st.settings;
  openSheet("Impostazioni",`
    <label class="f" for="sProv">Coach AI per le domande libere</label>
    <select class="inp" id="sProv"><option value="gemini" ${s.provider!=="openrouter"?"selected":""}>Gemini (Google) — consigliato</option><option value="openrouter" ${s.provider==="openrouter"?"selected":""}>Kimi o altri modelli (OpenRouter)</option></select>
    <p class="muted">Se il primo non risponde, l'app prova da sola l'altro (se hai inserito anche quella chiave).</p>
    <label class="f" for="sThink">Risposte del coach Gemini</label>
    <select class="inp" id="sThink"><option value="minimal" ${s.think==="minimal"?"selected":""}>Lampo (ragionamento minimo, le più rapide)</option><option value="low" ${!["minimal","medium"].includes(s.think)?"selected":""}>Veloci (consigliato in palestra)</option><option value="medium" ${s.think==="medium"?"selected":""}>Più ragionate (più lente)</option></select>
    <label class="f" for="sAll">Come leggo i tuoi messaggi</label>
    <select class="inp" id="sAll"><option value="0" ${!s.allAI?"selected":""}>Riconoscimento automatico per le serie (istantaneo)</option><option value="1" ${s.allAI?"selected":""}>Tutto a Gemini, come una chat normale</option></select>
    <p class="muted">Con «Tutto a Gemini» anche le serie passano dall'AI (1–3 s in più ciascuna). Senza rete, o se l'AI non risponde, uso il riconoscimento automatico. «Annulla», «salta», «chiudi» restano sempre immediati.</p>
    <label class="f" for="sKey">Chiave API Gemini (gratuita)</label>
    <input class="inp" id="sKey" type="password" value="${esc(s.apiKey)}" placeholder="Incolla qui la chiave" autocomplete="off">
    <p class="muted">Creala gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Resta salvata solo su questo telefono. Senza chiave l'app funziona lo stesso: registra le serie e dà i consigli sul carico.</p>
    <label class="f" for="sModel">Modello Gemini</label>
    <input class="inp" id="sModel" value="${esc(s.model)}">
    <div class="row" style="margin-top:8px"><button class="btn" id="sTest">Prova la chiave</button><span class="muted" id="sTestMsg"></span></div>
    <label class="f" for="sOrKey">Chiave OpenRouter (facoltativa, per Kimi)</label>
    <input class="inp" id="sOrKey" type="password" value="${esc(s.orKey)}" placeholder="sk-or-…" autocomplete="off">
    <p class="muted">Creala su <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>. I modelli che finiscono con <b>:free</b> sono gratuiti: 50 domande al giorno, oppure 1.000 al giorno dopo una ricarica una tantum di 10 $.</p>
    <label class="f" for="sOrModel">Modello OpenRouter</label>
    <input class="inp" id="sOrModel" value="${esc(s.orModel)}">
    <div class="row" style="margin-top:8px"><button class="btn" id="sOrTest">Prova OpenRouter</button><span class="muted" id="sOrMsg"></span></div>
    <label class="f" for="sUnit">Unità predefinita (se non la scrivi e non c'è storico)</label>
    <select class="inp" id="sUnit"><option value="kg" ${s.defUnit!=="lb"?"selected":""}>Chili (kg)</option><option value="lb" ${s.defUnit==="lb"?"selected":""}>Libbre (lb)</option></select>
    <label class="f">Incremento minimo di carico — il salto più piccolo disponibile in palestra</label>
    <div class="inc inc3"><span></span><b class="muted">kg</b><b class="muted">lb</b>${Object.entries(EQ_LABEL).map(([k,l])=>`<span>${l[0].toUpperCase()+l.slice(1)} <span class="muted">(${LOAD_MODE[k]})</span></span><input class="inp" inputmode="decimal" data-inc="${k}" value="${kgTxt(s.inc[k])}"><input class="inp" inputmode="decimal" data-inclb="${k}" value="${kgTxt(s.incLb[k])}">`).join("")}</div>
    <label class="f">Peso medio della barra — per confrontare bilanciere e manubri nei Progressi</label>
    <div class="inc"><span>Bilanciere (kg)</span><input class="inp" id="sBar" inputmode="decimal" value="${kgTxt(s.barKg??18)}"><span>Barra Smith (kg)</span><input class="inp" id="sSmith" inputmode="decimal" value="${kgTxt(s.smithKg??15)}"></div>
    <button class="btn acc wide" id="sSave">Salva</button>
    <div class="card"><h3>Programma di allenamento</h3><p class="muted" style="margin:0 0 8px">${st.program?"Stai usando un programma <b>personalizzato</b>.":"Stai usando il programma di base."} Puoi cambiare esercizi, serie, ripetizioni, recuperi e la divisione della settimana.</p><button class="btn wide" id="sProg">✏️ Modifica programma</button></div>
    <div class="card"><h3>Ciclo</h3><p class="muted" style="margin:0 0 8px">Ultimo passaggio completato: <b>${st.cyclePos>=0?CYCLE[st.cyclePos]:"nessuno"}</b>. Correggilo se serve:</p>
      <select class="inp" id="sCycle"><option value="-1">Nessuno (si riparte da ${CYCLE[0]})</option>${CYCLE.map((c,k)=>`<option value="${k}" ${k===st.cyclePos?"selected":""}>${k+1}. ${c}</option>`).join("")}</select></div>
    <div class="card"><h3>Backup automatico su GitHub</h3>
      <p class="muted" style="margin:0 0 6px">A fine di ogni esercizio aggiorno <b>master.json</b> e <b>master.md</b> (dati organizzati per esercizio) nel tuo repository privato.</p>
      <label class="f" for="sGhRepo">Repository (utente/nome)</label>
      <input class="inp" id="sGhRepo" value="${esc(s.ghRepo)}" autocomplete="off">
      <label class="f" for="sGhTok">Token GitHub (Contents: read and write)</label>
      <input class="inp" id="sGhTok" type="password" value="${esc(s.ghToken)}" placeholder="github_pat_…" autocomplete="off">
      <div class="row" style="margin-top:10px"><button class="btn" id="sGhNow">☁ Backup ora</button><button class="btn" id="sGhRestore">⬇ Ripristina da GitHub</button></div>
      <p class="muted" id="sGhMsg">${syncStatus()}</p></div>
    <div class="card"><h3>Aggiornamenti</h3><p class="muted" style="margin:0 0 10px">Versione dell'app: <b>${APP_VERSION}</b>. Se non vedi le ultime novità, tocca qui: i tuoi dati e le chiavi restano salvati.</p><button class="btn" id="sUpdate">⟳ Aggiorna l'app</button></div>
    <details class="adv"><summary>Opzioni avanzate</summary>
      <div class="card"><h3>Azzera l'app su questo telefono</h3><p class="muted" style="margin:0 0 10px">Cancella archivio, impostazioni, chiavi e token da questo telefono. Il backup su GitHub non viene toccato. Per confermare scrivi <b>CANCELLA</b>.</p>
      <div class="m-form"><input class="inp" id="sWipeTxt" placeholder="CANCELLA" autocomplete="off" autocapitalize="characters"><button class="btn danger" id="sWipe" disabled>Azzera</button></div></div>
    </details>`);
  const collect=()=>{ s.ghToken=$("#sGhTok").value.trim(); s.ghRepo=$("#sGhRepo").value.trim().replace(/^https?:\/\/github.com\//,"").replace(/\/$/,""); s.apiKey=$("#sKey").value.replace(/[\s"'`]/g,""); s.model=$("#sModel").value.trim()||"gemini-3.8-flash"; s.provider=$("#sProv").value; s.think=$("#sThink").value; s.allAI=$("#sAll").value==="1"; s.orKey=$("#sOrKey").value.replace(/[\s"'`]/g,""); s.orModel=$("#sOrModel").value.trim()||"moonshotai/kimi-k2.6:free";
    document.querySelectorAll("[data-inc]").forEach(i=>{ const v=parseFloat(i.value.replace(",",".")); if(v>0) s.inc[i.dataset.inc]=v; });
    document.querySelectorAll("[data-inclb]").forEach(i=>{ const v=parseFloat(i.value.replace(",",".")); if(v>0) s.incLb[i.dataset.inclb]=v; });
    s.defUnit=$("#sUnit").value;
    { const b=parseFloat($("#sBar").value.replace(",",".")), m=parseFloat($("#sSmith").value.replace(",",".")); if(b>=0) s.barKg=b; if(m>=0) s.smithKg=m; }
    st.cyclePos=+$("#sCycle").value; save(); };
  $("#sSave").onclick=()=>{ collect(); closeSheet(); render(); if(st.settings.ghToken) syncNow(); };
  $("#sProg").onclick=()=>{ collect(); openProgram(); };
  $("#sGhNow").onclick=async()=>{ collect(); $("#sGhMsg").textContent="Backup in corso…"; await syncNow(); $("#sGhMsg").textContent=syncStatus(); };
  $("#sGhRestore").onclick=async()=>{ collect(); $("#sGhMsg").textContent="Scarico master.json…"; $("#sGhMsg").textContent=await restoreFromGitHub(); };
  $("#sTest").onclick=async()=>{ collect(); $("#sTestMsg").textContent="Provo…";
    const k=s.apiKey;
    if(k.length<20){ $("#sTestMsg").textContent=`La chiave sembra incompleta (${k.length} caratteri): copiala di nuovo da AI Studio con il pulsante di copia.`; return; }
    let msg="", only404=true;
    for(const model of [...new Set([s.model,"gemini-3.8-flash","gemini-flash-latest","gemini-2.5-flash"])]){
      try{ const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":k},body:JSON.stringify({contents:[{role:"user",parts:[{text:"Rispondi solo: ok"}]}]})});
        if(r.ok){ if(model!==s.model && only404){ s.model=model; $("#sModel").value=model; save(); } $("#sTestMsg").textContent=`✓ La chiave funziona (${model}${only404?"":`; ${s.model} era sovraccarico, l'app lo riproverà`})`; return; }
        const j=await r.json().catch(()=>({})); msg=`Errore ${r.status}: ${(j.error&&j.error.message)||"risposta non valida"}`;
        if(r.status>=500) msg=`La chiave è valida ✓ ma i server di Google sono sovraccarichi in questo momento (errore ${r.status}). Riprova tra qualche minuto: durante l'allenamento l'app ritenta da sola.`;
        if(r.status>=500) only404=false;
        if(r.status!==404 && r.status<500) break;
      }catch(e){ msg="Nessuna connessione"; break; }
    }
    $("#sTestMsg").textContent=msg;
  };
  $("#sUpdate").onclick=()=>{ collect(); $("#sUpdate").textContent="Aggiorno…"; doUpdate(); };
  $("#sOrTest").onclick=async()=>{ collect(); $("#sOrMsg").textContent="Provo…"; const r=await callOpenRouter("Rispondi in JSON {\"ok\":true}","test"); $("#sOrMsg").textContent=r.out?`✓ Funziona (${r.by})`:r.err; };
  $("#sWipeTxt").oninput=e=>{ $("#sWipe").disabled = e.target.value.trim().toUpperCase()!=="CANCELLA"; };
  $("#sWipe").onclick=()=>{ if($("#sWipeTxt").value.trim().toUpperCase()!=="CANCELLA") return; localStorage.removeItem(LS); st=defState(); closeSheet(); render(); };
}
$("#btnSettings").onclick=openSettings;

/* ---------------- foto di un macchinario ---------------- */
async function shrinkImage(file,max=1024){
  const url=URL.createObjectURL(file);
  try{
    const im=await new Promise((ok,ko)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=ko; i.src=url; });
    const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)), c=document.createElement("canvas");
    c.width=Math.round(im.naturalWidth*k); c.height=Math.round(im.naturalHeight*k);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height);
    const dataUrl=c.toDataURL("image/jpeg",0.8);
    return {mime:"image/jpeg",data:dataUrl.split(",")[1],dataUrl};
  } finally { URL.revokeObjectURL(url); }
}
$("#btnPhoto").onclick=()=>{
  if(!st.cur) return;
  if(!aiReady()){ bot("Per riconoscere i macchinari dalle foto serve la chiave Gemini (gratuita) in ⚙ Impostazioni."); return; }
  unlockAudio(); $("#photoIn").value=""; $("#photoIn").click();
};
$("#photoIn").onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  let img; try{ img=await shrinkImage(f); }catch(err){ bot("Non riesco a leggere questa foto: prova a scattarne un'altra."); return; }
  const q=$("#msg").value.trim() || `Questo macchinario va bene per ${EX[item()[0]].n}? Come lo regolo e come leggo il carico?`;
  $("#msg").value="";
  addMsg("user","📷 "+q);
  const d=document.createElement("div"); d.className="msg user photo"; d.innerHTML=`<img src="${img.dataUrl}" alt="Foto inviata">`; $("#chat").appendChild(d); $("#chat").scrollTop=1e9;
  askAI(q,{mime:img.mime,data:img.data});
};

/* ---------------- composer e dettatura ---------------- */
$("#msg").addEventListener("focus",()=>document.body.classList.add("kbd"));
$("#msg").addEventListener("blur",()=>setTimeout(()=>document.body.classList.remove("kbd"),150));
/* barra di scrittura a scomparsa: si apre col tasto ⌨ accanto ai comandi */
function setComposer(open){ st.ui.composer=!!open; save(); $("#composer").hidden=!open; $("#btnKbd").classList.toggle("on",!!open); $("#btnKbd").textContent=open?"✕":"⌨"; }
$("#btnKbd").onclick=()=>setComposer(!st.ui.composer);
function setPickW(on){ pickW=!!on; const b=$("#btnW"); b.classList.toggle("on",pickW); b.textContent=pickW?"✕":"🏋"; b.setAttribute("aria-label",pickW?"Chiudi i pesi e torna ai comandi":"Registra una serie: carico, ripetizioni, RIR"); }
$("#btnW").onclick=()=>{ if(!st.cur) return; if(st.cur.pending&&st.cur.pending.need){ st.cur.pending=null; save(); } setPickW(!pickW); drawChips(); };
setComposer(!!st.ui.composer);
/* banda verticale tra musica e video: sceglie la larghezza del riquadro musica */
function applyMW(){ const t=$("#mTile"); if(!t) return; if(st.ui.mw && !st.ui.videoHidden){ t.style.width=st.ui.mw+"px"; t.style.maxWidth="none"; } else { t.style.width=""; t.style.maxWidth=""; } }
(function(){
  const hd=$("#mresize"); let x0=0,w0=0,drag=false,raf=0,want=0;
  hd.addEventListener("pointerdown",e=>{ if(st.ui.videoHidden) return; drag=true; x0=e.clientX; w0=$("#mTile").getBoundingClientRect().width; hd.setPointerCapture(e.pointerId); hd.classList.add("on"); document.body.classList.add("resizing"); e.preventDefault(); });
  hd.addEventListener("pointermove",e=>{ if(!drag) return; const maxW=Math.round(document.querySelector(".stage").getBoundingClientRect().width*0.8);
    want=Math.max(56,Math.min(maxW,Math.round(w0+e.clientX-x0))); if(!raf) raf=requestAnimationFrame(()=>{ raf=0; st.ui.mw=want; applyMW(); }); });
  const end=()=>{ if(!drag) return; drag=false; hd.classList.remove("on"); document.body.classList.remove("resizing"); if(want){ st.ui.mw=want; save(); } };
  hd.addEventListener("pointerup",end); hd.addEventListener("pointercancel",end);
  hd.addEventListener("dblclick",()=>{ st.ui.mw=null; save(); applyMW(); });
  applyMW();
})();
/* banda trascinabile sotto i video: sceglie l'altezza dello spazio video */
function applyVH(){ const sg=document.querySelector(".stage"); if(!sg) return; if(st.ui.vh && !st.ui.videoHidden) sg.style.setProperty("--fh",st.ui.vh+"px"); else sg.style.removeProperty("--fh"); }
(function(){
  const hd=$("#vresize"); let y0=0,h0=0,drag=false,raf=0,want=0;
  const maxH=()=>Math.round(innerHeight*0.72), minH=80;
  hd.addEventListener("pointerdown",e=>{ if(st.ui.videoHidden) return; drag=true; y0=e.clientY; h0=document.querySelector(".stage .frame").getBoundingClientRect().height; hd.setPointerCapture(e.pointerId); hd.classList.add("on"); document.body.classList.add("resizing"); e.preventDefault(); });
  hd.addEventListener("pointermove",e=>{ if(!drag) return; want=Math.max(minH,Math.min(maxH(),Math.round(h0+e.clientY-y0)));
    if(!raf) raf=requestAnimationFrame(()=>{ raf=0; st.ui.vh=want; applyVH(); }); });
  const end=()=>{ if(!drag) return; drag=false; hd.classList.remove("on"); document.body.classList.remove("resizing"); if(want){ st.ui.vh=want; save(); } };
  hd.addEventListener("pointerup",end); hd.addEventListener("pointercancel",end);
  hd.addEventListener("dblclick",()=>{ st.ui.vh=null; save(); applyVH(); });
})();
let micStop=null;   // ferma la dettatura in corso (senza inviare) se si preme Invia a mano
$("#composer").onsubmit=e=>{ e.preventDefault(); if(micStop) micStop(); const v=$("#msg").value; $("#msg").value=""; onSend(v); };
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){
  /* Dettatura: resta in ascolto anche nelle pause finché non tocchi di nuovo 🎤 (allora invia).
     Se il browser chiude da solo il riconoscimento dopo un silenzio, lo riapro e continuo il testo. */
  const mic=$("#btnMic"), box=$("#msg"); mic.hidden=false;
  let rec=null, active=false, kept="", finals=[], interim="", started=0, ph="";
  const join=()=>[kept,...finals,interim].map(x=>x.trim()).filter(Boolean).join(" ");
  const show=()=>{ box.value=join(); };
  const finish=send=>{ active=false; micStop=null; mic.classList.remove("on"); box.placeholder=ph;
    const v=send?join():""; kept=""; finals=[]; interim="";
    if(rec){ try{ rec.onend=null; rec.stop(); }catch(e){} rec=null; }
    if(send){ box.value=""; if(v) onSend(v); } };
  const listen=()=>{
    rec=new SR(); rec.lang="it-IT"; rec.interimResults=true; rec.continuous=true; rec.maxAlternatives=1;
    rec.onresult=ev=>{ interim="";
      for(let k=ev.resultIndex;k<ev.results.length;k++){ const r=ev.results[k], t=r[0].transcript.trim(); if(!t) continue;
        if(r.isFinal){ const last=finals[finals.length-1];
          // su Android ogni risultato può ripetere il precedente: sostituisco invece di accodare
          if(last && t.toLowerCase().startsWith(last.toLowerCase())) finals[finals.length-1]=t; else if(t!==last) finals.push(t); }
        else interim=t; }
      show(); };
    rec.onerror=ev=>{ if(ev.error==="not-allowed"||ev.error==="service-not-allowed"){ finish(false); sys("Il microfono non è autorizzato per questa pagina."); } };
    rec.onend=()=>{ if(!active) return;
      kept=join(); finals=[]; interim="";
      if(Date.now()-started>180000) return finish(true);   // tetto di sicurezza: 3 minuti
      try{ listen(); }catch(e){ finish(true); } };
    rec.start();
  };
  mic.onclick=()=>{
    unlockAudio();
    if(active) return finish(true);
    active=true; started=Date.now(); kept=box.value.trim(); finals=[]; interim="";
    ph=box.placeholder; box.placeholder="Ti ascolto… tocca 🎤 quando hai finito";
    mic.classList.add("on"); micStop=()=>finish(false);
    try{ listen(); }catch(e){ finish(false); }
  };
}

if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
/* ---------------- chat salvata con la sessione ---------------- */
function chatPlain(chat){
  const dec=t=>t.replace(/<div class="qw"[\s\S]*?<\/div>/g,"").replace(/<br\s*\/?>/g,"\n").replace(/<\/t[dh]>\s*<t[dh][^>]*>/g," | ").replace(/<tr[^>]*>/g,"\n| ").replace(/<\/tr>/g," |").replace(/<li[^>]*>/g,"\n- ").replace(/<\/(div|table|ul|ol)>/g,"\n").replace(/<div class="(ih|is[^"]*|iw)"[^>]*>/g,"\n### ").replace(/<[^>]+>/g,"").replace(/\n{3,}/g,"\n\n").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
  return (chat||[]).filter(m=>m.cls!=="typing").map(m=>({who:m.who,t:m.t||null,text:m.who==="user"?m.text:dec(m.text)}));
}
function asciiSess(s){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function chatPath(h){ return `chat/${new Date(h.start).toISOString().slice(0,10)}_${asciiSess(h.session)}_${h.id}.md`; }
function chatMd(h){
  const hm=t=>t?new Date(t).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}):"";
  let t=`# ${h.session} — ${new Date(h.start).toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}\n\nInizio ${hm(h.start)}${h.end?` · fine ${hm(h.end)}`:" · in corso"}\n\n`;
  for(const m of h.chat||[]){
    if(m.who==="sys"){ t+=`*${hm(m.t)} · ${m.text}*\n\n`; continue; }
    t+=`**${hm(m.t)} · ${m.who==="user"?"Tu":"Coach"}:** ${m.text.replace(/\n/g,"  \n")}\n\n`;
  }
  return t;
}
function openChat(id){
  const h=st.history.find(x=>x.id===id); if(!h) return;
  const body=h.chat&&h.chat.length ? h.chat.map(m=>`<div class="msg ${m.who}" style="max-width:100%;margin-bottom:6px">${esc(m.text).replace(/\n/g,"<br>")}</div>`).join("")
    : `<p class="muted">La chat di questa sessione non è più sul telefono${st.settings.ghToken?": la trovi su GitHub nella cartella chat del repository dei dati.":"."}</p>`;
  openSheet(`Chat ${h.session} · ${dateTxt(h.start)}`,`<div style="display:flex;flex-direction:column">${body}</div>`);
}

/* ---------------- cambio esercizio ---------------- */
function openSwap(prefill=""){
  if(!st.cur) return;
  const k=st.cur.exIdx, orig=origId(k), cur=item()[0], timed=isTimeIt(item());
  const groups={}; Object.entries(EX).forEach(([id,e])=>{ if(id===cur || (e.kind==="time")!==timed) return;
    const where=Object.keys(SESSIONS).filter(s=>SESSIONS[s].some(x=>x[0]===id)); const g=st.custom[id]?"I tuoi esercizi":(where[0]||"Altri"); (groups[g] ||= []).push([id,e,where]); });
  openSheet("Cambia esercizio",`
    <p class="muted" style="margin-top:0">Al posto di <b>${esc(EX[orig].n)}</b>${cur!==orig?` (ora: ${esc(EX[cur].n)})`:""}. Serie, ripetizioni e recupero restano quelli della scheda; lo storico e i carichi seguono il nuovo esercizio.</p>
    ${cur!==orig?`<button class="btn wide" id="swBack" style="margin:0 0 12px">↩ Torna a ${esc(EX[orig].n)}</button>`:""}
    ${altHtml(orig,cur)}
    <form id="swForm" class="m-form" style="margin-bottom:12px"><input class="inp" id="swName" placeholder="Nuovo esercizio (es. Chest press macchina)" value="${esc(prefill)}"><button class="btn acc">Usa</button></form>
    ${Object.entries(groups).map(([g,arr])=>`<h3 class="sec" style="margin:14px 2px 6px">${esc(g)}</h3>`+arr.map(([id,e,where])=>`<button class="li" data-sw="${id}"><span class="nm">${esc(e.n)}</span><span class="rx">${esc(where.join(" · "))}</span></button>`).join("")).join("")}`);
  $("#sheetBody").querySelectorAll("[data-sw]").forEach(b=>b.onclick=()=>{ closeSheet(); swapTo(b.dataset.sw); });
  $("#sheetBody").querySelectorAll("[data-alt]").forEach(b=>b.onclick=()=>{ closeSheet(); const a=b.dataset.alt; swapTo(EX[a]?a:findOrCreateEx(a,false,orig)); });
  const back=$("#swBack"); if(back) back.onclick=()=>{ closeSheet(); swapTo(orig); };
  $("#swForm").onsubmit=e=>{ e.preventDefault(); const n=$("#swName").value.trim(); if(!n) return; closeSheet(); swapTo(findOrCreateEx(n,timed)); };
}
function altHtml(orig,cur){
  const list=(typeof ALT!=="undefined"&&ALT[orig])||[]; if(!list.length) return "";
  return `<h3 class="sec" style="margin:4px 2px 6px">Alternative consigliate · stesso muscolo e stesso stimolo</h3>`+
    list.filter(([a])=>a!==cur).map(([a,why])=>`<button class="li alt" data-alt="${esc(a)}"><span class="nm"><b>${esc(EX[a]?EX[a].n:a)}</b><br><span class="rx">${esc(why)}</span></span><span class="rx">${EX[a]&&EX[a].v.length?"▶ video":""}</span></button>`).join("")+
    `<h3 class="sec" style="margin:14px 2px 6px">Oppure scrivi un altro esercizio</h3>`;
}
function findOrCreateEx(name,timed,like){
  const low=name.toLowerCase().trim();
  const hit=Object.entries(EX).find(([,e])=>e.n.toLowerCase()===low) || Object.entries(EX).find(([,e])=>e.n.toLowerCase().includes(low)&&low.length>=5);
  if(hit) return hit[0];
  const id="cx_"+low.normalize("NFD").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,30);
  const eqGuess=/manubr/i.test(name)?"db":/bilancier|smith|multipower|\bez\b/i.test(name)?"bb":/cav|carrucol|corda|pulley|face pull/i.test(name)?"cable":/dischi|hack|pendulum|t-bar|leg press|pressa/i.test(name)?"plate":/piegament|nordic|sissy|trazioni|iperestensioni|dip\b/i.test(name)?"machine":"machine";
  const twoStacks=/croci.*cav|cavi incrociat|crossover|cross-cable|cavi.*(croci|incroc)/i.test(name);
  const e={n:name.charAt(0).toUpperCase()+name.slice(1),s:like&&EX[like]?`Alternativa a ${EX[like].n}`:"Esercizio personalizzato",eq:eqGuess,...(like?{like}:{}),...(twoStacks?{lm:"per lato (un pacco per lato)"}:{}),cue:"Esecuzione controllata, range di movimento completo.",v:[],...(timed?{kind:"time",sec:item()[2]}:{})};
  st.custom[id]=e; EX[id]=e; save(); return id;
}
function swapTo(id){
  const k=st.cur.exIdx, orig=origId(k), prev=item()[0];
  if(prev===id) return;
  st.cur.subs ||= {};
  if(id===orig) delete st.cur.subs[k]; else st.cur.subs[k]=id;
  const moved=(st.cur.log[k]||[]).length;
  st.cur.vid=0; st.cur.pending=null; save();
  sys(`Cambio esercizio: ${EX[prev].n} → ${EX[id].n}`);
  if(moved) bot(`Le ${moved} serie già registrate restano in questo slot e verranno salvate come <b>${esc(EX[id].n)}</b>. Se non va bene, usa <b>Annulla</b>.`);
  drawVideo(); drawExbar(); introExercise(); drawChips();
}

/* ---------------- scartare / eliminare sessioni ---------------- */
function slotOf(id){ for(const k of Object.keys(SESSIONS)){ const x=SESSIONS[k].find(y=>y[0]===id); if(x) return x; } return [id,2,8,12,120]; }
function recomputeSugg(id){
  const p=lastPerf(id); if(!p){ delete st.sugg[id]; return; }
  const nt=EX[id] && EX[id].kind!=="time" ? nextTime(slotOf(id),p.sets,(perfsOf(id)[1]||{}).sets) : null;
  if(nt && nt.kg!=null) st.sugg[id]={kg:nt.kg,...(nt.u==="lb"?{u:"lb",v:nt.v}:{}),txt:nt.txt,date:p.date}; else delete st.sugg[id];
}
function recomputeCycle(){
  for(let i=st.history.length-1;i>=0;i--){ const k=CYCLE.indexOf(st.history[i].session); if(k>=0){ st.cyclePos=k; return; } }
  st.cyclePos=-1;
}
async function ghDelete(path){
  if(!st.settings.ghToken) return;
  try{ const g=await gh(path); if(!g.ok) return; const sha=(await g.json()).sha;
    await gh(path,{method:"DELETE",body:JSON.stringify({message:"Elimina "+path,sha})}); }catch(e){}
}
function discardSession(){
  if(!st.cur) return;
  const h={id:st.cur.id,session:st.cur.session,start:st.cur.start};
  const ps=st.cur.prevSugg||{}; Object.keys(ps).forEach(id=>{ if(ps[id]==null) delete st.sugg[id]; else st.sugg[id]=ps[id]; });
  st.cur=null; stopTimer(); save();
  try{ wake && wake.release(); }catch(e){}
  ghDelete(chatPath(h)).then(()=>syncNow(true));
}
function deleteSession(id){
  const h=st.history.find(x=>x.id===id); if(!h) return;
  st.history=st.history.filter(x=>x.id!==id);
  h.ex.forEach(e=>recomputeSugg(e.ex));
  recomputeCycle(); save();
  ghDelete(chatPath(h)).then(()=>syncNow(true));
}

/* ---------------- dashboard dei progressi ---------------- */
const SERIES_COL=["#3987e5","#d95926","#199e70"], OTHER_COL="#6b727c";
/* Confronto tra attrezzi nei Progressi.
   "mano": peso per manubrio / per lato; il bilanciere diventa (barra media + dischi di entrambi i lati) / 2.
   "tot": carico totale; manubri ×2, dischi per lato ×2, bilanciere = barra + dischi; pacco pesi invariato. */
function eqOfSet(id,s){
  const m=`${s.m||""} ${s.raw||""}`;
  if(/smith|multipower/i.test(m) || id==="smith_sq") return "smith";
  if(/bilanc/i.test(m)) return "bb";
  if(/manubr|\/mano/i.test(m)) return "db";
  const e=EX[id]; return e ? e.eq||"machine" : "machine";
}
function normKg(id,s,mode){
  if(!s.kg) return null;
  const q=eqOfSet(id,s), k=s.kg;
  if(q==="bb"||q==="smith"){ const bar=q==="bb"?(st.settings.barKg??18):(st.settings.smithKg??15); return mode==="tot" ? bar+2*k : (bar+2*k)/2; }
  if(mode!=="tot") return k;
  if(q==="db"||q==="plate") return 2*k;
  if(/per lato/.test((EX[id]&&EX[id].lm)||"")) return 2*k;   // es. croci ai cavi: un pacco per lato
  return k;
}
const e1n = (id,s,mode) => { const w=normKg(id,s,mode); return (w && s.reps) ? w*(1+(s.reps+(s.rir||0))/30) : null; };
const e1 = s => (s.kg && s.reps) ? s.kg*(1+(s.reps+(s.rir||0))/30) : null;   // stessa formula del tuo Excel (RIR mancante = 0)
const mondayOf = ts => { const d=new Date(ts); d.setHours(0,0,0,0); const k=(d.getDay()+6)%7; d.setDate(d.getDate()-k); return d.getTime(); };
/* esercizi uniti nei Progressi: il bilanciere confrontato coi manubri ((barra + dischi dei due lati) / 2) */
const STAT_MERGE={bb_bench:"db_flat"}, STAT_NAME={db_flat:"Panca piana (manubri + bilanciere)"};
const stN=id=>STAT_NAME[id]||EX[id].n;
function mergeStats(h){
  if(!h.ex.some(e=>STAT_MERGE[e.ex])) return h;
  const ex=[]; h.ex.forEach(e=>{ const id=STAT_MERGE[e.ex]||e.ex, sets=STAT_MERGE[e.ex]?e.sets.map(x=>({...x,m:/bilanc/i.test(x.m||"")?x.m:"Bilanciere"+(x.m?" · "+x.m:"")})):e.sets;
    const o=ex.find(y=>y.ex===id); if(o) o.sets=[...o.sets,...sets]; else ex.push({...e,ex:id,sets}); });
  return {...h,ex};
}
function statsData(){
  const hs=allSessions().filter(h=>!isExtraSess(h.session)).map(mergeStats);
  const work=[]; // una riga per serie allenante
  hs.forEach(h=>h.ex.forEach(e=>e.sets.forEach(s=>{ if(countsInStats(s)) work.push({h,ex:e.ex,s}); })));
  return {hs,work};
}
function openStats(sel){
  const {hs,work}=statsData();
  if(!hs.length){ openSheet("Progressi","<p class='muted'>Ancora nessun dato: registra una sessione o importa lo storico da 🗂 Archivio.</p>"); return; }
  const first=hs[0].start, last=hs[hs.length-1].start;
  const now=Date.now(), w4=hs.filter(h=>h.start>now-28*864e5).length;
  // esercizi con dati
  const exIds=[...new Set(work.map(w=>w.ex))].sort((a,b)=>MUSCLE_ORDER.indexOf(MUSCLE[a]||"Z")-MUSCLE_ORDER.indexOf(MUSCLE[b]||"Z")||EX[a].n.localeCompare(EX[b].n));
  const cur = sel && exIds.includes(sel) ? sel : (st.cur && exIds.includes(item()[0]) ? item()[0] : exIds[0]);
  // indicatori della panoramica
  const fam=h=>/^FULL\s*BODY/i.test(h.session)?"A/B":"PPL/UL";
  const fams=[...new Set(hs.map(fam))];
  const withR=work.filter(w=>w.s.rir!=null), pct=(a,b)=>b?Math.round(100*a/b)+"%":"—";
  const low=a=>{ const r=a.filter(w=>w.s.rir!=null); return pct(r.filter(w=>w.s.rir<=1).length,r.length); };
  const exN=new Set(work.map(w=>w.ex)).size;
  const kpi=(l,v,sub,id)=>`<div class="kpi"${id?` id="${id}"`:""}><span class="l">${l}</span><b>${v}</b><span class="s">${sub}</span></div>`;
  const famTxt=fams.length>1?fams.map(f=>`${f} ${hs.filter(h=>fam(h)===f).length}`).join(" · "):`ultime 4 sett.: ${w4}`;
  const lowTxt=fams.length>1?fams.map(f=>`${f} ${low(work.filter(w=>fam(w.h)===f))}`).join(" → "):"tra le serie con RIR comunicato";
  openSheet("Progressi",`
    <p class="muted" style="margin:0 2px 8px">Dal ${new Date(first).toLocaleDateString("it-IT")} al ${new Date(last).toLocaleDateString("it-IT")}: <b>${hs.length}</b> sedute e <b>${work.length}</b> serie allenanti (extra incluse).</p>
    <div class="kpis">
      ${kpi("Sedute con dati",hs.length,famTxt)}
      ${kpi("Serie allenanti",work.length,`su ${exN} esercizi eseguiti`)}
      ${kpi("Serie nel target (≥2 RIR)",pct(withR.filter(w=>w.s.rir>=2).length,withR.length),"tra le serie con RIR comunicato")}
      ${kpi("Serie a 0–1 RIR",low(work),lowTxt)}
      ${kpi("Calorie medie al giorno","…","dati alimentazione","kpiK")}
      ${kpi("Proteine medie al giorno","…","grammi","kpiP")}
    </div>
    <div class="card"><h3>Quadro esercizi</h3><div id="ovBody"></div></div>
    <div class="card"><h3>Serie allenanti per settimana, per fascia di RIR</h3><p class="muted cap">Quante serie e quanto vicine al cedimento. Target 2–3 RIR.</p><div id="rirBody"></div></div>
    <div class="card"><h3>Tonnellaggio per settimana e distretto</h3><p class="muted cap">Carico totale × ripetizioni (lb convertite in kg, bilanciere con la barra).</p><div id="tonBody"></div></div>
    <div class="card"><h3>Serie per gruppo muscolare e settimana</h3><div class="heatwrap" id="heatBody"></div>
      <p class="muted" style="margin:8px 0 0">Serie allenanti ed extra di ogni settimana (da lunedì). Più scuro = più serie.</p></div>
    <div class="card" id="exCard"><h3>Andamento per esercizio</h3>
      <select class="inp" id="stEx">${exIds.map(id=>`<option value="${id}" ${id===cur?"selected":""}>${esc((MUSCLE[id]?MUSCLE[id]+" · ":"")+stN(id))}</option>`).join("")}</select>
      <div id="stChart"></div>
    </div>
    <div class="card" id="foodCard"><h3>Alimentazione <button type="button" class="btn sm" id="fdOpen" style="float:right">🍽 Aggiungi</button></h3><div id="foodBody"><p class="muted">Carico i dati…</p></div></div>`);
  drawWeekly(work);
  $("#fdOpen").onclick=()=>openDiary();
  $("#stEx").onchange=e=>drawExStats(e.target.value);
  drawExStats(cur);
  drawOverview();
  drawFood();
  drawKcal();
}
/* riepilogo per esercizio: tendenza, ultima serie migliore, variazione di forza, quota a 0–1 RIR */
const OV_GROUPS=[["Petto",["Petto"]],["Schiena",["Schiena"]],["Spalle",["Spalle"]],["Braccia",["Tricipiti","Bicipiti"]],["Gambe",["Quadricipiti","Femorali","Glutei","Polpacci"]],["Addome",["Addome"]]];
/* nel quadro esercizi le gambe sono divise in due gruppi (troppi esercizi per una colonna sola) */
const OV_VIEW=[...OV_GROUPS.filter(([g])=>g!=="Gambe").slice(0,4),["Quadricipiti",["Quadricipiti"]],["Femorali, glutei e polpacci",["Femorali","Glutei","Polpacci"]],...OV_GROUPS.filter(([g])=>g!=="Gambe").slice(4)];
function ovData(){
  const {hs}=statsData(), out={};
  hs.forEach(h=>h.ex.forEach(e=>{ const id=e.ex; if(!EX[id]||EX[id].kind==="time") return;
    const ss=e.sets.filter(countsInStats); if(!ss.length) return;
    const o=(out[id] ||= {id,segs:{},order:[],work:0,low:0,lastT:0});
    const ms=new Set(ss.map(x=>x.m||"—")); ms.forEach(m=>{ if(!o.order.includes(m)) o.order.push(m); });
    let b=null; ss.forEach(x=>{ const v=e1n(id,x,"mano"); if(v!=null&&(!b||v>b.v)) b={v,x}; });
    if(b){ (o.segs.all ||= []).push({t:h.start,v:b.v,x:b.x}); o.lastM="all"; o.lastT=h.start; o.last=b.x; }
    e.sets.filter(x=>!x.extra&&x.sec==null&&x.rir!=null).forEach(x=>{ o.work++; if(x.rir<=1) o.low++; });
  }));
  Object.keys(out).forEach(k=>{ if(!out[k].segs.all) delete out[k]; });
  Object.values(out).forEach(o=>{ const seg=o.segs[o.lastM]; o.seg=seg; o.var=seg.length>1?(seg[seg.length-1].v-seg[0].v)/seg[0].v:null; { const mx=Math.max(...seg.map(p=>p.v)), lv=seg[seg.length-1].v; o.dmax=seg.length>1?(lv>=mx*0.995?0:(lv-mx)/mx):null; } o.lowP=o.work?o.low/o.work:null; o.nM=o.order.length; });
  return out;
}
function sparkSvg(seg,w,h){
  if(!seg||!seg.length) return "";
  const ts=seg.map(p=>p.t), ys=seg.map(p=>p.v), t0=Math.min(...ts), t1=Math.max(...ts), y0=Math.min(...ys), y1=Math.max(...ys);
  const X=t=>t1===t0?w/2:3+(t-t0)/(t1-t0)*(w-6), Y=y=>y1===y0?h/2:h-3-(y-y0)/(y1-y0)*(h-6);
  const pts=seg.map(p=>[X(p.t).toFixed(1),Y(p.v).toFixed(1)]), lp=pts[pts.length-1];
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark" aria-hidden="true">${pts.length>1?`<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`:""}<circle cx="${lp[0]}" cy="${lp[1]}" r="2.8" fill="#3987e5"/></svg>`;
}
const ovSgn=v=>v==null?"—":(v>0?"+":"")+Math.round(v*100)+"%", ovCls=v=>v==null?"mut":v>0.005?"good":v<-0.005?"bad":"warn", ovLow=v=>v==null?"mut":v>=0.4?"bad":v>=0.2?"warn":"good", ovPct=v=>v==null?"—":Math.round(v*100)+"%";
function drawOverview(){
  const B=$("#ovBody"); if(!B) return;
  const D0=ovData(), view=st.ui.ovView||"c", all=!!st.ui.ovAll;
  // esercizi con meno di 3 sedute nascosti (si possono mostrare)
  const few=Object.values(D0).filter(o=>(o.seg||[]).length<3), D=all?D0:Object.fromEntries(Object.entries(D0).filter(([,o])=>(o.seg||[]).length>=3));
  const grp=OV_VIEW.map(([g,ms])=>[g,Object.values(D).filter(o=>ms.includes(MUSCLE[o.id]||(EX[o.id]&&EX[o.id].mg))).sort((a,b)=>b.lastT-a.lastT)]).filter(([,l])=>l.length);
  const altri=Object.values(D).filter(o=>!grp.some(([,l])=>l.includes(o))); if(altri.length) grp.push(["Altri",altri]);
  let h=`<div class="seg"><button type="button" data-ov="c" class="${view==="c"?"on":""}">Tabella compatta</button><button type="button" data-ov="a" class="${view==="a"?"on":""}">Colonne</button></div>
    <p class="muted" style="margin:6px 2px 8px">Tendenza = forza stimata (e1RM) della serie migliore di ogni seduta, tutte le macchine su un'unica linea (lb convertite in kg). Var. = dalla prima all'ultima seduta. Da max = quanto l'ultima è sotto la migliore di sempre (max = l'ultima è la migliore). Tocca un esercizio per il grafico.</p>`;
  if(view==="c"){
    const sh=x=>x?`${x.raw?x.raw.replace(/\s*\/\s*/g,"/"):(x.kg+" kg")} × ${x.reps}${x.rir!=null?" @"+rirTxt(x.rir):""}`:"";
    h+=`<div class="ovt"><table class="ovtab"><thead><tr><th>Esercizio · ultima serie migliore</th><th>Tendenza</th><th>Var.</th><th>Da max</th><th>0–1 RIR</th></tr></thead><tbody>${grp.map(([g,l])=>`<tr><td class="grp" colspan="5">${esc(g)}</td></tr>${l.map(o=>`<tr data-ovid="${o.id}"><td class="nm">${esc(stN(o.id))}<span class="ls">${esc(sh(o.last))} · ${dateTxt(o.lastT)}${o.nM>1?` · ${o.nM} macchine`:""}</span></td><td>${sparkSvg(o.seg,58,20)}</td><td class="num ${ovCls(o.var)}">${ovSgn(o.var)}</td><td class="num ${o.dmax==null?"mut":o.dmax===0?"good":o.dmax>-0.05?"warn":"bad"}">${o.dmax==null?"—":o.dmax===0?"max":ovSgn(o.dmax)}</td><td><span class="ovchip ${ovLow(o.lowP)}">${ovPct(o.lowP)}</span></td></tr>`).join("")}`).join("")}</tbody></table></div>`;
  } else {
    h+=`<div class="ovcols">${grp.map(([g,l])=>`<div class="ovcol"><h4>${esc(g)} <span>${l.length} esercizi</span></h4>${l.map(o=>`<div class="ovcard" data-ovid="${o.id}"><div class="t">${esc(stN(o.id))}</div>${sparkSvg(o.seg,190,34)}<div class="s">Ultima (${dateTxt(o.lastT)}): ${esc(setTxt(o.last))}</div><div class="row"><span class="ovchip ${ovCls(o.var)}">${ovSgn(o.var)} forza</span>${o.dmax!=null?`<span class="ovchip ${o.dmax===0?"good":"mut"}">${o.dmax===0?"max":ovSgn(o.dmax)+" da max"}</span>`:""}<span class="ovchip ${ovLow(o.lowP)}">${ovPct(o.lowP)} a 0–1 RIR</span></div></div>`).join("")}</div>`).join("")}</div>`;
  }
  if(few.length) h+=`<p class="muted xs" style="margin:8px 2px 0">${all?`Mostro anche ${few.length} esercizi con meno di 3 sedute.`:`${few.length} esercizi con meno di 3 sedute nascosti.`} <a href="#" id="ovAll">${all?"Nascondili":"Mostrali"}</a></p>`;
  if(!grp.length) h=`<p class="muted">Ancora nessun esercizio con dati.</p>`;
  B.innerHTML=h;
  B.querySelectorAll("[data-ov]").forEach(b=>b.onclick=()=>{ st.ui.ovView=b.dataset.ov; save(); drawOverview(); });
  const oa=$("#ovAll"); if(oa) oa.onclick=e=>{ e.preventDefault(); st.ui.ovAll=!all; save(); drawOverview(); };
  B.querySelectorAll("[data-ovid]").forEach(r=>r.onclick=()=>{ const sel=$("#stEx"); if(sel){ sel.value=r.dataset.ovid; drawExStats(r.dataset.ovid); } const c=$("#exCard"); if(c) c.scrollIntoView({behavior:"smooth",block:"start"}); });
}
/* ---------------- panoramica: grafici settimanali (fasce di RIR, tonnellaggio, mappa per muscolo) ---------------- */
const WK=t=>new Date(t).toLocaleDateString("it-IT",{day:"numeric",month:"short"}).replace(".","");
const grpOf=id=>{ const m=MUSCLE[id]||(EX[id]&&(EX[id].mg||(EX[id].like&&MUSCLE[EX[id].like]))); const g=OV_GROUPS.find(([,ms])=>ms.includes(m)); return g?g[0]:"Altro"; };
function stackSvg(xs,series,fmt,lab){
  const W=340,H=190,L=34,R=6,T=10,B=22;
  const tot=xs.map((_,i)=>series.reduce((a,s)=>a+(s.v[i]||0),0)), mx=Math.max(1,...tot);
  const step=mx>40000?10000:mx>20000?5000:mx>8000?2000:mx>60?20:mx>30?10:mx>12?5:2, top=Math.ceil(mx/step)*step;
  const slot=(W-L-R)/xs.length, bw=Math.max(3,Math.min(22,slot*0.72)), Y=v=>T+(H-T-B)*(1-v/top);
  let svg=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for(let v=0;v<=top;v+=step) svg+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-5}" y="${Y(v)+3}" class="ax" text-anchor="end">${fmt(v)}</text>`;
  const every=Math.ceil(xs.length/5);
  xs.forEach((x,i)=>{ const cx=L+slot*(i+.5); let y0=Y(0); const segs=series.map(s=>({s,v:s.v[i]||0})).filter(o=>o.v>0);
    segs.forEach((o,k)=>{ const y1=Y(0)-(Y(0)-Y(o.v))-(Y(0)-y0); const hgt=y0-y1-(k<segs.length-1||true?0:0); const isTop=k===segs.length-1, r=isTop?Math.min(3,bw/2,hgt):0, x0=cx-bw/2, gap=k>0?1.5:0;
      const yb=y0-gap, yt=Math.min(yb-0.5,y1);
      svg+=r?`<path d="M${x0.toFixed(1)},${yb.toFixed(1)} V${(yt+r).toFixed(1)} Q${x0.toFixed(1)},${yt.toFixed(1)} ${(x0+r).toFixed(1)},${yt.toFixed(1)} H${(x0+bw-r).toFixed(1)} Q${(x0+bw).toFixed(1)},${yt.toFixed(1)} ${(x0+bw).toFixed(1)},${(yt+r).toFixed(1)} V${yb.toFixed(1)} Z" fill="${o.s.c}"/>`:`<rect x="${x0.toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yb-yt).toFixed(1)}" fill="${o.s.c}"/>`;
      y0=y1; });
    if(i%every===0) svg+=`<text x="${cx}" y="${H-6}" class="ax" text-anchor="middle">${WK(x)}</text>`;
    const tip=`<b>Settimana del ${WK(x)}</b>${series.filter(s=>s.v[i]).map(s=>`<br><i style="background:${s.c}"></i>${s.n}: ${fmt(s.v[i],1)}`).join("")}<br><span class="muted">Totale ${fmt(tot[i],1)}${lab}</span>`;
    svg+=`<rect x="${(L+slot*i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H-T-B}" fill="transparent" class="hit" data-tip="${esc(tip)}"/>`; });
  svg+=`</svg>`;
  const leg=`<div class="legend">${series.map(s=>`<span><i style="background:${s.c}"></i>${s.n}</span>`).join("")}</div>`;
  return `${leg}<div class="chartwrap">${svg}<div class="tip" hidden></div></div>`;
}
function bindTips(B){
  B.querySelectorAll(".chartwrap").forEach(w=>{ const tip=w.querySelector(".tip");
    w.addEventListener("click",ev=>{ const c=ev.target.closest("[data-tip]"); if(!c){ tip.hidden=true; return; }
      tip.innerHTML=c.dataset.tip; tip.hidden=false; const r=w.getBoundingClientRect(), cr=c.getBoundingClientRect();
      tip.style.left=Math.min(r.width-175,Math.max(0,cr.left-r.left+cr.width/2-87))+"px"; tip.style.top=Math.max(0,cr.top-r.top+4)+"px"; }); });
}
function drawWeekly(work){
  if(!work.length) return;
  const w0=mondayOf(work[0].h.start), w1=mondayOf(work[work.length-1].h.start), xs=[];
  for(let t=w0;t<=w1+3600e3;t=mondayOf(t+8*864e5)) xs.push(t);
  const ix=t=>xs.indexOf(mondayOf(t));
  // fasce di RIR
  const F=[{n:"≥2 RIR",c:"#199e70",f:r=>r!=null&&r>=2},{n:"~1–2 RIR",c:"#e0a526",f:r=>r!=null&&r>1&&r<2},{n:"0–1 RIR",c:"#d0453b",f:r=>r!=null&&r<=1},{n:"RIR non comunicato",c:"#6b727c",f:r=>r==null}];
  F.forEach(s=>{ s.v=xs.map(()=>0); work.forEach(w=>{ if(s.f(w.s.rir)) s.v[ix(w.h.start)]++; }); });
  const rb=$("#rirBody"); if(rb){ rb.innerHTML=stackSvg(xs,F,v=>String(Math.round(v))," serie"); bindTips(rb); }
  // tonnellaggio per distretto
  const GC={Petto:"#3987e5",Schiena:"#d95926",Spalle:"#199e70",Braccia:"#c9a227",Gambe:"#d6539a",Addome:"#8a63d2",Altro:"#6b727c"};
  const G=Object.keys(GC).map(n=>({n,c:GC[n],v:xs.map(()=>0)}));
  work.forEach(w=>{ const kg=normKg(w.ex,w.s,"tot"); if(!kg||!w.s.reps) return; G.find(g=>g.n===grpOf(w.ex)).v[ix(w.h.start)]+=kg*w.s.reps; });
  const tb=$("#tonBody"); if(tb){ tb.innerHTML=stackSvg(xs,G.filter(g=>g.v.some(Boolean)),(v,full)=>full?Math.round(v).toLocaleString("it-IT")+" kg":(v>=1000?Math.round(v/1000)+" t":Math.round(v)+""),""); bindTips(tb); }
  // mappa serie per muscolo e settimana
  const vol={}; work.forEach(w=>{ const g=MUSCLE[w.ex]||(EX[w.ex]&&EX[w.ex].like&&MUSCLE[EX[w.ex].like])||"Altro"; const k=ix(w.h.start); (vol[g] ||= xs.map(()=>0))[k]++; });
  const maxV=Math.max(1,...Object.values(vol).flat());
  const groups=[...MUSCLE_ORDER.filter(g=>vol[g]), ...Object.keys(vol).filter(g=>!MUSCLE_ORDER.includes(g))];
  const hb=$("#heatBody"); if(hb) hb.innerHTML=`<table class="heat"><thead><tr><th></th>${xs.map((x,i)=>`<th>${i%2?"":WK(x)}</th>`).join("")}</tr></thead><tbody>${groups.map(g=>`<tr><th>${g}</th>${xs.map((x,i)=>{const v=vol[g][i]; return `<td title="${g}, settimana del ${WK(x)}: ${v} serie" style="background:${v?`rgba(57,135,229,${(0.18+0.72*v/maxV).toFixed(2)})`:"transparent"}">${v||"·"}</td>`;}).join("")}</tr>`).join("")}</tbody></table>`;
  if(hb) hb.scrollLeft=hb.scrollWidth;
}
/* calorie al giorno con colore rispetto al target + indicatori della panoramica */
async function drawKcal(){
  const B=$("#kcalBody")||document.createElement("div"); if(!$("#kpiK")) return;
  const setK=(id,v,sub)=>{ const e=$("#"+id); if(e){ e.querySelector("b").textContent=v; e.querySelector(".s").textContent=sub; } };
  if(!st.settings.ghToken){ B.innerHTML=`<p class="muted">Collega il backup GitHub in ⚙ Impostazioni per vedere l'alimentazione.</p>`; setK("kpiK","—","collega GitHub"); setK("kpiP","—","collega GitHub"); return; }
  const f=await loadFood(); if(!$("#kpiK")) return;
  if(!f||!f.giorni||!f.giorni.length){ B.innerHTML=`<p class="muted">Nessun dato di alimentazione.</p>`; setK("kpiK","—","nessun dato"); setK("kpiP","—","nessun dato"); return; }
  const N=v=>v===""||v==null?null:+String(v).replace(",",".");
  const days=f.giorni.map(r=>({d:r.data,t:Date.parse(r.data+"T12:00:00+07:00"),k:N(r.kcal),p:N(r.proteine_g),ok:r.giorno_completo!=="no",tg:r.target,kmin:N(r.kcal_min),kmax:N(r.kcal_max),pmin:N(r.proteine_min_g),pmax:N(r.proteine_max_g),cmin:N(r.carboidrati_min_g),cmax:N(r.carboidrati_max_g),fmin:N(r.grassi_min_g),fmax:N(r.grassi_max_g),sk:r.stato_kcal||"",sp:r.stato_proteine||"",sc:r.stato_carboidrati||"",sf:r.stato_grassi||"",nota:r.nota||""})).filter(x=>!isNaN(x.t)).sort((a,b)=>a.t-b.t);
  const comp=days.filter(x=>x.ok), avg=a=>a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):"—";
  // target nel tempo, letto dal testo del target di ogni giorno ("2.460 kcal · 175 g")
  const tgK=x=>{ const m=String(x.tg||"").match(/([\d.]+)\s*kcal/); return m?+m[1].replace(/\./g,""):null; }, tgP=x=>{ const m=String(x.tg||"").split("·")[1]; return m?m.replace(/[^\d–\-,.]/g,"").replace("-","–"):null; };
  const chg=[]; days.forEach(x=>{ const m=tgK(x); if(m!=null&&(!chg.length||chg[chg.length-1].m!==m)) chg.push({t:x.t,m}); });
  setK("kpiK",avg(comp.map(x=>x.k).filter(v=>v!=null)),chg.length?`target: ${chg.map((c,i)=>i?`dal ${dateTxt(c.t)} ${c.m}`:c.m).join(", ")} kcal`:"kcal");
  const pch=[]; days.forEach(x=>{ const tx=tgP(x); if(tx&&(!pch.length||pch[pch.length-1].tx!==tx)) pch.push({t:x.t,tx}); });
  setK("kpiP",avg(comp.map(x=>x.p).filter(v=>v!=null)),pch.length?`grammi; target ${pch.map((c,i)=>i?`dal ${dateTxt(c.t)} ${c.tx}`:c.tx).join(", ")} g`:"grammi");
  const ymd=t=>{ const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }, trainDays=new Set(allSessions().map(h=>ymd(h.start)));
  const W=340,H=180,L=38,R=6,T=10,Bt=26, pts=days.filter(x=>x.k!=null), mx=Math.max(...pts.map(x=>x.k),...days.map(x=>x.kmax||0)), top=Math.ceil(mx/1000)*1000;
  const slot=(W-L-R)/days.length, bw=Math.max(2,Math.min(14,slot-1.5)), Y=v=>T+(H-T-Bt)*(1-v/top);
  const cl=x=>!x.ok?"#6b727c":x.kmin==null?"#3987e5":x.k<x.kmin?"#e0a526":x.k>x.kmax?"#3987e5":"#199e70";
  let svg=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Calorie al giorno">`;
  for(let v=0;v<=top;v+=1000) svg+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-5}" y="${Y(v)+3}" class="ax" text-anchor="end">${v}</text>`;
  const every=Math.ceil(days.length/5);
  days.forEach((x,i)=>{ const cx=L+slot*(i+.5);
    if(x.k!=null){ const y=Y(x.k), r=Math.min(3,bw/2); svg+=`<path d="M${(cx-bw/2).toFixed(1)},${Y(0).toFixed(1)} V${(y+r).toFixed(1)} Q${(cx-bw/2).toFixed(1)},${y.toFixed(1)} ${(cx-bw/2+r).toFixed(1)},${y.toFixed(1)} H${(cx+bw/2-r).toFixed(1)} Q${(cx+bw/2).toFixed(1)},${y.toFixed(1)} ${(cx+bw/2).toFixed(1)},${(y+r).toFixed(1)} V${Y(0).toFixed(1)} Z" fill="${cl(x)}"/>`; }
    if(trainDays.has(x.d)) svg+=`<circle cx="${cx.toFixed(1)}" cy="${(Y(0)+5).toFixed(1)}" r="1.6" fill="var(--txt,#e8edf2)"/>`;
    if(i%every===0) svg+=`<text x="${cx}" y="${H-5}" class="ax" text-anchor="middle">${dateTxt(x.t)}</text>`;
    const st2=!x.ok?"parziale":x.kmin==null?"":x.k<x.kmin?"sotto il target":x.k>x.kmax?"sopra il target":"nel target";
    svg+=`<rect x="${(L+slot*i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H-T-Bt+8}" fill="transparent" class="hit" data-tip="${esc(`<b>${new Date(x.t).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})}</b> · ${st2}<br>${x.k??"?"} kcal · P ${x.p??"?"} g<br><span class="muted">Target ${x.kmin!=null?x.kmin+"–"+x.kmax:"—"} kcal${trainDays.has(x.d)?" · allenamento":""}</span>`)}"/>`; });
  svg+=`</svg>`;
  B.innerHTML=`<div class="legend"><span><i style="background:#199e70"></i>nel target</span><span><i style="background:#e0a526"></i>sotto</span><span><i style="background:#3987e5"></i>sopra</span><span><i style="background:#6b727c"></i>parziale</span></div><div class="chartwrap">${svg}<div class="tip" hidden></div></div><p class="muted" style="margin:6px 0 0">${days.length} giorni, dal ${dateTxt(days[0].t)} al ${dateTxt(days[days.length-1].t)}. Dettagli e pasti nella scheda Alimentazione qui sotto.</p>`;
  bindTips(B);
}
/* ---------------- alimentazione: letta dal repository privato dei dati (cartella alimentazione/) ---------------- */
let food=null;
function parseCSV(t){
  const rows=[]; let row=[], f="", q=false;
  for(let i=0;i<t.length;i++){ const c=t[i];
    if(q){ if(c==='"'){ if(t[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if(c==='"') q=true; else if(c===","){ row.push(f); f=""; } else if(c==="\n"){ row.push(f); rows.push(row); row=[]; f=""; } else if(c!=="\r") f+=c; }
  if(f||row.length){ row.push(f); rows.push(row); }
  const h=rows.shift()||[]; return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k.trim(),(r[i]??"").trim()])));
}
async function loadFood(force){
  if(!food){ try{ food=JSON.parse(localStorage.getItem("gc_food")||"null"); }catch(e){} }
  if(!st.settings.ghToken||!st.settings.ghRepo) return food;
  if(!force && food && !food.err && food.alimenti && food.schede && Date.now()-(food._t||0)<10*60e3) return food;
  const get=async f=>{ const r=await fetch(`https://api.github.com/repos/${st.settings.ghRepo}/contents/alimentazione/${f}`,{headers:{"Authorization":"Bearer "+st.settings.ghToken,"Accept":"application/vnd.github.raw","X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"}); if(r.status===404) return null; if(!r.ok) throw new Error("GitHub "+r.status); return r.text(); };
  try{ const [g,pp,al,sc]=await Promise.all([get("giorni.csv"),get("pasti.csv"),get("alimenti.csv"),get("schede.csv")]);
    food={_t:Date.now(),giorni:g?parseCSV(g):[],pasti:pp?parseCSV(pp):[],alimenti:al?parseCSV(al):[],schede:sc?parseCSV(sc):[],none:!g};
    try{ localStorage.setItem("gc_food",JSON.stringify(food)); }catch(e){} }
  catch(e){ food=food?{...food,err:String(e.message||e)}:{giorni:[],pasti:[],err:String(e.message||e)}; }
  return food;
}
async function drawFood(force){
  const B=$("#foodBody"); if(!B) return;
  if(!st.settings.ghToken){ B.innerHTML=`<p class="muted">Per vedere i dati dell'alimentazione collega il backup GitHub in ⚙ Impostazioni (gli stessi dati della cartella <b>alimentazione/</b> del tuo repository privato).</p>`; return; }
  const f=await loadFood(force); if(!$("#foodBody")) return;
  if(!f||!f.giorni||!f.giorni.length){ B.innerHTML=`<p class="muted">${f&&f.err?"Non riesco a leggere i dati ("+esc(f.err)+").":"Nessun dato nella cartella alimentazione/ del repository."}</p>`; return; }
  const N=v=>v===""||v==null?null:+String(v).replace(",",".");
  const all=f.giorni.map(r=>({g:+r.giorno,d:r.data,t:Date.parse(r.data+"T12:00:00+07:00"),k:N(r.kcal),p:N(r.proteine_g),c:N(r.carboidrati_g),f:N(r.grassi_g),ok:r.giorno_completo!=="no",tg:r.target,kmin:N(r.kcal_min),kmax:N(r.kcal_max),pmin:N(r.proteine_min_g),pmax:N(r.proteine_max_g),cmin:N(r.carboidrati_min_g),cmax:N(r.carboidrati_max_g),fmin:N(r.grassi_min_g),fmax:N(r.grassi_max_g),sk:r.stato_kcal||"",sp:r.stato_proteine||"",sc:r.stato_carboidrati||"",sf:r.stato_grassi||"",nota:r.nota||""})).filter(x=>!isNaN(x.t)).sort((a,b)=>a.t-b.t);
  const rng=st.ui.foodRange??30, met=st.ui.foodMetric||"k";
  const days=rng?all.slice(-rng):all, comp=days.filter(x=>x.ok);
  const avg=a=>a.length?Math.round(a.reduce((s,v)=>s+v,0)/a.length):null;
  const MT={k:{n:"Calorie",u:"kcal",v:"k",lo:"kmin",hi:"kmax",s:"sk"},p:{n:"Proteine",u:"g",v:"p",lo:"pmin",hi:"pmax",s:"sp"},c:{n:"Carboidrati",u:"g",v:"c",lo:"cmin",hi:"cmax",s:"sc"},f:{n:"Grassi",u:"g",v:"f",lo:"fmin",hi:"fmax",s:"sf"}}[met]||{n:"Calorie",u:"kcal",v:"k",lo:"kmin",hi:"kmax",s:"sk"};
  const stOf=x=>{ if(x[MT.s]) return x[MT.s]; const v=x[MT.v], l=x[MT.lo], u=x[MT.hi]; return v==null||l==null?"":v<l?"sotto":v>u?"sopra":"centrato"; };
  const inT=comp.filter(x=>stOf(x)==="centrato").length;
  const pc=n=>comp.length?Math.round(100*n/comp.length)+"%":"—";
  const last=all[all.length-1];
  let h=`<div class="seg"><button type="button" data-fr="7" class="${rng===7?"on":""}">7 giorni</button><button type="button" data-fr="14" class="${rng===14?"on":""}">14 giorni</button><button type="button" data-fr="30" class="${rng===30?"on":""}">30 giorni</button><button type="button" data-fr="0" class="${!rng?"on":""}">Tutto</button></div>
    <div class="seg"><button type="button" data-fm="k" class="${met==="k"?"on":""}">Calorie</button><button type="button" data-fm="p" class="${met==="p"?"on":""}">Proteine</button><button type="button" data-fm="c" class="${met==="c"?"on":""}">Carbo</button><button type="button" data-fm="f" class="${met==="f"?"on":""}">Grassi</button></div>
    <div class="tiles" style="margin-top:8px"><div class="tile"><b>${avg(comp.map(x=>x.k).filter(v=>v!=null))??"—"}</b><span>kcal medie</span></div><div class="tile"><b>${avg(comp.map(x=>x.p).filter(v=>v!=null))??"—"} g</b><span>proteine medie</span></div><div class="tile"><b>${pc(inT)}</b><span>giorni centrati (${MT.n.toLowerCase()})</span></div></div>
    <p class="muted" style="margin:6px 2px 0">Dal ${dateTxt(days[0].t)} al ${dateTxt(last.t)} · ${days.length} giorni${days.length-comp.length?` (${days.length-comp.length} registrati solo in parte: in grigio, esclusi dalle medie)`:""} · fascia = target del periodo</p>`;
  // grafico: una serie + fascia del target
  const val=x=>x[MT.v], lo=x=>x[MT.lo], hi=x=>x[MT.hi];
  const pts=days.filter(x=>val(x)!=null);
  const W=340,H=180,L=38,R=10,T=10,B2=24, t0=days[0].t, t1=last.t>t0?days[days.length-1].t:t0+864e5;
  const vs=[...pts.map(val),...days.map(lo).filter(v=>v!=null),...days.map(hi).filter(v=>v!=null)];
  const stp=met==="k"?1000:met==="f"?25:50; let vmin=0, vmax=Math.ceil(Math.max(...vs)*1.04/stp)*stp; if(vmax/stp<3&&met==="k") vmax=Math.max(vmax,3000);
  const nD=Math.round((days[days.length-1].t-t0)/864e5)+1, slotD=(W-L-R)/nD, X=t=>L+slotD*((t-t0)/864e5+.5), Y=v=>T+(H-T-B2)*(1-(v-vmin)/(vmax-vmin));
  let svg=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${MT.n} giornaliere con la fascia del target">`;
  Array.from({length:Math.round(vmax/stp)+1},(_,i)=>i*stp).forEach(v=>svg+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-6}" y="${Y(v)+3}" class="ax" text-anchor="end">${Math.round(v)}</text>`);
  const band=days.filter(x=>lo(x)!=null&&hi(x)!=null);
  if(band.length){ const step=864e5/2; const top=band.map(x=>`${X(x.t-step).toFixed(1)},${Y(hi(x)).toFixed(1)} ${X(x.t+step).toFixed(1)},${Y(hi(x)).toFixed(1)}`).join(" "), bot=band.slice().reverse().map(x=>`${X(x.t+step).toFixed(1)},${Y(lo(x)).toFixed(1)} ${X(x.t-step).toFixed(1)},${Y(lo(x)).toFixed(1)}`).join(" ");
    svg+=`<polygon points="${top} ${bot}" fill="#199e70" fill-opacity=".10" stroke="none"/>`; }
  [t0,t0+Math.round((nD-1)/2)*864e5,days[days.length-1].t].forEach(t=>svg+=`<text x="${X(t)}" y="${H-7}" class="ax" text-anchor="middle">${dateTxt(t)}</text>`);
  // colonne: una barra per giorno dalla base del grafico; giorni parziali solo contorno
  const slot=slotD, bw=Math.max(2,Math.min(22,slot*0.7)), base=Y(vmin);
  const tcol=x=>{ if(!x.ok) return "#6b727c"; return pctCol(fdPct(val(x),fdTargetOf(lo(x),hi(x)))); };
  const ymd2=t=>{ const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }, trainD=new Set(allSessions().map(h=>ymd2(h.start)));
  pts.forEach((x,k)=>{ const cx=X(x.t), y=Y(val(x)), r=Math.min(4,bw/2);
    svg+=`<path d="M${(cx-bw/2).toFixed(1)},${base.toFixed(1)} V${(y+r).toFixed(1)} Q${(cx-bw/2).toFixed(1)},${y.toFixed(1)} ${(cx-bw/2+r).toFixed(1)},${y.toFixed(1)} H${(cx+bw/2-r).toFixed(1)} Q${(cx+bw/2).toFixed(1)},${y.toFixed(1)} ${(cx+bw/2).toFixed(1)},${(y+r).toFixed(1)} V${base.toFixed(1)} Z" fill="${tcol(x)}"/>`;
    if(trainD.has(x.d)) svg+=`<circle cx="${cx.toFixed(1)}" cy="${(base+4).toFixed(1)}" r="1.6" fill="#e8edf2"/>`;
    svg+=`<rect x="${(cx-Math.max(slot,10)/2).toFixed(1)}" y="${T}" width="${Math.max(slot,10)}" height="${(base-T+6).toFixed(1)}" fill="transparent" class="hit" data-fd="${k}"/>`; });
  svg+=`</svg>`;
  h+=`${pctLegend()}<div class="chartwrap">${svg}<div class="tip" id="fdTip" hidden></div></div>`;
  // elenco dei giorni con i pasti
  const meals=g=>f.pasti.filter(m=>+m.giorno===g);
  const foods=(g,pasto)=>(f.alimenti||[]).filter(a=>+a.giorno===g&&a.pasto===pasto);
  const stTxt=x=>[["kcal",x.sk],["P",x.sp],["C",x.sc],["G",x.sf]].filter(z=>z[1]).map(([l,z])=>`<span class="fst ${/sotto/.test(z)?"lo":/sopra/.test(z)?"hi":"ok"}">${l} ${esc(z)}</span>`).join(" ");
  h+=`<details class="tbl"><summary>Giorni e pasti (${days.length})</summary>${days.slice().reverse().map(x=>`<details class="fday"><summary><b>${dateTxt(x.t)}</b> · ${x.k!=null?Math.round(x.k):"?"} kcal · P ${x.p??"?"} g${x.c!=null?` · C ${Math.round(x.c)} g · G ${Math.round(x.f)} g`:""}${x.ok?"":` <span class="xs">· parziale</span>`}</summary>${stTxt(x)?`<div class="fsts">${stTxt(x)}</div>`:""}${meals(x.g).map(m=>{ const al=foods(x.g,m.pasto); return `<div class="fmeal"><b>${esc(m.pasto)}</b> <span class="muted">${m.kcal?Math.round(N(m.kcal))+" kcal":""}${m.proteine_g?" · P "+Math.round(N(m.proteine_g)):""}${m.carboidrati_g?" · C "+Math.round(N(m.carboidrati_g)):""}${m.grassi_g?" · G "+Math.round(N(m.grassi_g)):""}</span>${al.length?`<div class="fal">${al.map(a=>`<div>${a.fonte==="stimato"?"<i title='stimato'>~</i> ":a.fonte==="parziale"?"<i title='in parte stimato'>≈</i> ":""}${esc(a.alimento)}${a.quantita?` <span class="muted">${esc(a.quantita)}</span>`:""}<span class="muted"> · ${Math.round(N(a.kcal))} kcal · P ${N(a.proteine_g)??"?"}</span></div>`).join("")}</div>`:`<br>${esc(m.descrizione)}`}</div>`; }).join("")||`<p class="muted">Nessun pasto dettagliato.</p>`}${x.nota?`<div class="xs fnote">📝 ${esc(x.nota)}</div>`:""}<div class="xs">Target: ${esc(x.tg||"—")}${(f.alimenti||[]).some(a=>+a.giorno===x.g)?" · ~ = valore stimato":""}</div></details>`).join("")}</details>`;
  h+=`<p class="muted" style="margin:8px 0 0">Dati fino al ${new Date(last.t).toLocaleDateString("it-IT")} · <a href="#" id="fdReload">aggiorna</a></p>`;
  B.innerHTML=h;
  B.querySelectorAll("[data-fr]").forEach(b=>b.onclick=()=>{ st.ui.foodRange=+b.dataset.fr; save(); drawFood(); });
  B.querySelectorAll("[data-fm]").forEach(b=>b.onclick=()=>{ st.ui.foodMetric=b.dataset.fm; save(); drawFood(); });
  $("#fdReload").onclick=e=>{ e.preventDefault(); B.innerHTML=`<p class="muted">Aggiorno…</p>`; drawFood(true); };
  B.querySelectorAll("[data-fd]").forEach(c=>c.onclick=()=>{ const x=pts[+c.dataset.fd], tip=$("#fdTip");
    tip.innerHTML=`<b>${new Date(x.t).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})}</b>${x.ok?"":" · parziale"}<br>${x.k??"?"} kcal · P ${x.p??"?"} g${x.c!=null?`<br>C ${Math.round(x.c)} g · G ${Math.round(x.f)} g`:""}<br><span class="muted">${MT.n}: ${esc(stOf(x)||"—")} · target ${esc(x.tg||"")}</span>`;
    tip.hidden=false; const r=B.querySelector(".chartwrap").getBoundingClientRect(), cr=c.getBoundingClientRect();
    tip.style.left=Math.min(r.width-170,Math.max(0,cr.left-r.left-80))+"px"; tip.style.top=Math.max(0,cr.top-r.top-86)+"px"; });
  B.querySelector(".chartwrap").addEventListener("click",ev=>{ if(!ev.target.classList.contains("hit")) $("#fdTip").hidden=true; });
}
function drawExStats(id){
  const {hs}=statsData();
  // miglior serie per seduta, separata per macchina/variante
  const split=!!st.ui.statsSplit, mode=st.ui.statsTot?"tot":"mano";
  const pts=[]; hs.forEach(h=>{ const e=h.ex.find(x=>x.ex===id); if(!e) return;
    const by={}; e.sets.filter(countsInStats).forEach(s=>{ const v=e1n(id,s,mode); const m=split?(s.m||"—"):"all"; if(v!=null && (!by[m]||v>by[m].v)) by[m]={v,s}; });
    Object.entries(by).forEach(([m,b])=>pts.push({t:h.start,m,v:b.v,s:b.s,h,w:normKg(id,b.s,mode)})); });
  const hasBar=hs.some(h=>{ const e=h.ex.find(x=>x.ex===id); return e&&e.sets.some(s=>["bb","smith"].includes(eqOfSet(id,s))); });
  const modeTxt = mode==="tot" ? "carico totale" : "per manubrio / per lato";
  const ctrls=`<div class="seg"><button type="button" data-split="0" class="${split?"":"on"}">Linea unica</button><button type="button" data-split="1" class="${split?"on":""}">Per macchina</button></div>
    <div class="seg"><button type="button" data-tot="0" class="${mode==="tot"?"":"on"}">Per mano/lato</button><button type="button" data-tot="1" class="${mode==="tot"?"on":""}">Totale</button></div>`;
  const box=$("#stChart");
  const rows=[]; hs.slice().reverse().forEach(h=>{ const e=h.ex.find(x=>x.ex===id); if(e) rows.push(`<tr><td>${dateTxt(h.start)}</td><td>${esc(h.session)}</td><td>${e.sets.map(s=>(s.extra?`<span class="xs">${esc(s.tipo&&s.tipo!=="extra"?s.tipo:"extra")}: </span>`:"")+esc(setTxt(s))+(s.m?` <span class="xs">· ${esc(s.m)}</span>`:"")).join("<br>")||"<span class='xs'>solo riscaldamento/prove</span>"}</td></tr>`); });
  const tableHtml=`<details class="tbl"><summary>Tabella delle sedute (${rows.length})</summary><table class="stt"><thead><tr><th>Data</th><th>Seduta</th><th>Serie (extra in grigio)</th></tr></thead><tbody>${rows.join("")}</tbody></table></details>`;
  const note=(st.exNotes||{})[id];
  const wire=()=>{ box.querySelectorAll("[data-split]").forEach(b=>b.onclick=()=>{ st.ui.statsSplit=b.dataset.split==="1"; save(); drawExStats(id); });
    box.querySelectorAll("[data-tot]").forEach(b=>b.onclick=()=>{ st.ui.statsTot=b.dataset.tot==="1"; save(); drawExStats(id); }); };
  if(!pts.length){ box.innerHTML=`<p class="muted">Nessuna serie con carico in kg e ripetizioni da mettere nel grafico (per esempio carichi in fori o unità sconosciuta).</p>${note&&note.ref?`<p class="note">📌 ${esc(note.ref)}</p>`:""}${tableHtml}`; wire(); return; }
  const labOf=m=>m==="all"?"Tutte le serie (lb convertite in kg)":m==="—"?"Attrezzo unico":m;
  // macchine: le 3 usate più di recente hanno un colore, le altre grigie
  const lastUse={}; pts.forEach(p=>lastUse[p.m]=Math.max(lastUse[p.m]||0,p.t));
  const machines=Object.keys(lastUse).sort((a,b)=>lastUse[b]-lastUse[a]);
  const colOf=m=>{ const i=machines.indexOf(m); return i<3?SERIES_COL[i]:OTHER_COL; };
  const W=340,H=190,L=34,R=10,T=12,B=26;
  const t0=Math.min(...pts.map(p=>p.t)), t1=Math.max(...pts.map(p=>p.t)), span=Math.max(t1-t0,864e5);
  let vmin=Math.min(...pts.map(p=>p.v)), vmax=Math.max(...pts.map(p=>p.v)); const pad=Math.max(2,(vmax-vmin)*0.12); vmin=Math.max(0,vmin-pad); vmax+=pad;
  const x=t=>L+(W-L-R)*((t-t0)/span), y=v=>T+(H-T-B)*(1-(v-vmin)/(vmax-vmin));
  const ticks=[0,1,2,3].map(i=>vmin+(vmax-vmin)*i/3);
  let svg=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Forza stimata (e1RM) nel tempo per ${esc(EX[id].n)}">`;
  ticks.forEach(v=>{ svg+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L-6}" y="${y(v)+3}" class="ax" text-anchor="end">${Math.round(v)}</text>`; });
  const xt=[t0,t0+span/2,t1]; xt.forEach((t,i)=>svg+=`<text x="${x(t)}" y="${H-8}" class="ax" text-anchor="${i===0?"start":i===2?"end":"middle"}">${dateTxt(t)}</text>`);
  machines.slice().reverse().forEach(m=>{ const ps=pts.filter(p=>p.m===m).sort((a,b)=>a.t-b.t), c=colOf(m);
    if(ps.length>1) svg+=`<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${ps.map(p=>`${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}"/>`;
    ps.forEach(p=>{ const k=pts.indexOf(p); svg+=`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="4.5" fill="${c}" stroke="#17191c" stroke-width="2"/><circle cx="${x(p.t)}" cy="${y(p.v)}" r="13" fill="transparent" class="hit" data-p="${k}"/>`; }); });
  svg+=`</svg>`;
  const legend=`<div class="legend">${machines.slice(0,3).map(m=>`<span><i style="background:${colOf(m)}"></i>${esc(labOf(m))}</span>`).join("")}${machines.length>3?`<span><i style="background:${OTHER_COL}"></i>Altre ${machines.length-3} macchine</span>`:""}</div>`;
  const best={}; pts.forEach(p=>{ if(!best[p.m]||p.v>best[p.m].v) best[p.m]=p; });
  const lastP=pts.slice().sort((a,b)=>b.t-a.t)[0];
  const expl = `Forza stimata (e1RM, kg, ${modeTxt}) della serie migliore di ogni seduta (extra comprese).`
    + (hasBar ? ` Bilanciere: (barra ${kgTxt(st.settings.barKg??18)} kg + dischi dei due lati)${mode==="tot"?"":" ÷ 2, per confrontarlo coi manubri"}${id==="smith_sq"||hs.some(h=>{const e=h.ex.find(x=>x.ex===id);return e&&e.sets.some(s=>eqOfSet(id,s)==="smith");})?`; Smith con barra ${kgTxt(st.settings.smithKg??15)} kg`:""} (modificabile in ⚙).` : "")
    + (split ? " Confronta solo punti dello stesso colore." : " Le libbre sono convertite in kg; macchine diverse possono dare valori diversi.");
  box.innerHTML=`${ctrls}<p class="muted" style="margin:8px 0 2px">${expl}</p>${legend}<div class="chartwrap">${svg}<div class="tip" id="stTip" hidden></div></div>
    <div class="kv"><span>Ultima seduta</span><b>${dateTxt(lastP.t)} · ${esc(setTxt(lastP.s))}</b></div>
    ${machines.slice(0,3).map(m=>`<div class="kv"><span>Record ${esc(m==="all"||m==="—"?"":m)}</span><b>${Math.round(best[m].v)} kg e1RM · ${esc(setTxt(best[m].s))} · ${dateTxt(best[m].t)}</b></div>`).join("")}
    ${note&&note.ref?`<p class="note">📌 ${esc(note.ref)}</p>`:""}${tableHtml}`;
  box.querySelectorAll(".hit").forEach(c=>c.onclick=ev=>{ const p=pts[+c.dataset.p], tip=$("#stTip");
    tip.innerHTML=`<b>${dateTxt(p.t)} · ${esc(p.h.session)}</b><br>${esc(setTxt(p.s))}<br>${esc(p.s.m||"")}<br>≈ ${kgTxt(Math.round(p.w*10)/10)} kg ${modeTxt} · e1RM ${p.v.toFixed(1)} kg`;
    tip.hidden=false; const r=box.querySelector(".chartwrap").getBoundingClientRect(), cr=c.getBoundingClientRect();
    tip.style.left=Math.min(r.width-170,Math.max(0,cr.left-r.left-80))+"px"; tip.style.top=Math.max(0,cr.top-r.top-78)+"px"; });
  box.querySelector(".chartwrap").addEventListener("click",ev=>{ if(!ev.target.classList.contains("hit")) $("#stTip").hidden=true; });
  wire();
}
$("#btnStats").onclick=()=>openStats();

/* ---------------- master file e backup su GitHub ---------------- */
function allSessions(){
  const out=[...st.history];
  if(st.cur){
    const list=curList();
    const ex=list.map((x,k)=>({ex:x[0],...(x[0]!==origId(k)?{al_posto_di:origId(k)}:{}),sets:(st.cur.log[k]||[]).map(cleanSet)})).filter(e=>e.sets.length);
    if(ex.length) out.push({id:st.cur.id,session:st.cur.session,start:st.cur.start,end:null,inCorso:true,ex});
  }
  return out.sort((a,b)=>a.start-b.start);
}
function buildMaster(){
  const sessions=allSessions(), esercizi={};
  for(const id of Object.keys(EX)){
    const storico=[];
    for(const h of sessions){ const e=h.ex.find(x=>x.ex===id&&x.sets.length);
      if(e) storico.push({data:new Date(h.start).toISOString().slice(0,10),sessione:h.session,...(h.inCorso?{in_corso:true}:{}),...(e.al_posto_di?{al_posto_di:EX[e.al_posto_di]?EX[e.al_posto_di].n:e.al_posto_di}:{}),serie:e.sets.map(s=>s.sec!=null?{sec:s.sec,...(s.extra?{extra:true}:{})}:{kg:s.kg,...(s.u==="lb"?{lb:s.v}:{}),rip:s.reps,rir:s.rir,...(s.raw?{carico:s.raw}:{}),...(s.rt?{rir_testo:s.rt}:{}),...(s.rr?{rip_testo:s.rr}:{}),...(s.m?{macchina:s.m}:{}),...(s.note?{nota:s.note}:{}),...(s.tipo?{tipo:s.tipo}:{}),...(s.extra?{extra:true}:{})})}); }
    const sch=Object.keys(SESSIONS).filter(k=>SESSIONS[k].some(x=>x[0]===id)).map(k=>{const x=SESSIONS[k].find(y=>y[0]===id);return isTimeIt(x)?{sessione:k,giri:x[1],durata:holdTxt(x),pausa_s:x[4]}:{sessione:k,serie:x[1],range:`${x[2]}-${x[3]}`,recupero_s:x[4]};});
    let best=null; storico.forEach(r=>r.serie.forEach(s=>{ if(s.kg && s.rip && !s.extra){ const e=e1rm(s.kg,s.rip,s.rir||0); if(!best||e>best.e1rm) best={e1rm:Math.round(e*10)/10,kg:s.kg,rip:s.rip,rir:s.rir,data:r.data,...(s.carico?{carico:s.carico}:{}),...(s.macchina?{macchina:s.macchina}:{})}; } }));
    esercizi[id]={nome:EX[id].n,attrezzo:EX[id].kind==="time"?"a tempo (mobilità/stretching)":`${EQ_LABEL[EX[id].eq]||"macchina"} · carico ${modeOf(id)}`,nelle_schede:sch,prossimo_carico:st.sugg[id]?.kg??null,prossimo_carico_testo:suggTxt(id),miglior_serie_stimata:best,...((st.exNotes||{})[id]?{note_storico:st.exNotes[id]}:{}),storico};
  }
  const sessioni=sessions.map(({chat,chatSynced,...h})=>({...h,chat_file:chatPath(h)}));
  return {app:"gym-coach",version:1,aggiornato:new Date().toISOString(),ciclo_ultimo_passaggio:st.cyclePos>=0?CYCLE[st.cyclePos]:null,cyclePos:st.cyclePos,...(st.program?{programma:st.program}:{}),...(Object.keys(st.myVid).length?{video_personali:st.myVid}:{}),sugg:st.sugg,esercizi_personalizzati:st.custom,note_esercizi:st.exNotes||{},esercizi,sessioni};
}
function masterMd(m){
  let t=`# Gym Coach — master per esercizio\n\nAggiornato: ${new Date(m.aggiornato).toLocaleString("it-IT")}  \nUltimo passaggio del ciclo: ${m.ciclo_ultimo_passaggio||"—"}  \nLe conversazioni di ogni sessione sono nella cartella [chat](chat/).\n`;
  for(const [id,e] of Object.entries(m.esercizi)){
    if(!e.storico.length) continue;
    const sch=e.nelle_schede;
    t+=`\n## ${e.nome}\n\n${e.attrezzo?`Attrezzo: ${e.attrezzo}  \n`:""}${e.note_storico&&e.note_storico.ref?`Nota dallo storico: ${e.note_storico.ref}  \n`:""}Schede: ${!sch.length?"esercizio personalizzato":sch.map(x=>x.giri?`${x.sessione} (${x.giri} giri × ${x.durata})`:`${x.sessione} (${x.serie}×${x.range})`).join(", ")}${sch[0]&&sch[0].giri?"":` · Prossimo carico: ${e.prossimo_carico_testo||"—"}`}\n\n| Data | Sessione | Serie |\n|---|---|---|\n`;
    for(const r of e.storico) t+=`| ${r.data.split("-").reverse().join("/")} | ${r.sessione}${r.in_corso?" (in corso)":""}${r.al_posto_di?` · al posto di ${r.al_posto_di}`:""} | ${r.serie.filter(s=>!s.tipo||s.tipo==="extra").map(s=>(s.sec!=null?`${s.sec} s ✓`:`${s.carico||(s.lb!=null?`${kgTxt(s.lb)} lb (${kgTxt(Math.round(s.kg*10)/10)} kg)`:`${kgTxt(s.kg)} kg`)} × ${s.rip_testo||s.rip} · RIR ${s.rir_testo||(s.rir??"?")}${s.macchina?` · ${s.macchina}`:""}`)+(s.extra?" (extra)":"")).join(" — ")} |\n`;
  }
  return t;
}
const b64=str=>{ const bytes=new TextEncoder().encode(str); let bin=""; for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000)); return btoa(bin); };
const unb64=b=>new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g,"")),c=>c.charCodeAt(0)));
async function gh(path,opt={}){
  const r=await fetch(`https://api.github.com/repos/${st.settings.ghRepo}/contents/${path}`,{...opt,headers:{"Authorization":"Bearer "+st.settings.ghToken,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(opt.body?{"Content-Type":"application/json"}:{})},cache:"no-store"});
  return r;
}
async function ghPut(path,content,msg){
  let sha; const g=await gh(path); if(g.ok) sha=(await g.json()).sha; else if(g.status!==404) throw g.status;
  const r=await gh(path,{method:"PUT",body:JSON.stringify({message:msg,content:b64(content),...(sha?{sha}:{})})});
  if(!r.ok) throw r.status;
}
function syncStatus(){
  if(!st.settings.ghToken) return "Backup automatico non attivo: inserisci repository e token.";
  if(st.sync.pending) return `⚠ Ultimo backup non riuscito${st.sync.err?` (${st.sync.err})`:""}: riprovo da solo.`+(st.sync.last?` Ultimo riuscito: ${new Date(st.sync.last).toLocaleString("it-IT")}.`:"");
  return st.sync.last?`✓ Ultimo backup: ${new Date(st.sync.last).toLocaleString("it-IT")}.`:"Nessun backup ancora eseguito.";
}
let syncing=null, syncAgain=false;
async function syncNow(quiet){
  if(!st.settings.ghToken||!st.settings.ghRepo) return;
  if(syncing){ syncAgain=true; return syncing; }
  syncing=(async()=>{
    try{
      const m=buildMaster(), when=new Date().toLocaleString("it-IT");
      await ghPut("master.json",JSON.stringify(m,null,1),`Backup ${when}`);
      await ghPut("master.md",masterMd(m),`Backup ${when}`);
      if(st.cur && st.cur.chat.length) await ghPut(chatPath(st.cur),chatMd({...st.cur,chat:chatPlain(st.cur.chat)}),`Chat ${when}`);
      for(const h of st.history){ if(h.chat && !h.chatSynced){ await ghPut(chatPath(h),chatMd(h),`Chat ${when}`); h.chatSynced=true; save(); } }
      st.sync={pending:false,last:Date.now(),err:""}; save();
      if(st.cur && !quiet) sys("☁ Backup salvato su GitHub");
      else if(st.cur) sys("☁ Backup salvato");
    }catch(e){
      const code=typeof e==="number"?e:0;
      st.sync.pending=true; st.sync.err= code===401?"token non valido o scaduto": code===403?"il token non ha il permesso Contents: read and write": code===404?"repository non trovato o non accessibile al token": "nessuna connessione"; save();
      if(st.cur) sys("⚠ Backup non riuscito: "+st.sync.err+". Riprovo più tardi.");
    }
  })();
  await syncing; syncing=null;
  if(syncAgain){ syncAgain=false; return syncNow(true); }
}
async function restoreFromGitHub(){
  if(!st.settings.ghToken) return "Inserisci prima token e repository.";
  try{
    const r=await gh("master.json"); if(r.status===404) return "Nel repository non c'è ancora master.json."; if(!r.ok) return "Errore "+r.status+": controlla token e repository.";
    const j=JSON.parse(unb64((await r.json()).content));
    const ids=new Set(st.history.map(h=>h.id)); let added=0;
    (j.sessioni||[]).filter(h=>!h.inCorso).forEach(h=>{ if(!ids.has(h.id)){ st.history.push(h); added++; } });
    st.history.sort((a,b)=>a.start-b.start);
    mergeSugg(j.sugg);
    mergeCustom(j.esercizi_personalizzati); mergeNotes(j.note_esercizi);
    if(j.programma && !st.program && !st.cur){ st.program=j.programma; applyProgram(st.program); }
    if(j.video_personali) Object.entries(j.video_personali).forEach(([k,v])=>{ if(!st.myVid[k]){ st.myVid[k]=v; applyMyVid(k); } });
    if(typeof j.cyclePos==="number" && st.cyclePos<0) st.cyclePos=j.cyclePos;
    save(); return `✓ Ripristinate ${added} sessioni da GitHub.`;
  }catch(e){ return "Ripristino non riuscito: nessuna connessione o file non valido."; }
}
window.addEventListener("online",()=>{ if(st.sync.pending) syncNow(true); });
if(st.sync.pending) setTimeout(()=>syncNow(true),1500);

render();
/* ---------------- pagina scorrevole: video in alto, chat che si allarga scorrendo ----------------
   #workout scorre; la parte bassa (chat + barra) ha altezza = schermo − parte di video ancora visibile,
   e uno spaziatore invisibile mantiene costante la lunghezza della pagina. */
(function(){
  const W=$("#wscroll"), top=$("#wtop"), dock=$("#dock"), sp=$("#wspacer"), chat=$("#chat");
  let raf=0;
  function fit(){
    raf=0; if($("#workout").hidden||!W.clientHeight) return;
    const H=top.offsetHeight, ch=W.clientHeight, vis=Math.max(0,Math.min(H,H-W.scrollTop));
    const atBottom = chat.scrollHeight-chat.scrollTop-chat.clientHeight < 40;
    dock.style.height=(ch-vis)+"px"; sp.style.height=vis+"px";
    document.body.classList.toggle("chatfull", vis<56);   // video fuori schermo: la parte alta della chat va sotto i tasti ☰ e ⟳
    if(atBottom) chat.scrollTop=1e9;
  }
  const req=()=>{ if(!raf) raf=requestAnimationFrame(fit); };
  W.addEventListener("scroll",req,{passive:true});
  window.addEventListener("resize",req);
  if(window.ResizeObserver){ const ro=new ResizeObserver(req); ro.observe(W); ro.observe(top); }
  window.fitDock=fit;
  window.showVideosTop=()=>{ W.scrollTo({top:0,behavior:"smooth"}); };
  window.showChatFull=()=>{ W.scrollTo({top:top.offsetHeight,behavior:"smooth"}); };
  $("#msg").addEventListener("focus",()=>setTimeout(()=>showChatFull(),60));
})();
if(!st.ui.fixNear1){ const h=st.history[st.history.length-1]; if(h&&!h.imported) h.ex.forEach(e=>{ if(EX[e.ex]&&EX[e.ex].kind!=="time") recomputeSugg(e.ex); }); st.ui.fixNear1=true; save(); }
window.__appOk=true;

/* grafici: trascina il dito per leggere i valori (punto o colonna più vicini), con una linea guida verticale */
(function chartScrub(){
  let wrap=null, last=null;
  const pick=(w,x,y)=>{ let best=null, bd=1e9;
    w.querySelectorAll(".hit").forEach(c=>{ const r=c.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; const d=Math.abs(cx-x)*4+Math.abs(cy-y)*(r.height>60?0:1); if(d<bd){ bd=d; best=c; } });
    return best; };
  const show=(w,x,y)=>{ const c=pick(w,x,y); if(!c) return;
    let xh=w.querySelector(".xhair"); if(!xh){ xh=document.createElement("div"); xh.className="xhair"; w.appendChild(xh); }
    const r=w.getBoundingClientRect(), cr=c.getBoundingClientRect(); xh.style.left=(cr.left-r.left+cr.width/2)+"px"; xh.hidden=false;
    if(c!==last){ last=c; c.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
    // l'etichetta va sopra il grafico (non copre i punti); se sopra non c'è spazio sullo schermo, sotto
    const tip=w.querySelector(".tip"); if(tip&&!tip.hidden){ const th=tip.offsetHeight, tw=tip.offsetWidth, sb=(w.closest("#sheetBody")||document.body).getBoundingClientRect();
      const above=r.top-th-6>=Math.max(0,sb.top); tip.style.top=(above?-th-6:r.height+4)+"px";
      tip.style.left=Math.min(r.width-tw,Math.max(0,cr.left-r.left+cr.width/2-tw/2))+"px"; } };
  document.addEventListener("pointerdown",ev=>{ const w=ev.target.closest&&ev.target.closest(".chartwrap"); if(!w||!w.querySelector(".hit")) return; wrap=w; last=null; show(w,ev.clientX,ev.clientY); },{passive:true});
  document.addEventListener("pointermove",ev=>{ if(wrap) show(wrap,ev.clientX,ev.clientY); },{passive:true});
  const end=()=>{ wrap=null; };
  document.addEventListener("pointerup",end); document.addEventListener("pointercancel",end);
  // il tocco è già gestito al pointerdown: il click reale non deve chiudere l'etichetta; fuori dai grafici chiude tutto
  document.addEventListener("click",ev=>{ if(!ev.isTrusted) return; const w=ev.target.closest&&ev.target.closest(".chartwrap");
    if(w&&w.querySelector(".hit")){ ev.stopPropagation(); return; }
    document.querySelectorAll(".chartwrap .tip,.xhair").forEach(x=>x.hidden=true); },true);
})();

/* ---------------- 🍽 diario alimentare: incolla il riepilogo, descrivi il pasto o inseriscilo a mano ----------------
   Salva in alimentazione/ del repository dei dati: giorni.csv (totali del giorno), pasti.csv (un pasto per riga)
   e alimenti.csv (un alimento per riga). Se non c'è rete il giorno resta in coda sul telefono e viene salvato dopo. */
const FD_DAY0=Date.UTC(2026,7,22);   // giorno 1 = 22/08/2026
const fdNum=v=>v===""||v==null||isNaN(+String(v).replace(",","."))?null:+String(v).replace(",",".");
const fdR1=v=>v==null?"":String(Math.round(v*10)/10);
const ymdLocal=t=>{ const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const dayNo=ymd=>Math.round((Date.UTC(+ymd.slice(0,4),+ymd.slice(5,7)-1,+ymd.slice(8,10))-FD_DAY0)/864e5)+1;
const csvCell=v=>{ v=v==null?"":String(v); return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v; };
const toCSV=(head,rows,eol="\n")=>[head.join(","),...rows.map(r=>head.map(k=>csvCell(r[k])).join(","))].join(eol)+eol;
const MEALS=["Colazione","Pranzo","Cena","Spuntino","Spuntino serale","Shake proteico"];
/* nome del pasto: tengo quello scritto (es. "Spuntino 2", "Spuntino serale"), traduco solo i nomi inglesi e sistemo le maiuscole */
function mealName(t){ t=String(t||"").replace(/\s+[—–]\s+.*$/,"").replace(/[:\-–—*#•]+$/,"").trim().replace(/^snack\b/i,"Spuntino").replace(/\bN\.$/,"notturno").replace(/^colaz\.?$/i,"Colazione"); const l=t.toLowerCase();
  const map={breakfast:"Colazione",lunch:"Pranzo",dinner:"Cena",snack:"Spuntino",snacks:"Spuntini"}; if(map[l]) return map[l];
  return t?t[0].toUpperCase()+t.slice(1):"Altro"; }
let fdDraft=null;   // {date, mode, meals:[{pasto,desc,kcal,p,c,g,foods:[...]}], tot, complete, replace}
function fdTarget(){
  const t=st.settings.foodT; if(t&&t.c!=null) return t;
  const g=(food&&food.giorni)||[], l=g[g.length-1];
  if(l){ const m=String(l.target||"").match(/([\d.]+)\s*kcal\s*·\s*(\d+)(?:–(\d+))?\s*g/); const r=(lo)=>fdNum(lo)!=null?Math.round(fdNum(lo)/0.925):null;
    if(m) return {k:+m[1].replace(/\./g,""),p:m[3]?Math.round((+m[2]+ +m[3])/2):+m[2],c:r(l.carboidrati_min_g)??260,g:r(l.grassi_min_g)??80}; }
  return {k:2460,p:175,c:260,g:80};
}
const FD_LO=0.925, FD_HI=1.05;
function fdTargetCols(t){ const r=v=>Math.round(v*10)/10;
  return {target:`${String(t.k).replace(/\B(?=(\d{3})+(?!\d))/g,".")} kcal · ${t.p} g`,kcal_min:r(t.k*FD_LO),kcal_max:r(t.k*FD_HI),proteine_min_g:r(t.p*FD_LO),proteine_max_g:r(t.p*FD_HI),carboidrati_min_g:r(t.c*FD_LO),carboidrati_max_g:r(t.c*FD_HI),grassi_min_g:r(t.g*FD_LO),grassi_max_g:r(t.g*FD_HI)}; }
/* stato rispetto al target, con le soglie del README: <85% molto sotto, <92,5% appena sotto, ≤105% centrato, ≤110% appena sopra */
const fdState=(v,t)=>v==null||!t?"":v<t*0.85?"molto sotto":v<t*0.925?"appena sotto":v<=t*1.05?"centrato":v<=t*1.10?"appena sopra":"molto sopra";
/* numeri all'italiana: "1.044" = 1044, "109,5" = 109.5, "0 (+2,7)" = 0 */
const itNum=v=>{ v=String(v??"").trim().replace(/[~≈]/g,"").replace(/\s.*$/,""); if(!v||!/\d/.test(v)) return null;
  if(v.includes(",")) v=v.replace(/\./g,"").replace(",","."); else if(/^\d{1,3}(\.\d{3})+$/.test(v)) v=v.replace(/\./g,""); const n=parseFloat(v); return isNaN(n)?null:n; };
const IT_MONTHS=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
/* recap con le tabelle copiate una cella per riga (Alimento / Quantità / kcal / P / C / F / Aff.): lo trasformo in tabelle Markdown */
const CELL_HEAD=/^(alimento|quantit[aà]|kcal|p|c|f|g|aff\.?|affidabilit[aà]|fonte|pasto)$/i;
function cellsToMD(txt){
  const L=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean), out=[]; let i=0, seenMeal=false, inSum=false;
  const isHead=k=>CELL_HEAD.test(L[k]||""), headAt=k=>/^(alimento|pasto)$/i.test(L[k]||"")&&isHead(k+1)&&isHead(k+2);
  while(i<L.length){
    if(headAt(i+1)&&!isHead(i)){ // titolo del pasto (o del riepilogo) seguito dall'intestazione
      const title=L[i]; inSum=/riepilogo/i.test(title)||/^pasto$/i.test(L[i+1]); seenMeal=true; i++;
      const head=[]; while(i<L.length&&isHead(i)&&head.length<9){ head.push(L[i]); i++; }
      out.push(`### ${inSum?"Riepilogo":title}`,`| ${head.join(" | ")} |`,`| ${head.map(()=>"---").join(" | ")} |`);
      while(i+head.length<=L.length){ const row=L.slice(i,i+head.length);
        // una riga valida ha un nome e, al posto delle kcal, un numero o "—"
        if(headAt(i+1)||headAt(i)||!/^[\d.,~≈+\-—%]+%?$/.test(row[head.findIndex(h=>/^kcal$/i.test(h))]||"")) break;
        out.push(`| ${row.join(" | ")} |`); i+=head.length; }
      continue; }
    if(inSum){ i++; continue; }                 // dopo il riepilogo: solo note di servizio
    if(!seenMeal){ if(out.length<2) out.push(L[i]); i++; continue; } // intestazione: titolo e data
    out.push(L[i]); i++;                        // note del pasto
  }
  return out.join("\n");
}
/* recap in tabelle Markdown (### Pasto, | Alimento | Quantità | kcal | P | C | F | Aff. |, riga Totale, riepilogo con Assunti e Target) */
function parseFoodMD(txt){
  txt=String(txt).replace(/<[^>]+>/g,"").replace(/\*\*/g,"");   // grassetto e celle colorate
  const L=txt.split(/\r?\n/), meals=[], notes=[]; let cur=null, inSum=false, cols=null, tot=null, target=null, date=null, pending=null;
  const head=L.filter(l=>l.trim()).slice(0,8).join(" ");
  const md=head.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
  if(md) date=`${md[3]}-${String(IT_MONTHS.indexOf(md[2].toLowerCase())+1).padStart(2,"0")}-${md[1].padStart(2,"0")}`;
  else { const g=head.match(/\bG\s?(\d{1,4})\b/); if(g){ const d=new Date(FD_DAY0+(+g[1]-1)*864e5); date=d.toISOString().slice(0,10); } }
  const cells=l=>l.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
  const ci=(h,re)=>h.findIndex(c=>re.test(c));
  for(const raw of L){ const l=raw.trim(); if(!l) continue;
    if(/^#{1,4}\s/.test(l)){ if(inSum) break;      // dopo il riepilogo: solo note di servizio
      const name=l.replace(/^#+\s*/,"").replace(/^[^\p{L}\d]+/u,"").trim(); cols=null;
      if(!meals.length&&/\bG\s?\d+\b|diario alimentare/i.test(name)&&!/riepilogo/i.test(name)) continue;
      // un pasto nasce solo se dopo il titolo c'è una tabella (i titoli del cruscotto iniziale non sono pasti)
      if(/riepilogo|totale giornaliero|resoconto/i.test(name)){ inSum=true; cur=null; pending=null; } else { inSum=false; cur=null; pending=mealName(name.replace(/^\d+\\?\.\s*/,"")); } continue; }
    if(l.startsWith("|")){ const c=cells(l); if(c.every(x=>/^:?-{2,}:?$/.test(x)||!x)) continue;
      if(!cols){ if(!inSum&&pending){ cur={pasto:pending,foods:[]}; meals.push(cur); pending=null; } cols={n:0,q:ci(c,/quant/i),k:ci(c,/^kcal|^cal/i),p:ci(c,/^p(rot\w*)?$/i),c:ci(c,/^c(arb\w*)?$/i),g:ci(c,/^(f|g|grass\w*|fat)$/i),a:ci(c,/^aff/i)}; continue; }
      const nm=c[0]||"", v={kcal:itNum(c[cols.k]),p:itNum(c[cols.p]),c:itNum(c[cols.c]),g:itNum(c[cols.g])};
      if(inSum){ if(/^assunt|^totale/i.test(nm)) tot=v; else if(/^target/i.test(nm)) target={k:v.kcal,p:v.p,c:v.c,g:v.g}; continue; }
      if(!cur) continue;
      if(/^totale/i.test(nm)){ Object.assign(cur,v); continue; }
      cur.foods.push({nome:nm,q:cols.q>=0?c[cols.q]:"",...v,aff:cols.a>=0?c[cols.a]:""}); continue; }
    // testo fuori dalle tabelle: frase finale con i totali oppure nota
    const tm=l.match(/^totale:\s*([\d.,]+)\s*kcal\D+?([\d.,]+)\s*g\s*prot\w*\D+?([\d.,]+)\s*g\s*carb\w*\D+?([\d.,]+)\s*g\s*grass/i);
    if(tm){ if(!tot) tot={kcal:itNum(tm[1]),p:itNum(tm[2]),c:itNum(tm[3]),g:itNum(tm[4])}; continue; }
    if(inSum||!cur) continue;                    // intestazione, cruscotto iniziale, note di servizio
    notes.push((cur?`${cur.pasto}: `:"")+l.replace(/^[-•*]\s+/,""));
  }
  return {meals:meals.filter(m=>m.foods.length||m.kcal!=null),tot,date,target,nota:notes.join(" ")};
}
/* lettura locale (senza AI) di un riepilogo incollato: intestazioni dei pasti, alimenti con kcal e macro */
function parseFoodText(txt){
  if(/^\s*\|.*\|\s*$/m.test(txt)&&/^\s*\|\s*:?-{2,}/m.test(txt)) return parseFoodMD(txt);
  if(/^\s*alimento\s*$/im.test(txt)&&/^\s*quantit[aà]\s*$/im.test(txt)) return parseFoodMD(cellsToMD(txt));
  const meals=[]; let cur=null, tot=null;
  const grab=(l,re)=>{ const m=l.match(re); return m?fdNum(m[1]):null; };
  const vals=l=>({kcal:grab(l,/(\d+(?:[.,]\d+)?)\s*(?:kcal|cal)\b/i),p:grab(l,/(?:\bP(?:rot\w*)?|protein\w*)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)??grab(l,/(\d+(?:[.,]\d+)?)\s*g\s*(?:di\s*)?prot/i),
    c:grab(l,/(?:\bC(?:arb\w*)?|carbo\w*)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)??grab(l,/(\d+(?:[.,]\d+)?)\s*g\s*(?:di\s*)?carb/i),g:grab(l,/(?:\bG(?:rass\w*)?|\bF(?:at)?|lipid\w*)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i)??grab(l,/(\d+(?:[.,]\d+)?)\s*g\s*(?:di\s*)?(?:grass|fat)/i)});
  txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(l=>{
    const v=vals(l), head=l.replace(/[:\-–—*#•]+/g," ").trim();
    if(/^(tot|totale|total)/i.test(head)){ tot=v; return; }
    const isMeal=/^(colazione|pranzo|cena|spuntin\w*|snack\w*|merenda|pre[- ]?allen\w*|post[- ]?allen\w*|shake|breakfast|lunch|dinner)\b/i.test(head);
    if(isMeal){ cur={pasto:mealName(head.replace(/\s*\d+(?:[.,]\d+)?\s*(?:kcal|cal)\b.*$/i,"")),foods:[],...v}; meals.push(cur); return; }
    if(v.kcal==null&&v.p==null) return;
    if(!cur){ cur={pasto:"Altro",foods:[]}; meals.push(cur); }
    const nome=l.replace(/\(?\s*\d+(?:[.,]\d+)?\s*(kcal|cal)\b.*$/i,"").replace(/[·|,;:–—-]+\s*$/,"").trim();
    const q=(nome.match(/(\d+(?:[.,]\d+)?\s*(?:g|ml|gr|pz|x)\b)/i)||[])[1]||"";
    cur.foods.push({nome:nome||l,q,...v});
  });
  return {meals:meals.filter(m=>m.foods.length||m.kcal!=null),tot};
}
function fdNormalize(meals){ return meals.map(m=>{ const foods=(m.foods||m.alimenti||[]).map(f=>({nome:String(f.nome||f.name||"").trim(),q:String(f.q||f.quantita||"").trim(),kcal:fdNum(f.kcal),p:fdNum(f.p),c:fdNum(f.c),g:fdNum(f.g),aff:f.aff||"",src:f.src||""}));
  const sum=k=>foods.some(f=>f[k]!=null)?foods.reduce((a,f)=>a+(f[k]||0),0):null;
  return {pasto:mealName(m.pasto),foods,desc:m.desc||foods.map(f=>f.nome+(f.q&&!f.nome.includes(f.q)?" "+f.q:"")).join("; "),kcal:fdNum(m.kcal)??sum("kcal"),p:fdNum(m.p)??sum("p"),c:fdNum(m.c)??sum("c"),g:fdNum(m.g)??sum("g")}; }); }
async function fdAI(mode,text){
  const json='{"data":"YYYY-MM-DD" o null,"pasti":[{"pasto":"Colazione|Pranzo|Cena|Spuntini e shake|...","alimenti":[{"nome":"","quantita":"","kcal":0,"p":0,"c":0,"g":0}],"kcal":0,"p":0,"c":0,"g":0}],"totale":{"kcal":0,"p":0,"c":0,"g":0} o null}';
  const sys = mode==="paste"
    ? `Ricevi il riepilogo giornaliero di un diario alimentare copiato da un'app. NON stimare e NON correggere: copia esattamente i valori presenti (kcal, proteine p, carboidrati c, grassi g in grammi) per ogni alimento, ogni pasto e il totale. Se un valore manca metti null. Mantieni i nomi degli alimenti e le quantità come scritti. Rispondi SOLO con JSON valido nel formato ${json}`
    : `Stima i valori nutrizionali (valore centrale realistico) dei pasti descritti dall'utente, alimento per alimento: kcal, proteine p, carboidrati c, grassi g in grammi. Se la quantità non è indicata usa una porzione tipica e scrivila in "quantita" con "~". Rispondi SOLO con JSON valido nel formato ${json}`;
  const order=st.settings.provider==="openrouter"?[callOpenRouter,callGemini]:[callGemini,callOpenRouter]; const errs=[];
  for(const f of order){ if(f===callGemini&&!st.settings.apiKey||f===callOpenRouter&&!st.settings.orKey) continue;
    const r=await f(sys,text); if(r.out){ try{ const j=JSON.parse(r.out.replace(/^[\s\S]*?(\{)/,"$1").replace(/\}[^}]*$/,"}")); return j; }catch(e){ errs.push("risposta non leggibile"); continue; } } errs.push(r.err); if(r.offline) break; }
  return {err:errs.join("; ")||"nessuna chiave AI configurata"};
}
function openDiary(date){
  const today=ymdLocal(Date.now()); date=date||(fdDraft&&fdDraft.date)||today;
  if(!fdDraft||fdDraft.date!==date) fdDraft={date,mode:(fdDraft&&fdDraft.mode)||"paste",meals:[],tot:null,complete:true,replace:true,text:""};
  const D=fdDraft, t=D.target||fdTarget();
  const saved=((food&&food.pasti)||[]).filter(m=>m.data===date), day=((food&&food.giorni)||[]).find(g=>g.data===date);
  const q=(st.foodQ||[]).filter(x=>x.date===date);
  const sum=k=>D.meals.reduce((a,m)=>a+(m[k]||0),0);
  const tot=D.tot&&D.tot.kcal!=null?D.tot:{kcal:sum("kcal"),p:sum("p"),c:sum("c"),g:sum("g")};
  const row=(m,i)=>`<div class="fdm"><div class="fdh"><select class="inp" data-fm="${i}" data-k="pasto">${[...new Set([...MEALS,m.pasto])].map(x=>`<option ${x===m.pasto?"selected":""}>${esc(x)}</option>`).join("")}</select><button type="button" class="btn sm" data-fdel="${i}" aria-label="Elimina">✕</button></div>
    <textarea class="inp" rows="2" data-fm="${i}" data-k="desc">${esc(m.desc)}</textarea>
    <div class="fdv">${[["kcal","kcal"],["p","P g"],["c","C g"],["g","G g"]].map(([k,l])=>`<label><span>${l}</span><input class="inp" inputmode="decimal" data-fm="${i}" data-k="${k}" value="${m[k]==null?"":fdR1(m[k])}"></label>`).join("")}</div>
    ${m.foods&&m.foods.length>1?`<details class="xs"><summary>${m.foods.length} alimenti</summary>${m.foods.map(f=>`<div>${esc(f.nome)}${f.q&&!f.nome.includes(f.q)?" · "+esc(f.q):""} — ${f.kcal??"?"} kcal${f.p!=null?" · P "+fdR1(f.p):""}${f.c!=null?" · C "+fdR1(f.c):""}${f.g!=null?" · G "+fdR1(f.g):""}</div>`).join("")}</details>`:""}</div>`;
  const trialOn=st.settings.foodTrial!==false;
  openSheet("Alimentazione",`${foodTabs("in")}
    <div class="fdtrial ${st.settings.foodTrial!==false?"on":""}"><label class="chk"><input type="checkbox" id="fdTrial" ${st.settings.foodTrial!==false?"checked":""}> <span><b>Periodo di prova</b>: salvo in <code>alimentazione/prova_app/</code> (con il testo incollato), separato dai dati principali. I grafici usano i dati principali.</span></label></div>
    <div class="fdtop"><input type="date" class="inp" id="fdDate" value="${date}" max="${today}"><span class="muted">giorno ${dayNo(date)}</span></div>
    ${saved.length||q.length?`<div class="card"><h3>${trialOn?"Nei dati principali (inseriti da Claude)":"Già salvato per questo giorno"}</h3>${trialOn?`<p class="muted xs">Solo riferimento: in prova il salvataggio va nella cartella separata e non tocca questi dati.</p>`:""}${day?`<p><b>${day.kcal||"?"} kcal</b> · P ${day.proteine_g||"?"} g${day.carboidrati_g?` · C ${day.carboidrati_g} g · G ${day.grassi_g} g`:""}${day.giorno_completo==="no"?" · parziale":""}</p>`:""}${saved.map(m=>`<div class="fmeal"><b>${esc(m.pasto)}</b> <span class="muted">${m.kcal?Math.round(fdNum(m.kcal))+" kcal":""}${m.proteine_g?" · P "+Math.round(fdNum(m.proteine_g))+" g":""}</span><br>${esc(m.descrizione)}</div>`).join("")}${q.length?`<p class="warn">⏳ ${q.length} salvataggio in attesa di rete.</p>`:""}</div>`:""}
    <div class="seg" id="fdMode"><button type="button" data-md="paste" class="${D.mode==="paste"?"on":""}">📋 Incolla riepilogo</button><button type="button" data-md="calc" class="${D.mode==="calc"||D.mode==="ai"?"on":""}">🧮 Alimenti</button><button type="button" data-md="man" class="${D.mode==="man"?"on":""}">✍ Manuale</button></div>
    ${D.mode==="calc"||D.mode==="ai"?fcHtml(D):D.mode==="man"?`<p class="muted cap">Aggiungi un pasto e compila i valori.</p><div class="row"><button type="button" class="btn" id="fdAdd">➕ Aggiungi pasto</button></div>`
      :`<textarea class="inp" id="fdText" rows="${D.mode==="paste"?7:3}" placeholder="${D.mode==="paste"?"Incolla qui il riepilogo della giornata copiato dall'app (pasti, alimenti, kcal e macro)":"Es. pranzo: 150 g riso basmati, 200 g petto di pollo, insalata con un cucchiaio d'olio"}">${esc(D.text||"")}</textarea>
      <div class="row">${D.mode==="paste"?`<label class="btn">📄 Carica file .md / .txt<input type="file" id="fdFile" accept=".md,.txt,.markdown,text/markdown,text/plain" hidden></label>`:""}${D.mode==="ai"&&SR?`<button type="button" class="btn" id="fdMic">🎤 Detta</button>`:""}<button type="button" class="btn acc" id="fdGo">${D.mode==="paste"?"Leggi il riepilogo":"Stima i valori"}</button></div>
      <p class="muted" id="fdMsg"></p>`}
    ${D.meals.length?`<div class="card"><h3>Da salvare</h3>${D.meals.map(row).join("")}
      <p class="fdtot"><b>Totale: ${Math.round(tot.kcal)} kcal</b> · P ${fdR1(tot.p)} g · C ${fdR1(tot.c)} g · G ${fdR1(tot.g)} g${D.tot&&D.tot.kcal!=null&&Math.abs(D.tot.kcal-sum("kcal"))>5?` <span class="xs">(totale dell'app; somma dei pasti ${Math.round(sum("kcal"))})</span>`:""}</p>
      <p class="muted xs">Target: ${t.k} kcal · P ${t.p} · C ${t.c} · G ${t.g} g → ${fdState(tot.kcal,t.k)||"—"} (kcal), ${fdState(tot.p,t.p)||"—"} (proteine)</p>
      ${D.target?`<p class="muted xs">Target dal recap: ${D.target.k} kcal · P ${D.target.p} · C ${D.target.c} · G ${D.target.g} g (lo uso anche come target predefinito)</p>`:""}${D.via?`<p class="muted xs">Letto ${D.via}.</p>`:""}
      <label class="fdnl"><span class="muted xs">Note del giorno</span><textarea class="inp" id="fdNota" rows="2">${esc(D.nota||"")}</textarea></label>
      <label class="chk"><input type="checkbox" id="fdComp" ${D.complete?"checked":""}> <span>Giornata completa <span class="muted xs">(se la togli il giorno conta come parziale: grigio nei grafici e fuori dalle medie)</span></span></label>
      ${saved.length&&!trialOn?`<label class="chk"><input type="checkbox" id="fdRep" ${D.replace?"checked":""}> <span>Sostituisci i ${saved.length} pasti già salvati per questo giorno <span class="muted xs">(spuntata: cancello quelli e salvo questi, totali dal recap; tolta: aggiungo questi pasti a quelli e sommo i totali)</span></span></label>`:""}
      <div class="row"><button type="button" class="btn acc" id="fdSave">💾 ${trialOn?"Salva nella prova":"Salva il giorno"}</button><button type="button" class="btn" id="fdClear">Svuota</button></div><p class="muted" id="fdSaveMsg"></p></div>`:""}
    <details class="card"><summary><b>Target giornaliero</b> <span class="muted">${t.k} kcal · P ${t.p} · C ${t.c} · G ${t.g} g</span></summary>
      <div class="fdv"><label><span>kcal</span><input class="inp" inputmode="numeric" id="tK" value="${t.k}"></label><label><span>Proteine g</span><input class="inp" inputmode="numeric" id="tP" value="${t.p}"></label><label><span>Carbo g</span><input class="inp" inputmode="numeric" id="tC" value="${t.c}"></label><label><span>Grassi g</span><input class="inp" inputmode="numeric" id="tG" value="${t.g}"></label></div>
      <div class="row"><button type="button" class="btn" id="tSave">Salva target</button></div><p class="muted xs">Vale per i giorni che salvi da ora in poi. "Centrato" = 92,5–105% del target.</p></details>
    ${st.settings.ghToken?"":`<p class="warn">Per salvare collega il backup GitHub in ⚙ Impostazioni.</p>`}`);
  const B=$("#sheetBody"); bindFoodTabs();
  $("#fdDate").onchange=e=>{ fdDraft.date=e.target.value; fdDraft.meals.forEach(()=>{}); openDiary(e.target.value); };
  B.querySelectorAll("[data-md]").forEach(b=>b.onclick=()=>{ keepText(); D.mode=b.dataset.md; if(!D.meals.length){ D.replace=D.mode==="paste"; } openDiary(date); });
  const keepText=()=>{ const ta=$("#fdText"); if(ta) D.text=ta.value; };
  B.querySelectorAll("[data-fm]").forEach(inp=>inp.onchange=()=>{ const m=D.meals[+inp.dataset.fm], k=inp.dataset.k; m[k]=["kcal","p","c","g"].includes(k)?fdNum(inp.value):inp.value; if(["kcal","p","c","g"].includes(k)) D.tot=null; keepText(); openDiary(date); });
  B.querySelectorAll("[data-fdel]").forEach(b=>b.onclick=()=>{ D.meals.splice(+b.dataset.fdel,1); D.tot=null; keepText(); openDiary(date); });
  if($("#fdAdd")) $("#fdAdd").onclick=()=>{ D.meals.push({pasto:MEALS[Math.min(saved.length+D.meals.length,3)],desc:"",kcal:null,p:null,c:null,g:null,foods:[]}); D.complete=day?day.giorno_completo!=="no":false; D.replace=false; openDiary(date); };
  if($("#fdClear")) $("#fdClear").onclick=()=>{ D.meals=[]; D.tot=null; D.text=""; openDiary(date); };
  if($("#fdComp")) $("#fdComp").onchange=e=>D.complete=e.target.checked;
  if($("#fdNota")) $("#fdNota").oninput=e=>D.nota=e.target.value;
  if($("#fdRep")) $("#fdRep").onchange=e=>D.replace=e.target.checked;
  $("#fdTrial").onchange=e=>{ st.settings.foodTrial=e.target.checked; save(); openDiary(date); };
  $("#tSave").onclick=()=>{ const n=id=>Math.max(0,+$(id).value||0); st.settings.foodT={k:n("#tK"),p:n("#tP"),c:n("#tC"),g:n("#tG")}; save(); openDiary(date); };
  if($("#fdGo")) $("#fdGo").onclick=async()=>{
    const txt=$("#fdText").value.trim(); D.text=txt; if(!txt) return; const msg=$("#fdMsg"); if(D.mode==="paste") D.rawText=txt;
    let meals=[], tot=null;
    if(D.mode==="paste"){
      // lettura sul telefono, senza AI; l'AI solo se il formato non è riconosciuto
      let r=parseFoodText(txt), via="sul telefono";
      if(!r.meals.length&&aiReady()){ msg.textContent="Formato non riconosciuto: provo con l'AI…"; const j=await fdAI("paste",txt); if(!j.err){ r={meals:j.pasti||[],tot:j.totale,date:j.data}; via="con l'AI"; } }
      if(!r.meals.length){ msg.textContent="Non sono riuscito a leggere il riepilogo. Usa ✍ Manuale oppure mandami un esempio del testo che copi."; return; }
      meals=r.meals; tot=r.tot; if(r.date&&/^\d{4}-\d\d-\d\d$/.test(r.date)&&r.date<=today) D.date=r.date;
      D.meals=fdNormalize(meals).map(m=>({...m,src:"diario"})); D.tot=tot&&fdNum(tot.kcal)!=null?{kcal:fdNum(tot.kcal),p:fdNum(tot.p),c:fdNum(tot.c),g:fdNum(tot.g)}:null; D.complete=true; D.replace=true; D.text="";
      D.target=r.target&&r.target.k?r.target:null; D.nota=r.nota||""; D.via=via;
    } else {
      if(!aiReady()){ msg.textContent="Per la stima serve una chiave Gemini o OpenRouter in ⚙. Puoi usare ✍ Manuale."; return; }
      msg.textContent="Stimo i valori…"; const j=await fdAI("ai",txt);
      if(j.err){ msg.textContent="Non riesco a stimare ora ("+j.err+"). Riprova più tardi o usa ✍ Manuale."; return; }
      D.meals=[...D.meals,...fdNormalize(j.pasti||[]).map(m=>({...m,src:"stimato"}))]; D.tot=null; D.complete=day?day.giorno_completo!=="no":false; D.replace=false; D.text="";
    }
    fdDraft.date=D.date; openDiary(D.date);
  };
  if($("#fcText")) fcBind(D,date);
  if($("#fdFile")) $("#fdFile").onchange=async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return; const t=await f.text(); $("#fdText").value=t; D.text=t; $("#fdGo").click(); };
  if($("#fdMic")) $("#fdMic").onclick=()=>{ const ta=$("#fdText"), b=$("#fdMic");
    if(b._rec){ b._rec.stop(); return; }
    const r=new SR(); r.lang="it-IT"; r.continuous=true; r.interimResults=false; const base=ta.value;
    let said=""; r.onresult=ev=>{ for(let k=ev.resultIndex;k<ev.results.length;k++) if(ev.results[k].isFinal) said+=" "+ev.results[k][0].transcript; ta.value=(base+" "+said).trim(); };
    r.onend=()=>{ b._rec=null; b.textContent="🎤 Detta"; b.classList.remove("on"); }; r.start(); b._rec=r; b.textContent="⏹ Fine"; b.classList.add("on"); };
  if($("#fdSave")) $("#fdSave").onclick=async()=>{
    const tg=D.target||fdTarget(); if(D.target){ st.settings.foodT={...D.target}; }
    const trial=st.settings.foodTrial!==false;
    const job={dir:trial?"alimentazione/prova_app/":"alimentazione/",raw:trial&&D.rawText?D.rawText:"",date:D.date,meals:D.meals,tot:D.tot,complete:D.complete,replace:trial?!!D.rawText:(saved.length?D.replace:false),target:fdTargetCols(tg),tgt:tg,nota:D.nota||"",at:Date.now()};
    const m=$("#fdSaveMsg"); m.textContent="Salvo…";
    if(!st.settings.ghToken){ m.textContent="Collega prima il backup GitHub in ⚙ Impostazioni."; return; }
    (st.foodQ ||= []).push(job); save();
    const ok=await flushFoodQ();
    fdDraft=null;
    if(ok){ m.textContent="✓ Salvato."; await loadFood(true); openDiary(job.date); const sb=$("#sheetBody"); if(sb) sb.insertAdjacentHTML("afterbegin",`<p class="okmsg">✓ Giorno salvato ${job.dir.includes("prova")?"nella cartella di prova":"nel repository"}.</p>`); }
    else { openDiary(job.date); const sb=$("#sheetBody"); if(sb) sb.insertAdjacentHTML("afterbegin",`<p class="warn">⏳ Non riesco a raggiungere GitHub: il giorno resta in coda sul telefono e lo salvo appena c'è rete.</p>`); }
  };
}
let fdFlushing=null;
async function flushFoodQ(){
  if(fdFlushing) return fdFlushing;
  fdFlushing=(async()=>{
    if(!(st.foodQ||[]).length) return true;
    if(!st.settings.ghToken||!st.settings.ghRepo) return false;
    try{ for(const dir of [...new Set(st.foodQ.map(j=>j.dir||"alimentazione/"))]){ const jobs=st.foodQ.filter(j=>(j.dir||"alimentazione/")===dir);
      const get=async f=>{ const r=await gh(dir+f); if(r.status===404) return {rows:[],sha:null,head:[],eol:"\r\n"}; if(!r.ok) throw r.status; const j=await r.json(); const txt=unb64(j.content); return {rows:parseCSV(txt),sha:j.sha,eol:txt.includes("\r\n")?"\r\n":"\n",head:(txt.split(/\r?\n/)[0]||"").split(",").map(x=>x.trim()).filter(Boolean)}; };
      const H=(F,base)=>[...F.head,...base.filter(k=>!F.head.includes(k))];
      const put=async(f,content,sha,msg)=>{ const r=await gh(dir+f,{method:"PUT",body:JSON.stringify({message:msg,content:b64(content),...(sha?{sha}:{})})}); if(!r.ok) throw r.status; };
      const [G,P,A]=await Promise.all([get("giorni.csv"),get("pasti.csv"),get("alimenti.csv")]);
      const dates=[];
      for(const job of jobs){
        const n=dayNo(job.date); dates.push(job.date);
        if(job.replace){ P.rows=P.rows.filter(r=>r.data!==job.date); A.rows=A.rows.filter(r=>r.data!==job.date); }
        job.meals.forEach(m=>{ P.rows.push({giorno:n,data:job.date,pasto:m.pasto,descrizione:m.desc,kcal:fdR1(m.kcal),proteine_g:fdR1(m.p),carboidrati_g:fdR1(m.c),grassi_g:fdR1(m.g)});
          (m.foods||[]).forEach(f=>A.rows.push({giorno:n,data:job.date,pasto:m.pasto,alimento:f.nome,quantita:f.q,kcal:fdR1(f.kcal),proteine_g:fdR1(f.p),carboidrati_g:fdR1(f.c),grassi_g:fdR1(f.g),fonte:f.src||m.src||"diario",affidabilita:f.aff||""})); });
        // totali del giorno: dall'app esterna se il giorno è stato incollato intero, altrimenti somma dei pasti salvati
        const dm=P.rows.filter(r=>r.data===job.date), s=k=>{ const v=dm.map(r=>fdNum(r[k])).filter(x=>x!=null); return v.length?Math.round(v.reduce((a,b)=>a+b,0)*10)/10:null; };
        const useT=job.replace&&job.tot&&job.tot.kcal!=null;
        const old=G.rows.find(r=>r.data===job.date)||{};
        // aggiunta a un giorno già salvato: totali precedenti + nuovi pasti (i vecchi pasti possono non avere tutti i macro)
        const add=k=>{ const a=fdNum(old[{kcal:"kcal",p:"proteine_g",c:"carboidrati_g",g:"grassi_g"}[k]]), v=job.meals.map(m=>m[k]).filter(x=>x!=null), n=v.reduce((x,y)=>x+y,0); return a==null&&!v.length?null:Math.round(((a||0)+n)*10)/10; };
        const app=!job.replace&&old.data;
        const tv=(k,col)=>useT&&job.tot[k]!=null?job.tot[k]:app?add(k):s(col);
        const row={giorno:n,data:job.date,kcal:Math.round(tv("kcal","kcal")||0),proteine_g:fdR1(tv("p","proteine_g")),carboidrati_g:fdR1(tv("c","carboidrati_g")),grassi_g:fdR1(tv("g","grassi_g")),
          giorno_completo:job.complete?"sì":"no",...(old.target&&!job.replace?Object.fromEntries(Object.keys(job.target).map(k=>[k,old[k]??job.target[k]])):job.target),nota:job.nota||(job.replace?"":old.nota)||""};
        { const tg=old.target&&!job.replace?{k:fdNum(old.kcal_min)/FD_LO,p:fdNum(old.proteine_min_g)/FD_LO,c:fdNum(old.carboidrati_min_g)/FD_LO,g:fdNum(old.grassi_min_g)/FD_LO}:job.tgt;
          row.stato_kcal=fdState(fdNum(row.kcal),tg.k); row.stato_proteine=fdState(fdNum(row.proteine_g),tg.p); row.stato_carboidrati=fdState(fdNum(row.carboidrati_g),tg.c); row.stato_grassi=fdState(fdNum(row.grassi_g),tg.g); }
        G.rows=G.rows.filter(r=>r.data!==job.date); G.rows.push(row);
      }
      const by=(a,b)=>a.data<b.data?-1:a.data>b.data?1:0;
      G.rows.sort(by); P.rows.sort(by); A.rows.sort(by);
      const msg=(dir.includes("prova")?"Prova app — ":"")+"Diario alimentare: "+[...new Set(dates)].join(", ");
      await put("pasti.csv",toCSV(H(P,["giorno","data","pasto","descrizione","kcal","proteine_g","carboidrati_g","grassi_g"]),P.rows,P.eol),P.sha,msg);
      await put("alimenti.csv",toCSV(H(A,["giorno","data","pasto","alimento","quantita","kcal","proteine_g","carboidrati_g","grassi_g","fonte","affidabilita"]),A.rows,A.eol),A.sha,msg);
      await put("giorni.csv",toCSV(H(G,["giorno","data","kcal","proteine_g","carboidrati_g","grassi_g","giorno_completo","target","kcal_min","kcal_max","proteine_min_g","proteine_max_g","carboidrati_min_g","carboidrati_max_g","grassi_min_g","grassi_max_g","stato_kcal","stato_proteine","stato_carboidrati","stato_grassi","nota"]),G.rows,G.eol),G.sha,msg);
      // testo originale del recap, per il confronto
      for(const job of jobs) if(job.raw){ await put(`recap/${job.date}.txt`,job.raw,(await (async()=>{ const r=await gh(dir+`recap/${job.date}.txt`); return r.ok?(await r.json()).sha:null; })()),msg); }
      st.foodQ=st.foodQ.filter(j=>!jobs.includes(j)); save(); }
      food=null; try{ localStorage.removeItem("gc_food"); }catch(e){}
      return true;
    }catch(e){ return false; }
  })();
  try{ return await fdFlushing; } finally{ fdFlushing=null; }
}
window.addEventListener("online",()=>{ if((st.foodQ||[]).length) flushFoodQ(); });
if((st.foodQ||[]).length) setTimeout(flushFoodQ,4000);
$("#btnFood").onclick=()=>openFoodDash();

/* ---------------- 🍽 Alimentazione: dashboard (come il report del diario) + inserimento ---------------- */
/* scala colori sul % del target: blu <85, giallo 85–92,5, verde 92,5–105, arancione 105–110, rosso 110–115, fucsia >115 */
const PCT_SCALE=[[0.85,"#3987e5","<85%"],[0.925,"#e3c62b","85–92,5%"],[1.05,"#199e70","92,5–105%"],[1.10,"#f0862a","105–110%"],[1.15,"#d0453b","110–115%"],[Infinity,"#d6339a",">115%"]];
const pctCol=r=>r==null?"#6b727c":PCT_SCALE.find(([lim])=>r<lim)[1];
const pctLegend=()=>`<div class="legend">${PCT_SCALE.map(([,c,l])=>`<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>`;
/* target del giorno: fisso (fascia 92,5–105%) oppure a intervallo (G1–G58); % rispetto al target, con i bordi dell'intervallo = 92,5% e 105% */
function fdTargetOf(lo,hi){ if(lo==null||hi==null) return null; return Math.abs(hi/lo-1.05/0.925)<0.002?{t:lo/0.925}:{lo,hi}; }
function fdPct(v,T){ if(v==null||!T) return null; if(T.t) return v/T.t; if(v<T.lo) return 0.925*v/T.lo; if(v>T.hi) return 1.05*v/T.hi; return 1; }
const fdTT=T=>!T?"—":T.t?fmtIt(T.t):`${fmtIt(T.lo)}–${fmtIt(T.hi)}`;
const fmtIt=(v,d=0)=>v==null?"—":(Math.round(v*10**d)/10**d).toLocaleString("it-IT",{maximumFractionDigits:d});
function foodDays(f){
  const N=v=>v===""||v==null?null:+String(v).replace(",",".");
  return (f.giorni||[]).map(r=>({g:+r.giorno,d:r.data,t:Date.parse(r.data+"T12:00:00+07:00"),k:N(r.kcal),p:N(r.proteine_g),c:N(r.carboidrati_g),f:N(r.grassi_g),ok:r.giorno_completo!=="no",tg:r.target||"",nota:r.nota||"",
    T:{k:fdTargetOf(N(r.kcal_min),N(r.kcal_max)),p:fdTargetOf(N(r.proteine_min_g),N(r.proteine_max_g)),c:fdTargetOf(N(r.carboidrati_min_g),N(r.carboidrati_max_g)),f:fdTargetOf(N(r.grassi_min_g),N(r.grassi_max_g))}}))
    .filter(x=>!isNaN(x.t)).sort((a,b)=>a.t-b.t);
}
function foodPeriods(days){ const out=[]; days.forEach(x=>{ const key=x.tg+"|"+["k","p","c","f"].map(m=>fdTT(x.T[m])).join("|"); const l=out[out.length-1]; if(l&&l.key===key) l.days.push(x); else out.push({key,days:[x],T:x.T}); });
  out.forEach(p=>{ p.a=p.days[0].g; p.b=p.days[p.days.length-1].g; p.lab=p.a===p.b?`G${p.a}`:`G${p.a}–G${p.b}`; }); return out; }
function foodAvg(list){ const c=list.filter(x=>x.ok), m=k=>{ const v=c.map(x=>x[k]).filter(z=>z!=null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
  const sp=k=>c.reduce((a,x)=>a+(x[k]||0),0), kc=4*sp("p")+4*sp("c")+9*sp("f");
  return {n:c.length,k:m("k"),p:m("p"),c:m("c"),f:m("f"),pp:kc?4*sp("p")/kc:null,pc:kc?4*sp("c")/kc:null,pf:kc?9*sp("f")/kc:null}; }
/* fascia ±6% che contiene più giorni: valore "abituale" di ogni macro */
function foodSteady(list,k){ const v=list.filter(x=>x.ok&&x[k]!=null); let best=null;
  v.forEach(c=>{ const lo=c[k]*0.94, hi=c[k]*1.06, inn=v.filter(x=>x[k]>=lo&&x[k]<=hi); if(!best||inn.length>best.inn.length) best={inn}; });
  if(!best) return null; const vals=best.inn.map(x=>x[k]); return {mean:vals.reduce((a,b)=>a+b,0)/vals.length,lo:Math.min(...vals),hi:Math.max(...vals),n:vals.length,of:v.length,days:best.inn.map(x=>"G"+x.g)}; }
/* grafico a colonne giorno per giorno con colore sul % del target, fascia del target e linee ai cambi di target */
function foodBars(days,k,opt={}){
  const W=340,H=opt.h||170,L=36,R=6,T=8,B=22, n=days.length; if(!n) return "";
  const val=x=>k==="meal"?opt.val(x):x[k];
  const vs=days.map(val).filter(v=>v!=null), bands=k==="meal"?[]:days.map(x=>x.T[k]).filter(Boolean);
  const top0=opt.top||Math.max(...vs,...bands.map(T=>T.t?T.t*1.05:T.hi)), stp=(()=>{ const raw=top0*1.03/4, e=10**Math.floor(Math.log10(raw)), m=raw/e; return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e; })(), top=Math.ceil(top0*1.03/stp)*stp;
  const slot=(W-L-R)/n, bw=Math.max(1.5,Math.min(18,slot*0.72)), Y=v=>T+(H-T-B)*(1-v/top), X=i=>L+slot*(i+.5);
  let s=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  for(let v=0;v<=top+1e-9;v+=stp) s+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-4}" y="${Y(v)+3}" class="ax" text-anchor="end">${v>=1000?fmtIt(v/1000,1)+"k":v}</text>`;
  if(k!=="meal") days.forEach((x,i)=>{ const Tt=x.T[k]; if(!Tt) return; const lo=Tt.t?Tt.t*0.925:Tt.lo, hi=Tt.t?Tt.t*1.05:Tt.hi; s+=`<rect x="${(L+slot*i).toFixed(1)}" y="${Y(hi).toFixed(1)}" width="${(slot+0.3).toFixed(1)}" height="${(Y(lo)-Y(hi)).toFixed(1)}" fill="#9aa6b2" fill-opacity=".16"/>`; });
  if(k!=="meal") days.forEach((x,i)=>{ if(i&&x.tg!==days[i-1].tg) s+=`<line x1="${(L+slot*i).toFixed(1)}" x2="${(L+slot*i).toFixed(1)}" y1="${T}" y2="${H-B}" stroke="#9aa6b2" stroke-dasharray="3 3" stroke-width="1"/>`; });
  if(opt.avg!=null) s+=`<line x1="${L}" x2="${W-R}" y1="${Y(opt.avg)}" y2="${Y(opt.avg)}" stroke="#e8edf2" stroke-dasharray="4 3" stroke-width="1.2"/>`;
  const every=Math.max(1,Math.ceil(n/6));
  days.forEach((x,i)=>{ const v=val(x), cx=X(i);
    if(v!=null&&v>0){ const y=Y(v), r=Math.min(3,bw/2), col=k==="meal"?opt.col:(!x.ok?"#6b727c":pctCol(fdPct(v,x.T[k])));
      s+=`<path d="M${(cx-bw/2).toFixed(1)},${Y(0).toFixed(1)} V${(y+r).toFixed(1)} Q${(cx-bw/2).toFixed(1)},${y.toFixed(1)} ${(cx-bw/2+r).toFixed(1)},${y.toFixed(1)} H${(cx+bw/2-r).toFixed(1)} Q${(cx+bw/2).toFixed(1)},${y.toFixed(1)} ${(cx+bw/2).toFixed(1)},${(y+r).toFixed(1)} V${Y(0).toFixed(1)} Z" fill="${col}"/>`; }
    if(i%every===0) s+=`<text x="${cx}" y="${H-6}" class="ax" text-anchor="middle">G${x.g}</text>`;
    const pc=k==="meal"?null:fdPct(v,x.T[k]);
    const tip=`<b>G${x.g} · ${new Date(x.t).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})}</b>${x.ok?"":" · parziale"}<br>${opt.lab||""} ${v!=null?fmtIt(v,k==="k"||k==="meal"?0:1):"—"} ${k==="k"||k==="meal"?"kcal":"g"}${pc!=null?` · ${fmtIt(pc*100,1)}% del target`:""}${k!=="meal"?`<br><span class="muted">Target ${fdTT(x.T[k])}</span>`:""}`;
    s+=`<rect x="${(L+slot*i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H-T-B}" fill="transparent" class="hit" data-tip="${esc(tip)}"/>`; });
  return `<div class="chartwrap">${s}</svg><div class="tip" hidden></div></div>`;
}
const foodTabs=on=>`<div class="seg ftabs"><button type="button" data-ft="dash" class="${on==="dash"?"on":""}">📊 Dashboard</button><button type="button" data-ft="in" class="${on==="in"?"on":""}">✍ Inserisci giorno</button></div>`;
function bindFoodTabs(){ document.querySelectorAll("#sheetBody [data-ft]").forEach(b=>b.onclick=()=>b.dataset.ft==="dash"?openFoodDash():openDiary()); }
async function openFoodDash(force){
  openSheet("Alimentazione",`${foodTabs("dash")}<div id="fdash"><p class="muted">Carico i dati…</p></div>`); bindFoodTabs();
  if(!st.settings.ghToken){ $("#fdash").innerHTML=`<p class="muted">Collega il backup GitHub in ⚙ Impostazioni: i dati sono nella cartella <b>alimentazione/</b> del tuo repository.</p>`; return; }
  const f=await loadFood(force); const B=$("#fdash"); if(!B) return;
  if(!f||!f.giorni||!f.giorni.length){ B.innerHTML=`<p class="muted">${f&&f.err?"Non riesco a leggere i dati ("+esc(f.err)+").":"Nessun dato di alimentazione."}</p>`; return; }
  const all=foodDays(f), per=foodPeriods(all), rng=st.ui.fdRange??0, days=rng?all.slice(-rng):all;
  const first=all[0], last=all[all.length-1], A=foodAvg(all), lp=per[per.length-1], LA=foodAvg(lp.days);
  const pct=v=>v==null?"—":Math.round(v*100)+"%";
  const split=T=>{ const v=k=>T[k]?(T[k].t??(T[k].lo+T[k].hi)/2):null; const p=v("p"),c=v("c"),g=v("f"); if(p==null||c==null||g==null) return "—"; const kc=4*p+4*c+9*g; return `${Math.round(400*p/kc)} / ${Math.round(400*c/kc)} / ${Math.round(900*g/kc)}`; };
  // periodi per le medie: ogni target, dal primo target fisso in poi, ultimi 7/14 giorni e tutto
  const fixedFrom=all.find(x=>x.T.k&&x.T.k.t), sets=[...per.map(p=>({lab:p.lab,days:p.days}))];
  if(fixedFrom&&fixedFrom!==all[0]&&per.filter(p=>p.T.k&&p.T.k.t).length>1) sets.push({lab:`G${fixedFrom.g}–G${last.g}`,days:all.filter(x=>x.g>=fixedFrom.g)});
  sets.push({lab:"Ultimi 14 giorni",days:all.slice(-14)},{lab:"Ultimi 7 giorni",days:all.slice(-7)},{lab:`G${first.g}–G${last.g}`,days:all,bold:true});
  const steadySets=[per[0]&&{lab:per[0].lab,days:per[0].days},fixedFrom&&fixedFrom!==all[0]&&{lab:`G${fixedFrom.g}–G${last.g}`,days:all.filter(x=>x.g>=fixedFrom.g)},per.length>1&&{lab:lp.lab,days:lp.days}].filter(Boolean);
  const M=[["k","Calorie","kcal"],["p","Proteine","g"],["c","Carboidrati","g"],["f","Grassi","g"]];
  // pasti: colazione, pranzo, cena, spuntini/altro
  const mealCat=p=>{ const l=String(p||"").toLowerCase(); return /^colaz/.test(l)?"col":/^pranzo/.test(l)?"pra":/^cena/.test(l)?"cen":"alt"; };
  const mealK={}; (f.pasti||[]).forEach(m=>{ const g=+m.giorno, v=+String(m.kcal||"").replace(",","."); if(!g||isNaN(v)) return; const o=(mealK[g] ||= {col:0,pra:0,cen:0,alt:0}); o[mealCat(m.pasto)]+=v; });
  const MC=[["col","Colazione","#3987e5"],["pra","Pranzo","#f0862a"],["cen","Cena","#199e70"],["alt","Spuntini, shake e altro","#b0569e"]];
  let h=`<div class="seg"><button type="button" data-dr="7" class="${rng===7?"on":""}">7 g</button><button type="button" data-dr="14" class="${rng===14?"on":""}">14 g</button><button type="button" data-dr="30" class="${rng===30?"on":""}">30 g</button><button type="button" data-dr="0" class="${!rng?"on":""}">Tutto</button></div>
    <p class="fdsum">G${first.g}–G${last.g} · ${new Date(first.t).toLocaleDateString("it-IT",{day:"numeric",month:"long"})} – ${new Date(last.t).toLocaleDateString("it-IT",{day:"numeric",month:"long",year:"numeric"})}. In ${A.n} giorni la media è <b>${fmtIt(A.k)} kcal</b>, P ${fmtIt(A.p)} · C ${fmtIt(A.c)} · G ${fmtIt(A.f)} g. ${per.length>1?`Dal G${lp.a} (target ${fdTT(lp.T.k)} kcal · P ${fdTT(lp.T.p)} · C ${fdTT(lp.T.c)} · G ${fdTT(lp.T.f)}) la media è <b>${fmtIt(LA.k)} kcal</b>, P ${fmtIt(LA.p)} · C ${fmtIt(LA.c)} · G ${fmtIt(LA.f)} g.`:""}</p>
    <div class="card"><h3>Calorie giorno per giorno</h3><p class="muted cap">Colonna colorata sul % del target del giorno · fascia grigia = 92,5–105% del target · tratteggio = cambio di target</p>${pctLegend()}${foodBars(days,"k",{lab:"Calorie"})}</div>
    <div class="card"><h3>Proteine, carboidrati e grassi giorno per giorno</h3>${pctLegend()}${M.slice(1).map(([k,n])=>`<h4 class="fdh4">${n}</h4>${foodBars(days,k,{lab:n,h:130})}`).join("")}</div>
    <div class="card"><h3>Target per periodo</h3><div class="ovt"><table class="ftab"><thead><tr><th>Periodo</th><th>kcal</th><th>P g</th><th>C g</th><th>G g</th><th>% P/C/G</th></tr></thead><tbody>${per.map(p=>`<tr><td>${p.lab}</td><td>${fdTT(p.T.k)}</td><td>${fdTT(p.T.p)}</td><td>${fdTT(p.T.c)}</td><td>${fdTT(p.T.f)}</td><td>${split(p.T)}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted xs">Target a intervallo: dentro = 100%, i bordi valgono 92,5% e 105%. Target fissi: % del valore.</p></div>
    <div class="card"><h3>Media giornaliera e ripartizione calorica</h3><div class="ovt"><table class="ftab"><thead><tr><th>Periodo</th><th>Giorni</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>% P</th><th>% C</th><th>% G</th></tr></thead><tbody>${sets.map(z=>{ const a=foodAvg(z.days); return `<tr class="${z.bold?"b":""}"><td>${z.lab}</td><td>${a.n}</td><td>${fmtIt(a.k)}</td><td>${fmtIt(a.p)}</td><td>${fmtIt(a.c)}</td><td>${fmtIt(a.f)}</td><td>${pct(a.pp)}</td><td>${pct(a.pc)}</td><td>${pct(a.pf)}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="muted xs">Solo giorni completi. Percentuali sui grammi totali del periodo (P e C 4 kcal/g, G 9 kcal/g).</p></div>
    <div class="card"><h3>Valori più costanti</h3><p class="muted cap">Fascia ±6% che contiene più giorni: il valore "abituale" di ogni macro.</p><div class="ovt"><table class="ftab"><thead><tr><th>Periodo</th>${M.map(([,n])=>`<th>${n}</th>`).join("")}</tr></thead><tbody>${steadySets.map(z=>`<tr><td>${z.lab}</td>${M.map(([k])=>{ const q=foodSteady(z.days,k); return `<td>${q?`~${fmtIt(q.mean)} <span class="muted xs">(${fmtIt(q.lo)}–${fmtIt(q.hi)}) · ${q.n}/${q.of} gg</span>`:"—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></div>
    <div class="card"><h3>Calorie per pasto giorno per giorno</h3><p class="muted cap">Stessa scala per tutti · tratteggio = media del pasto nei giorni in cui c'è · vuoto = pasto non fatto</p>${(()=>{ const mTop=Math.max(1,...days.map(x=>Math.max(...Object.values(mealK[x.g]||{col:0})))); return MC.map(([key,n,c])=>{ const vals=days.map(x=>(mealK[x.g]||{})[key]||0).filter(v=>v>0), avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
      return `<h4 class="fdh4">${n} · media ${fmtIt(avg)} kcal</h4>${foodBars(days,"meal",{val:x=>(mealK[x.g]||{})[key]||0,col:c,avg,lab:n,h:110,top:mTop})}`; }).join(""); })()}</div>
    <div class="card"><h3>Tutti i giorni</h3><p class="muted cap">Cella colorata sul % del target del giorno. Tocca un giorno per pasti e note.</p>${pctLegend()}<div class="ovt"><table class="ftab fdays"><thead><tr><th>G</th><th>Data</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Target</th></tr></thead><tbody>${all.slice().reverse().map(x=>{ const cell=(k,d)=>{ const r=fdPct(x[k],x.T[k]); return `<td class="num" style="background:${x.ok&&r!=null?pctCol(r)+"40":"transparent"}" title="${r!=null?fmtIt(r*100,1)+"%":""}">${fmtIt(x[k],d)}</td>`; };
      return `<tr data-fg="${x.g}"><td>${x.g}</td><td>${dateTxt(x.t)}</td>${cell("k",0)}${cell("p",1)}${cell("c",1)}${cell("f",1)}<td class="xs">${esc(x.tg)}${x.nota?" 📝":""}</td></tr>`; }).join("")}</tbody></table></div></div>
    <p class="muted" style="margin:10px 2px">Dati fino al ${new Date(last.t).toLocaleDateString("it-IT")} · <a href="#" id="fdashReload">aggiorna</a></p>`;
  B.innerHTML=h; bindTips(B);
  B.querySelectorAll("[data-dr]").forEach(b=>b.onclick=()=>{ st.ui.fdRange=+b.dataset.dr; save(); openFoodDash(); });
  $("#fdashReload").onclick=e=>{ e.preventDefault(); openFoodDash(true); };
  B.querySelectorAll("tr[data-fg]").forEach(r=>r.onclick=()=>{ const g=+r.dataset.fg, x=all.find(z=>z.g===g); const nx=r.nextElementSibling;
    if(nx&&nx.classList.contains("fdet")){ nx.remove(); return; }
    const ms=(f.pasti||[]).filter(m=>+m.giorno===g), al=(f.alimenti||[]).filter(a=>+a.giorno===g);
    r.insertAdjacentHTML("afterend",`<tr class="fdet"><td colspan="7">${ms.map(m=>{ const fa=al.filter(a=>a.pasto===m.pasto); return `<div class="fmeal"><b>${esc(m.pasto)}</b> <span class="muted">${fmtIt(+m.kcal)} kcal${m.proteine_g?" · P "+fmtIt(+m.proteine_g,1):""}${m.carboidrati_g?" · C "+fmtIt(+m.carboidrati_g,1):""}${m.grassi_g?" · G "+fmtIt(+m.grassi_g,1):""}</span>${fa.length?`<div class="fal">${fa.map(a=>`<div>${a.fonte==="stimato"?"<i>~</i> ":""}${esc(a.alimento)} <span class="muted">${esc(a.quantita||"")} · ${fmtIt(+a.kcal)} kcal${a.affidabilita?" · "+esc(a.affidabilita):""}</span></div>`).join("")}</div>`:`<br>${esc(m.descrizione)}`}</div>`; }).join("")||"<p class='muted'>Nessun pasto.</p>"}${x.nota?`<div class="xs fnote">📝 ${esc(x.nota)}</div>`:""}</td></tr>`); });
}

/* ---------------- 🧮 alimenti scritti a mano: "40 ml baam whey", "2 cracker cioccolato", "150 g riso" ----------------
   Schede in ordine di precedenza: nuove (etichetta, codice a barre, foto) → storico (schede.csv) → base degli alimenti comuni.
   Le polveri misurate col misurino in ml diventano grammi con la densità della scheda. Tutto sul telefono, senza AI. */
const fnorm=s=>String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/['’`]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const FSTOP=new Set("di del della dello dei degli delle al alla allo ai alle con e ed il la lo le i gli in the of a da un una uno g gr ml pz per".split(" "));
const ftoks=s=>fnorm(s).split(" ").filter(t=>t&&!FSTOP.has(t)&&!/^\d+$/.test(t));
function lev(a,b){ if(Math.abs(a.length-b.length)>2) return 9; const d=Array.from({length:a.length+1},(_,i)=>[i]); for(let j=1;j<=b.length;j++) d[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[a.length][b.length]; }
function tokSim(a,b){ if(a===b) return 1; if(a.length>=4&&b.length>=4&&(a.startsWith(b)||b.startsWith(a))) return .9; if(a.length>=5&&b.length>=5){ const l=lev(a,b); if(l<=1) return .8; if(l<=2&&a.length>=7) return .65; } return 0; }
function nameScore(inT,cT){ if(!inT.length||!cT.length) return 0; let sum=0; const used=new Set();
  inT.forEach(t=>{ let best=0,bi=-1; cT.forEach((u,i)=>{ const v=tokSim(t,u); if(v>best){ best=v; bi=i; } }); sum+=best; if(bi>=0) used.add(bi); });
  const rec=sum/inT.length; return {s:.75*rec+.25*used.size/cT.length,rec}; }
function fcCards(){
  const N=v=>v===""||v==null||isNaN(+String(v).replace(",","."))?null:+String(v).replace(",",".");
  const mk=(o)=>({...o,names:[o.nome,...(o.alias||[])].map(ftoks).filter(t=>t.length)});
  const out=[], seen=new Set();
  const bd={}; (typeof FOODS_BASE!=="undefined"?FOODS_BASE:[]).forEach(f=>{ if(f[8]) [f[0],...f[1].split(";")].forEach(n=>bd[fnorm(n)]=f[8]); });
  (st.foodCards||[]).forEach(c=>{ seen.add(fnorm(c.nome)); out.push(mk({...c,src:c.src||"etichetta"})); });
  ((food&&food.schede)||[]).forEach(r=>{ if(seen.has(fnorm(r.nome))) return; seen.add(fnorm(r.nome));
    out.push(mk({nome:r.nome,alias:String(r.alias||"").split(";").map(x=>x.trim()).filter(Boolean),per:r.per||"100 g",k:N(r.kcal),p:N(r.proteine_g),c:N(r.carboidrati_g),g:N(r.grassi_g),dens:N(r.densita_g_ml)||bd[fnorm(r.nome)]||null,pz_g:N(r.pezzo_g),por_g:N(r.porzione_g),por_ml:N(r.porzione_ml),por_pz:N(r.porzione_pz),por_txt:r.porzione||"",usi:+r.usi||0,ultimo:r.ultimo||"",ean:r.codice||"",src:/storico/.test(r.fonte||"")?"storico":"etichetta",stim:/stimat/.test(r.fonte||"")})); });
  (typeof FOODS_BASE!=="undefined"?FOODS_BASE:[]).forEach(([nome,al,k,p,c,g,por,pz,dens])=>{ if(seen.has(fnorm(nome))) return;
    out.push(mk({nome,alias:al.split(";"),per:"100 g",k,p,c,g,por_g:por||null,pz_g:pz||null,dens:dens||null,src:"base"})); });
  return out;
}
function fcMatch(text,cards){ const t=ftoks(text); if(!t.length) return [];
  return cards.map(c=>{ let best={s:0,rec:0}; c.names.forEach(n=>{ const r=nameScore(t,n); if(r.s>best.s) best=r; });
      return {c,s:best.s+(c.src==="base"?0:.03+Math.min(.04,(c.usi||0)/400)),auto:best.rec>=.66}; })
    .filter(x=>x.s>=.5).sort((a,b)=>b.s-a.s).slice(0,6); }
/* quantità scritta nella riga */
function fcQty(line){
  const s=" "+line.replace(/½/g," 0,5 ").replace(/¼/g," 0,25 ")+" ";
  const U="kg|g|gr|grammi|ml|cl|l|lt|litri?|pz|pezz[io]|x|cucchiai[on]?[io]?|cucchiain[io]|fett[ae]|vasett[io]|confezion[ei]|bustin[ae]|barrett[ae]|scoop|misurin[io]|tazz[ae]|bicchier[ei]";
  const num="(\\d+(?:[.,]\\d+)?(?:\\/\\d+)?)";
  let m=s.match(new RegExp(`[\\s(]${num}\\s*(${U})(?=[\\s).,;:]|$)`,"i")), unitless=false;
  if(!m){ m=line.trim().match(new RegExp(`^${num}(?=\\s)`)); unitless=!!m; }
  if(!m) return {q:null,rest:line};
  const n0=m[1].includes("/")?m[1].split("/").reduce((a,b)=>+String(a).replace(",",".")/+b):+m[1].replace(",",".");
  const u=(unitless?"":m[2]||"").toLowerCase(); let n=n0, unit="pz";
  if(/^kg$/.test(u)){ n=n0*1000; unit="g"; } else if(/^(g|gr|grammi)$/.test(u)) unit="g";
  else if(/^ml$/.test(u)) unit="ml"; else if(/^cl$/.test(u)){ n=n0*10; unit="ml"; } else if(/^(l|lt|litr)/.test(u)){ n=n0*1000; unit="ml"; }
  else if(/^cucchiain/.test(u)){ n=n0*5; unit="ml"; } else if(/^cucchia/.test(u)){ n=n0*15; unit="ml"; } else if(/^(tazz|bicchier)/.test(u)){ n=n0*200; unit="ml"; }
  else if(/^(scoop|misurin)/.test(u)) unit="dose";
  const rest=(unitless?line.trim().replace(m[0],""):s.replace(m[0].trim(),"")).replace(/\s+/g," ").trim();
  return {q:{n,unit,txt:m[0].trim()},rest};
}
const fcR=(v,d=1)=>v==null?null:Math.round(v*10**d)/10**d;
function fcCalc(card,q){
  if(card.src==="ai") return {kcal:card.k,p:card.p,c:card.c,g:card.g,qt:q?q.txt:"porzione stimata",notes:["stima AI"],def:!q};
  let grams=null, ml=null, pcs=null; const notes=[];
  if(!q){ if(card.por_ml){ ml=card.por_ml; } else if(card.por_g){ grams=card.por_g; } else if(card.por_pz){ pcs=card.por_pz; } else if(card.pz_g||card.per==="1 pz"){ pcs=1; } else grams=100; notes.push("porzione solita"); }
  else if(q.unit==="g") grams=q.n; else if(q.unit==="ml") ml=q.n; else if(q.unit==="dose"){ if(card.por_ml) ml=q.n*card.por_ml; else if(card.por_g) grams=q.n*card.por_g; else grams=q.n*30; notes.push("dose = porzione solita"); } else pcs=q.n;
  let mult, qt;
  if(card.per==="1 pz"){ if(pcs==null){ pcs=card.pz_g&&grams!=null?grams/card.pz_g:1; if(!card.pz_g) notes.push("contato come 1 pezzo"); } mult=pcs; qt=`${fcR(pcs)} pz`; }
  else if(card.per==="100 ml"){ if(ml==null){ ml=grams!=null?(card.dens?grams/card.dens:grams):pcs*(card.por_ml||card.pz_g||100); } mult=ml/100; qt=`${fcR(ml,0)} ml`; }
  else { if(grams==null){ if(ml!=null){ if(card.dens){ grams=ml*card.dens; notes.push(`densità ${String(card.dens).replace(".",",")} g/ml`); } else { grams=ml; notes.push("1 ml ≈ 1 g"); } qt=`${fcR(ml,0)} ml ≈${String(fcR(grams)).replace(".",",")} g`; }
      else { const w=card.pz_g||card.por_g; grams=pcs*(w||100); if(!w) notes.push("peso del pezzo non noto: 100 g"); qt=`${fcR(pcs)} pz = ${String(fcR(grams)).replace(".",",")} g`; } }
    else qt=`${String(fcR(grams)).replace(".",",")} g`; mult=grams/100; }
  const v=x=>x==null?null:fcR(x*mult);
  return {kcal:v(card.k),p:v(card.p),c:v(card.c),g:v(card.g),qt,notes,def:!q};
}
function fcMealNow(){ const h=new Date().getHours(); return h<10?"Colazione":h<12?"Spuntino":h<15?"Pranzo":h<19?"Spuntino":"Cena"; }
function fcLines(D){ const cards=fcCards(); let meal=D.fcMeal||fcMealNow(); const out=[];
  String(D.fcText||"").split(/\r?\n/).forEach(raw=>{ const l=raw.replace(/^[\s\-•*·]+/,"").trim(); if(!l) return;
    if(/:$/.test(l)||/^(colazione|pranzo|cena|merenda|spuntin\w*( \d+)?|snack\w*|shake\w*( serale)?|pre.?allen\w*|post.?allen\w*)$/i.test(l)){ meal=mealName(l.replace(/:$/,"")); return; }
    const {q,rest}=fcQty(l), cands=fcMatch(rest,cards), pick=D.fcPick&&D.fcPick[l], ai=D.fcAi&&D.fcAi[l];
    let card=null; if(pick==="—") card=null; else if(pick) card=(cands.find(x=>x.c.nome===pick)||{c:cards.find(c=>c.nome===pick)}).c||null; else if(ai) card=ai; else if(cands[0]&&cands[0].auto) card=cands[0].c;
    if(ai&&!pick) card=ai;
    out.push({raw:l,meal,q,rest,cands,card,calc:card?fcCalc(card,q):null}); });
  return out; }
function fcFav(){ return fcCards().filter(c=>c.src!=="base"&&(c.usi>=2||c.src==="etichetta")&&(c.por_g||c.por_ml||c.por_pz))
  .sort((a,b)=>(b.ultimo||"").localeCompare(a.ultimo||"")||(b.usi||0)-(a.usi||0)).slice(0,14); }
const fcPorTxt=c=>c.por_ml?`${fcR(c.por_ml,0)} ml`:c.por_g?`${String(fcR(c.por_g)).replace(".",",")} g`:c.por_pz?`${fcR(c.por_pz)}`:"";
function fcHtml(D){
  const tpl=st.settings.mealTpl||[];
  return `<div class="fcbar"><label class="muted xs">Pasto</label><select class="inp" id="fcMeal">${[...new Set([D.fcMeal||fcMealNow(),...MEALS])].map(x=>`<option ${x===(D.fcMeal||fcMealNow())?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
    ${tpl.length?`<div class="fcchips">${tpl.map((t,i)=>`<button type="button" class="chip tpl" data-tpl="${i}">⭐ ${esc(t.name)}</button>`).join("")}</div>`:""}
    <div class="fcchips">${fcFav().map(c=>`<button type="button" class="chip" data-fav="${esc(c.nome)}">${esc(c.nome.length>26?c.nome.slice(0,24)+"…":c.nome)} <span class="muted">${esc(fcPorTxt(c))}</span></button>`).join("")||`<span class="muted xs">I tuoi prodotti più usati compariranno qui.</span>`}</div>
    <textarea class="inp" id="fcText" rows="4" placeholder="Un alimento per riga, quantità facoltativa:&#10;40 ml baam whey&#10;2 cracker cioccolato&#10;150 g riso">${esc(D.fcText||"")}</textarea>
    <div class="row"><button type="button" class="btn" id="fcScan">📷 Codice a barre</button><button type="button" class="btn" id="fcPhoto">📸 Foto etichetta</button><button type="button" class="btn" id="fcNew">✍ Nuovo prodotto</button></div>
    <input type="file" id="fcFile" accept="image/*" capture="environment" hidden>
    <div id="fcForm"></div><div id="fcRes"></div>`;
}
function fcRender(D){
  const B=$("#fcRes"); if(!B) return; const L=fcLines(D);
  if(!L.length){ B.innerHTML=""; return; }
  const tot=k=>L.reduce((a,x)=>a+(x.calc&&x.calc[k]||0),0);
  let cur="", h="";
  L.forEach((x,i)=>{ if(x.meal!==cur){ cur=x.meal; h+=`<div class="fcmeal">${esc(cur)}</div>`; }
    if(!x.card){ h+=`<div class="fcr miss"><div class="fcn">${esc(x.raw)}</div><div class="muted xs">Non lo trovo tra le tue schede né tra gli alimenti comuni.</div>
      <div class="fcact"><button type="button" class="btn sm" data-fca="scan" data-i="${i}">📷 Codice</button><button type="button" class="btn sm" data-fca="photo" data-i="${i}">📸 Etichetta</button><button type="button" class="btn sm" data-fca="label" data-i="${i}">✍ Valori</button>${aiReady()?`<button type="button" class="btn sm" data-fca="ai" data-i="${i}">🤖 Stima</button>`:""}</div>
      ${x.cands.length?`<select class="inp" data-fcpick="${i}"><option value="">Oppure scegli…</option>${x.cands.map(c=>`<option>${esc(c.c.nome)}</option>`).join("")}</select>`:""}</div>`; return; }
    const c=x.calc, src=x.card.src==="base"?"alimento comune":x.card.src==="ai"?"stima AI":x.card.src==="storico"?"dal tuo storico":"etichetta";
    h+=`<div class="fcr"><div class="fcn">${esc(x.raw)}</div>
      <select class="inp" data-fcpick="${i}">${[x.card,...x.cands.map(z=>z.c).filter(z=>z.nome!==x.card.nome)].map(z=>`<option ${z.nome===x.card.nome?"selected":""}>${esc(z.nome)}</option>`).join("")}<option value="—">— nessuno di questi —</option></select>
      <div class="fcv"><b>${esc(c.qt)}</b> · ${fcR(c.kcal,0)??"?"} kcal · P ${c.p??"?"} · C ${c.c??"?"} · G ${c.g??"?"}</div>
      <div class="fcb"><span class="fcsrc ${x.card.src}">${src}</span>${c.notes.map(n=>`<span class="fcnote ${/porzione|non noto|1 ml|1 pezzo/.test(n)?"warn":""}">${esc(n)}</span>`).join("")}</div></div>`; });
  const miss=L.filter(x=>!x.card).length;
  h+=`<p class="fdtot"><b>${fcR(tot("kcal"),0)} kcal</b> · P ${fcR(tot("p"))} · C ${fcR(tot("c"))} · G ${fcR(tot("g"))}${miss?` <span class="warn xs">· ${miss} da completare</span>`:""}</p>
    <div class="row"><button type="button" class="btn acc" id="fcAdd" ${miss?"disabled":""}>➕ Aggiungi al giorno</button><button type="button" class="btn" id="fcTpl">⭐ Salva come pasto preferito</button></div><div id="fcTplBox"></div>`;
  B.innerHTML=h; fcBindRes(D);
}
let fcT=null;
function fcBind(D,date){
  const ta=$("#fcText");
  ta.oninput=()=>{ D.fcText=ta.value; clearTimeout(fcT); fcT=setTimeout(()=>fcRender(D),300); };
  $("#fcMeal").onchange=e=>{ D.fcMeal=e.target.value; fcRender(D); };
  document.querySelectorAll("#sheetBody [data-fav]").forEach(b=>b.onclick=()=>{ const c=fcCards().find(z=>z.nome===b.dataset.fav); if(!c) return;
    ta.value=(ta.value.trim()?ta.value.trim()+"\n":"")+`${fcPorTxt(c)} ${c.nome}`.trim(); ta.oninput(); });
  document.querySelectorAll("#sheetBody [data-tpl]").forEach(b=>b.onclick=()=>{ const t=(st.settings.mealTpl||[])[+b.dataset.tpl]; if(!t) return;
    ta.value=(ta.value.trim()?ta.value.trim()+"\n":"")+t.text; ta.oninput(); });
  $("#fcScan").onclick=()=>fcScan(D,null);
  $("#fcPhoto").onclick=()=>{ D.fcFor=null; $("#fcFile").click(); };
  $("#fcNew").onclick=()=>fcForm(D,{});
  $("#fcFile").onchange=e=>{ const f=e.target.files[0]; e.target.value=""; if(f) fcPhoto(D,f); };
  fcRender(D);
}
function fcBindRes(D){
  const B=$("#fcRes"), L=fcLines(D);
  B.querySelectorAll("[data-fcpick]").forEach(sel=>sel.onchange=()=>{ const x=L[+sel.dataset.fcpick]; (D.fcPick ||= {})[x.raw]=sel.value||undefined; if(!sel.value) delete D.fcPick[x.raw]; fcRender(D); });
  B.querySelectorAll("[data-fca]").forEach(b=>b.onclick=async()=>{ const x=L[+b.dataset.i], a=b.dataset.fca; D.fcFor=x.raw;
    if(a==="scan") fcScan(D,x); else if(a==="photo") $("#fcFile").click(); else if(a==="label") fcForm(D,{nome:x.rest,alias:x.rest});
    else if(a==="ai"){ b.textContent="…"; const j=await fdAI("ai",x.raw); const al=j&&!j.err&&j.pasti&&j.pasti[0]&&(j.pasti[0].alimenti||[])[0];
      if(!al){ b.textContent="🤖 Non riesco"; return; }
      (D.fcAi ||= {})[x.raw]={nome:al.nome||x.rest,k:fdNum(al.kcal),p:fdNum(al.p),c:fdNum(al.c),g:fdNum(al.g),src:"ai",names:[]};
      fcRender(D); } });
  const add=$("#fcAdd"); if(add) add.onclick=()=>{
    L.forEach(x=>{ if(!x.card) return; const c=x.calc, src=x.card.src==="base"||x.card.src==="ai"||x.card.stim?"stimato":"diario", aff=x.card.src==="ai"?"Bassa":(x.card.src==="base"||x.card.stim||c.def)?"Media":"Alta";
      let m=D.meals.find(z=>z.pasto===x.meal); if(!m){ m={pasto:x.meal,foods:[],desc:"",kcal:0,p:0,c:0,g:0,src:"diario"}; D.meals.push(m); }
      m.foods.push({nome:x.card.nome,q:c.qt,kcal:c.kcal,p:c.p,c:c.c,g:c.g,aff,src});
      ["kcal","p","c","g"].forEach(k=>m[k]=fcR((m[k]||0)+(c[k]||0)));
      m.desc=m.foods.map(f=>`${f.nome} ${f.q}`).join("; "); });
    D.tot=null; D.fcText=""; D.fcPick={}; D.fcAi={}; D.rawText=""; D.complete=false;
    if(!D.meals.length) return; openDiary(D.date); };
  const tp=$("#fcTpl"); if(tp) tp.onclick=()=>{ $("#fcTplBox").innerHTML=`<div class="row"><input class="inp" id="fcTplName" placeholder="Nome, es. Colazione solita" value="${esc((D.fcMeal||fcMealNow())+" solita")}"><button type="button" class="btn" id="fcTplOk">Salva</button></div>`;
    $("#fcTplOk").onclick=()=>{ const n=$("#fcTplName").value.trim(); if(!n) return; const text=String(D.fcText||"").trim(); if(!text) return;
      st.settings.mealTpl=[...(st.settings.mealTpl||[]).filter(t=>t.name!==n),{name:n,text}]; save(); openDiary(D.date); }; };
}
/* nuova scheda: modulo (precompilato da codice a barre o foto) */
function fcForm(D,v){
  const F=$("#fcForm"); if(!F) return;
  F.innerHTML=`<div class="card fcform"><h3>${v.ean?"Prodotto dal codice a barre":v.fromPhoto?"Etichetta letta dalla foto":"Nuovo prodotto"}</h3>${v.msg?`<p class="muted xs">${esc(v.msg)}</p>`:""}
    <label class="fdnl"><span class="muted xs">Nome</span><input class="inp" id="ffN" value="${esc(v.nome||"")}"></label>
    <label class="fdnl"><span class="muted xs">Come lo scrivi di solito (alias, separati da ;)</span><input class="inp" id="ffA" value="${esc(v.alias||"")}"></label>
    <div class="fcbar"><span class="muted xs">Valori per</span><select class="inp" id="ffPer"><option ${v.per!=="100 ml"?"selected":""}>100 g</option><option ${v.per==="100 ml"?"selected":""}>100 ml</option></select></div>
    <div class="fdv"><label><span>kcal</span><input class="inp" inputmode="decimal" id="ffK" value="${v.k??""}"></label><label><span>Proteine</span><input class="inp" inputmode="decimal" id="ffP" value="${v.p??""}"></label><label><span>Carbo</span><input class="inp" inputmode="decimal" id="ffC" value="${v.c??""}"></label><label><span>Grassi</span><input class="inp" inputmode="decimal" id="ffG" value="${v.g??""}"></label></div>
    <div class="fdv fd3"><label><span>Porzione solita (g)</span><input class="inp" inputmode="decimal" id="ffPor" value="${v.por_g??""}"></label><label><span>Polvere: ml del misurino</span><input class="inp" inputmode="decimal" id="ffMl" value="${v.dml??""}" placeholder="es. 30"></label><label><span>= grammi</span><input class="inp" inputmode="decimal" id="ffMg" value="${v.dg??""}" placeholder="es. 12,5"></label></div>
    <p class="muted xs">Per le polveri: misura col misurino e pesa una volta (es. 30 ml = 12,5 g) così i ml diventano grammi. Per un pezzo (barretta, uovo) metti il peso nella porzione.</p>
    <div class="row"><button type="button" class="btn acc" id="ffSave">Salva scheda</button><button type="button" class="btn" id="ffX">Annulla</button></div><p class="muted" id="ffMsg"></p></div>`;
  F.scrollIntoView({behavior:"smooth",block:"start"});
  $("#ffX").onclick=()=>{ F.innerHTML=""; };
  $("#ffSave").onclick=()=>{ const n=x=>fdNum($(x).value), nome=$("#ffN").value.trim(); if(!nome||n("#ffK")==null){ $("#ffMsg").textContent="Servono almeno nome e kcal."; return; }
    const ml=n("#ffMl"), g=n("#ffMg"), dens=ml&&g?Math.round(g/ml*1000)/1000:(v.dens||null), por=n("#ffPor");
    const card={nome,alias:$("#ffA").value.split(";").map(x=>x.trim()).filter(Boolean),per:$("#ffPer").value,k:n("#ffK"),p:n("#ffP"),c:n("#ffC"),g:n("#ffG"),dens,por_g:por,por_ml:ml&&!por?ml:null,pz_g:null,ean:v.ean||"",src:"etichetta",fonte:v.ean?"codice a barre (Open Food Facts)":v.fromPhoto?"foto etichetta":"etichetta",usi:0,ultimo:ymdLocal(Date.now())};
    st.foodCards=[...(st.foodCards||[]).filter(c=>fnorm(c.nome)!==fnorm(nome)),card]; (st.cardQ ||= []).push(card); save(); flushCards();
    if(D.fcFor){ (D.fcPick ||= {})[D.fcFor]=nome; D.fcFor=null; }
    F.innerHTML=`<p class="okmsg">✓ Scheda "${esc(nome)}" salvata: la riconosco anche le prossime volte.</p>`; fcRender(D); };
}
/* codice a barre: fotocamera (BarcodeDetector) oppure codice scritto; valori da Open Food Facts */
async function fcScan(D,line){
  const ov=document.createElement("div"); ov.className="scanov";
  const BD=window.BarcodeDetector;
  ov.innerHTML=`<div class="scanbox">${BD?`<video playsinline muted></video><div class="scanline"></div>`:""}<p>${BD?"Inquadra il codice a barre":"Questo browser non legge i codici dalla fotocamera: scrivi il numero sotto il codice a barre."}</p>
    <div class="row"><input class="inp" id="scCode" inputmode="numeric" placeholder="Numero del codice (8–13 cifre)"><button type="button" class="btn acc" id="scGo">Cerca</button></div><button type="button" class="btn" id="scX">Chiudi</button><p class="muted" id="scMsg"></p></div>`;
  document.body.appendChild(ov);
  let stream=null, stop=false;
  const close=()=>{ stop=true; if(stream) stream.getTracks().forEach(t=>t.stop()); ov.remove(); };
  ov.querySelector("#scX").onclick=close;
  const look=async code=>{ stop=true; const msg=ov.querySelector("#scMsg"); msg.textContent=`Cerco ${code}…`;
    const known=fcCards().find(c=>c.ean&&String(c.ean)===String(code)); if(known){ close(); if(line){ (D.fcPick ||= {})[line.raw]=known.nome; fcRender(D); } else { const ta=$("#fcText"); ta.value=(ta.value.trim()?ta.value.trim()+"\n":"")+`${fcPorTxt(known)} ${known.nome}`.trim(); ta.oninput(); } return; }
    try{ const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_it,product_name_en,brands,nutriments,serving_quantity,serving_size,quantity`); const j=await r.json();
      const p=j&&j.status===1&&j.product; const nu=p&&p.nutriments||{};
      if(!p||nu["energy-kcal_100g"]==null&&nu["energy-kcal_100ml"]==null){ close(); D.fcFor=line?line.raw:null; fcForm(D,{nome:line?line.rest:"",alias:line?line.rest:"",ean:code,msg:`Il codice ${code} non è su Open Food Facts (o non ha i valori): inseriscili dall'etichetta oppure usa 📸 Foto etichetta.`}); return; }
      const ml=nu["energy-kcal_100g"]==null; const v=k=>nu[`${k}_${ml?"100ml":"100g"}`];
      close(); D.fcFor=line?line.raw:null;
      fcForm(D,{nome:[p.brands&&p.brands.split(",")[0],p.product_name_it||p.product_name||p.product_name_en].filter(Boolean).join(" "),alias:line?line.rest:"",per:ml?"100 ml":"100 g",k:fcR(v("energy-kcal")),p:fcR(v("proteins")),c:fcR(v("carbohydrates")),g:fcR(v("fat")),por_g:p.serving_quantity?fcR(+p.serving_quantity):"",ean:code,msg:`Da Open Food Facts${p.serving_size?` · porzione indicata: ${p.serving_size}`:""}. Controlla i valori con l'etichetta e salva.`});
    }catch(e){ msg.textContent="Serve la rete per cercare il codice. Puoi inserire i valori a mano con ✍ Nuovo prodotto."; stop=false; } };
  ov.querySelector("#scGo").onclick=()=>{ const c=ov.querySelector("#scCode").value.replace(/\D/g,""); if(c.length>=8) look(c); };
  if(!BD) return;
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}); const vid=ov.querySelector("video"); vid.srcObject=stream; await vid.play();
    const det=new BD({formats:["ean_13","ean_8","upc_a","upc_e","code_128"]});
    const tick=async()=>{ if(stop) return; try{ const r=await det.detect(vid); if(r&&r[0]&&r[0].rawValue){ look(r[0].rawValue); return; } }catch(e){} setTimeout(tick,250); }; tick();
  }catch(e){ ov.querySelector("#scMsg").textContent="Fotocamera non disponibile: scrivi il numero del codice."; }
}
/* foto dell'etichetta letta dall'AI (Gemini Flash-Lite, poi gli altri modelli): una volta per prodotto */
async function fcPhoto(D,file){
  const line=D.fcFor?fcLines(D).find(x=>x.raw===D.fcFor):null;
  if(!aiReady()){ fcForm(D,{nome:line?line.rest:"",alias:line?line.rest:"",msg:"Per leggere la foto serve una chiave Gemini o OpenRouter in ⚙. Intanto puoi copiare i valori dall'etichetta qui."}); return; }
  const F=$("#fcForm"); if(F) F.innerHTML=`<p class="muted">Leggo l'etichetta…</p>`;
  const img=await new Promise(res=>{ const im=new Image(); im.onload=()=>{ const k=Math.min(1,1280/Math.max(im.width,im.height)), c=document.createElement("canvas"); c.width=im.width*k; c.height=im.height*k; c.getContext("2d").drawImage(im,0,0,c.width,c.height); res({mime:"image/jpeg",data:c.toDataURL("image/jpeg",0.85).split(",")[1]}); URL.revokeObjectURL(im.src); }; im.src=URL.createObjectURL(file); });
  const sys='Leggi la tabella nutrizionale nella foto di un\'etichetta. Rispondi SOLO con JSON: {"nome":"marca e prodotto se visibili","per":"100 g" o "100 ml","kcal":n,"p":n,"c":n,"g":n,"porzione_g":n o null,"porzione_testo":"come scritta" o null}. Usa la colonna per 100 g/100 ml; se c\'è solo quella per porzione, ricava i valori per 100 g dalla porzione. Non inventare: null se non leggibile.';
  let res=null; const errs=[];
  if(st.settings.apiKey){ res=await callGemini(sys,"Estrai i valori.",null,img,{models:["gemini-flash-lite-latest","gemini-2.5-flash-lite"]}); if(!res.out){ errs.push(res.err); res=null; } }
  if(!res&&st.settings.orKey){ res=await callOpenRouter(sys,"Estrai i valori.",null,img); if(!res.out){ errs.push(res.err); res=null; } }
  let j=null; try{ j=res&&JSON.parse(res.out.replace(/^[\s\S]*?(\{)/,"$1").replace(/\}[^}]*$/,"}")); }catch(e){}
  fcForm(D,j?{nome:j.nome||(line?line.rest:""),alias:line?line.rest:"",per:j.per==="100 ml"?"100 ml":"100 g",k:j.kcal,p:j.p,c:j.c,g:j.g,por_g:j.porzione_g||"",fromPhoto:true,msg:`Letta dalla foto${j.porzione_testo?` · porzione: ${j.porzione_testo}`:""}. Controlla i numeri prima di salvare.`}
    :{nome:line?line.rest:"",alias:line?line.rest:"",msg:`Non sono riuscito a leggere la foto (${errs.join("; ")||"risposta non valida"}). Copia i valori dall'etichetta qui.`});
}
/* salvataggio delle schede nuove in alimentazione/schede.csv */
let cardFlushing=null;
async function flushCards(){
  if(cardFlushing) return cardFlushing;
  cardFlushing=(async()=>{ if(!(st.cardQ||[]).length||!st.settings.ghToken||!st.settings.ghRepo) return false;
    try{ const path="alimentazione/schede.csv"; const r=await gh(path); let rows=[],sha=null,head=[],eol="\r\n";
      if(r.ok){ const j=await r.json(), txt=unb64(j.content); rows=parseCSV(txt); sha=j.sha; head=(txt.split(/\r?\n/)[0]||"").split(",").map(x=>x.trim()).filter(Boolean); eol=txt.includes("\r\n")?"\r\n":"\n"; } else if(r.status!==404) throw r.status;
      st.cardQ.forEach(c=>{ rows=rows.filter(x=>fnorm(x.nome)!==fnorm(c.nome));
        rows.unshift({nome:c.nome,alias:(c.alias||[]).join("; "),per:c.per,kcal:c.k,proteine_g:c.p??"",carboidrati_g:c.c??"",grassi_g:c.g??"",densita_g_ml:c.dens??"",pezzo_g:c.pz_g??"",porzione:c.por_g?`${c.por_g} g`:c.por_ml?`${c.por_ml} ml`:"",porzione_g:c.por_g??"",porzione_ml:c.por_ml??"",porzione_pz:"",usi:c.usi||0,fonte:c.fonte||"etichetta",ultimo:c.ultimo||"",codice:c.ean||""}); });
      const base=["nome","alias","per","kcal","proteine_g","carboidrati_g","grassi_g","densita_g_ml","pezzo_g","porzione","porzione_g","porzione_ml","porzione_pz","usi","fonte","ultimo","codice"];
      const H=[...head,...base.filter(k=>!head.includes(k))];
      const p=await gh(path,{method:"PUT",body:JSON.stringify({message:"Schede alimenti: "+st.cardQ.map(c=>c.nome).join(", "),content:b64(toCSV(H,rows,eol)),...(sha?{sha}:{})})}); if(!p.ok) throw p.status;
      st.cardQ=[]; save(); if(food) food.schede=rows; return true;
    }catch(e){ return false; } })();
  try{ return await cardFlushing; } finally{ cardFlushing=null; }
}
window.addEventListener("online",()=>{ if((st.cardQ||[]).length) flushCards(); });
if((st.cardQ||[]).length) setTimeout(flushCards,5000);
