/* Gym Coach — registro allenamenti con video, chat e consigli sul carico.
   Tutti i dati restano nel browser (localStorage) del telefono. */

const LS = "gymcoach_v1";
const APP_VERSION = "46";
const $ = s => document.querySelector(s);

/* ---------------- stato ---------------- */
function defState(){
  return {
    cyclePos:-1,          // indice nel CYCLE dell'ultimo passaggio completato
    cur:null,             // sessione in corso
    history:[],           // sessioni archiviate
    sugg:{},              // carico consigliato per la prossima volta, per esercizio
    ui:{videoHidden:false},
    settings:{provider:"gemini",orKey:"",orModel:"moonshotai/kimi-k2.6:free",apiKey:"",model:"gemini-3.8-flash",inc:{db:2,bb:1.25,plate:1.25,cable:2.5,machine:2.5},incLb:{db:5,bb:2.5,plate:2.5,cable:5,machine:10},defUnit:"kg",think:"low",ghToken:"",ghRepo:"valeriowork360/GymCoach-dati"},
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
Object.entries(st.custom).forEach(([id,e])=>{ if(!EX[id]) EX[id]=e; });
/* scheda della sessione corrente, con eventuali esercizi sostituiti */
function mergeSugg(g){ Object.entries(g||{}).forEach(([id,x])=>{ const o=st.sugg[id]; if(!o || (x.date||0)>(o.date||0)) st.sugg[id]=x; }); }
function mergeNotes(n){ if(!n) return; st.exNotes={...(st.exNotes||{}),...n}; }
function mergeCustom(c){ Object.entries(c||{}).forEach(([id,e])=>{ if(!st.custom[id]) st.custom[id]=e; if(!EX[id]) EX[id]=e; }); }
function curList(){
  const subs=(st.cur&&st.cur.subs)||{};
  return SESSIONS[st.cur.session].map((x,k)=>subs[k]&&EX[subs[k]]?[subs[k],...x.slice(1)]:x);
}
function origId(k){ return SESSIONS[st.cur.session][k][0]; }
function item(){ return st.cur ? curList()[st.cur.exIdx] : null; }
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
  if(set.rir<RIR_MIN) return "heavy";
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
    if(v==="ok") w=w0;
  }
  let why;
  if(v==="ok") why=`<span class="ok">✔ Carico giusto</span>: ${set.reps} rip nel range ${lo}–${hi} a RIR ${set.rir}.`;
  else if(v==="heavy") why=`<span class="down">⬇ Troppo pesante</span>: ${set.rir<RIR_MIN?`RIR ${set.rir} è troppo vicino al cedimento`:`${set.reps} rip sono sotto il minimo di ${lo}`}.`;
  else why=`<span class="up">⬆ Troppo leggero</span>: ${set.rir>RIR_MAX?`RIR ${set.rir}, ti restavano troppe ripetizioni`:`${set.reps} rip superano il massimo di ${hi}`}.`;
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
  const last=ws[ws.length-1], u=unitOf(last), inc=incFor(id,u), w0=valOf(last);
  const mk=(v,txt)=>({v,u,kg:v==null?null:toKg(v,u),txt});
  if(!w0) return mk(null,"Prossima volta punta ad aggiungere ripetizioni mantenendo RIR 2–3.");
  if(ws.every(s=>s.reps>=hi && s.rir>=RIR_MIN)){
    const prevOk = prevSets && prevSets.length && Math.abs(topOf(prevSets).kg-topOf(ws).kg)/topOf(ws).kg<0.03 && atTop(prevSets,hi);
    if(prevOk) return mk(w0+inc,`Seconda seduta di fila al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta sali a ${wTxt(w0+inc,u)}**.`);
    return mk(w0,`Al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta resta a ${wTxt(w0,u)}** e conferma; se lo rifai, poi si sale a ${wTxt(w0+inc,u)}.`);
  }
  const v=judge(it,last);
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
  take(/\brir\s*(?:di|=|:)?\s*(\d)\b/,m=>rir=+m[1]) || take(/\b(\d)\s*rir\b/,m=>rir=+m[1]) || take(/@\s*(\d)\b/,m=>rir=+m[1]) || take(/\b(\d)\s*(?:in canna|di riserva|buffer)/,m=>rir=+m[1]);
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
  let c = focusV!=null ? inU(focusV,focusU||u) : g ? inU(g.v,g.u) : cur.length ? inU(valOf(cur[cur.length-1]),unitOf(cur[cur.length-1])) : null;
  if(c==null && p){ const ls=p.sets.filter(x=>x.kg!=null&&!x.extra); if(ls.length) c=inU(valOf(ls[ls.length-1]),unitOf(ls[ls.length-1])); }
  if(c==null) c=u==="lb"?45:20;
  c=R(c);
  const step=u==="kg"&&inc<2.5&&Math.abs(c/2.5-Math.round(c/2.5))<1e-6?2.5:inc;   // es. manubri 7,5 → 5 / 10
  const arr=[]; for(let k=-12;k<=12;k++){ const v=R(c+k*step); if(v>0) arr.push(v); }
  return `<div class="qw" data-qex="${st.cur.exIdx}|${id}"><button type="button" class="qu" data-qunit="${u==="lb"?"kg":"lb"}" title="Passa a ${u==="lb"?"chili":"libbre"}">${u} ⇄</button>${arr.map(v=>`<button type="button" class="${v===c?"acc":""}" data-qw="${v}|${u}|${st.cur.exIdx}|${id}">${kgTxt(v)}</button>`).join("")}</div>`;
}
/* scorre la riga dei pesi in modo che il consigliato sia al centro */
function centerQW(row){ const a=row.querySelector(".acc"); if(!a) return; const ra=a.getBoundingClientRect(), rr=row.getBoundingClientRect(); row.scrollLeft+=ra.left-rr.left-rr.width/2+ra.width/2; }
$("#chat").addEventListener("click",ev=>{
  const qu=ev.target.closest("[data-qunit]");
  if(qu && st.cur){ const row=qu.closest(".qw"), [k,id]=row.dataset.qex.split("|");
    if(+k!==st.cur.exIdx || item()[0]!==id) return sys("Quei tasti erano per un altro esercizio: usa quelli dell'ultimo messaggio.");
    (st.cur.unitPref ||= {})[st.cur.exIdx]=qu.dataset.qunit; save(); drawChips(); drawExbar();
    row.outerHTML=quickWeights(id); document.querySelectorAll('#chat .qw').forEach(r=>{ if(r.dataset.qex===`${k}|${id}`) centerQW(r); }); return; }
  const b=ev.target.closest("[data-qw]"); if(!b||!st.cur) return;
  const [v,u,k,id]=b.dataset.qw.split("|");
  if(+k!==st.cur.exIdx || item()[0]!==id){ sys("Quei tasti erano per un altro esercizio: usa quelli dell'ultimo messaggio."); return; }
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
  if(p){ const ws=p.sets.filter(x=>!x.extra);
    t+=`<div class="is warn">Storico — ${dateTxt(p.date)}${p.session?` · ${esc(p.session)}`:""}</div>`;
    t+=`<table class="mt it"><tr><th>Serie</th><th>Carico</th><th>Reps</th><th>RIR</th></tr>${ws.map((x,k)=>`<tr><td>${k+1}</td><td class="wv">${esc(setWB(x))}</td><td class="wv">${x.rr?esc(x.rr):x.reps??"?"}</td><td class="wv">${x.rt?esc(x.rt):x.rir??"?"}</td></tr>`).join("")}</table>`;
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
  if(done.length) t+=`<div style="margin-top:6px"><b>Già fatte ${done.length}/${n} serie.</b></div>`;
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
    if(pend.need==="rir"){ const v=p.rir??(only?+only[1].replace(",","."):null); if(v!=null && v<=10) return logSet({...pend,rir:v}); }
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

function logSet(p){
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
  const extra = ws.length>=n;
  const set={kg:toKg(val,u),...(u==="lb"?{u:"lb",v:val}:{}),reps:p.reps,rir:p.rir,t:Date.now(),...(extra?{extra:true}:{})};
  sets.push(set); save();
  const c=coachSet(it,set), num=ws.length+1, conv=u==="lb"?` <span class="muted">(≈${kgTxt(Math.round(set.kg*10)/10)} kg)</span>`:"";
  let txt = extra ? `Serie extra registrata: ${setW(set)} × ${set.reps}, RIR ${set.rir} <span class="muted">(non conta nelle serie allenanti)</span>.`
                  : `Serie ${num}/${n}: <b>${setW(set)} × ${set.reps}</b> <span class="muted">${modeOf(id)}</span>${conv}, RIR ${set.rir}.<br>${c.why}`;
  const lastOfEx = !extra && num>=n;
  if(!extra && !lastOfEx){
    if(c.v==="ok") txt+=` Serie ${num+1}: <b>resta a ${wTxt(val,u)}</b>.`;
    else if(c.w!=null) txt+=` Serie ${num+1}: <b>${c.v==="heavy"?"scendi":"sali"} a ${wTxt(c.w,u)}</b>.`;
    txt+=`<br>Recupero ${restTxt(rest)}.`;
    txt+=quickWeights(id, c.v==="ok"||c.w==null?val:c.w, u);
  }
  bot(txt);
  if(lastOfEx){
    const nt=nextTime(it,setsOf(i),(perfsOf(id)[0]||{}).sets);
    if(nt){ (st.cur.prevSugg ||= {})[id] = st.sugg[id] ?? null; st.sugg[id]={kg:nt.kg,...(nt.u==="lb"?{u:"lb",v:nt.v}:{}),txt:nt.txt,date:Date.now()}; bot(`<b>${esc(EX[id].n)} completato.</b> ${md(nt.txt)}`); }
    afterExercise(i,rest);
  } else if(!extra) startTimer(rest);
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
function logTimed(){
  const it=item(), e=exOf(it), [id,n,sec,,rest]=it, i=st.cur.exIdx, ws=workSets(i);
  stopTimer();
  const extra=ws.length>=n, num=ws.length+1;
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
    const s=st.cur.log[prev].pop(); restoreSugg(curList()[prev][0]); save(); bot(`Annullata: ${esc(EX[curList()[prev][0]].n)} — ${esc(setTxt(s))}.`);
    return goEx(prev);
  }
  const s=sets.pop(); restoreSugg(item()[0]); st.cur.pending=null; save(); stopTimer();
  bot(`Annullata l'ultima ${s.sec!=null?"registrazione":"serie"} (${esc(setTxt(s))}).`);
  drawExbar(); drawChips();
}

function restoreSugg(id){
  const ps=st.cur.prevSugg;
  if(ps && id in ps){ if(ps[id]==null) delete st.sugg[id]; else st.sugg[id]=ps[id]; delete ps[id]; }
}
function goEx(k,auto){
  const list=curList();
  if(k<0) return bot("Sei già al primo esercizio.");
  if(k>=list.length) return bot("Era l'ultimo esercizio. Tocca <b>Fine sessione</b> per archiviare.");
  st.cur.exIdx=k; st.cur.vid=0; st.cur.pending=null; save();
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
async function callGemini(sys,prompt,onDelta,img){
  const key=st.settings.apiKey; if(!key) return {err:"manca la chiave Gemini"};
  const models=[...new Set([st.settings.model||"gemini-3.8-flash","gemini-3.8-flash","gemini-flash-latest","gemini-3.6-flash","gemini-2.5-flash"])];
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
      if(r.status===429){ clearTimeout(to); return {err:"limite gratuito di Gemini raggiunto per ora"}; }
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
  if(left<-300) stopTimer();
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
    $("#frame").innerHTML=`<div style="display:grid;place-items:center;text-align:center;color:var(--mut);padding:16px">Nessun video salvato per questo esercizio.<br><a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Cerca “${esc(e.n)}” su YouTube ↗</a></div>`;
    $("#player").classList.remove("collapsed");
    $("#vchips").innerHTML=`<span class="muted" style="padding:4px 2px">Esercizio personalizzato</span>`; return;
  }
  const vi=clamp(st.cur.vid||0,0,e.v.length-1), [id]=e.v[vi];
  const multi = st.ui.vidLayout!=="single" && e.v.length>1;
  $("#player").classList.toggle("collapsed",!!st.ui.videoHidden);
  $("#player").classList.toggle("small",!st.ui.videoHidden && st.ui.vsize!=="l");
  applyVH();
  $("#frame").classList.toggle("multi",multi);
  $("#player").classList.toggle("multi",multi);
  if(st.ui.videoHidden){ destroyGrid(); destroyExerciseVideo(); }
  else if(multi){ destroyExerciseVideo(); buildGrid(e,vi); }
  else { destroyGrid(); showExerciseVideo(id); }
  const sizeLbl = st.ui.videoHidden ? "▣ Mostra video" : st.ui.vsize==="l" ? "▭ Video piccolo" : "☐ Solo chat";
  $("#vchips").innerHTML = `<button class="vchip ghost size" id="vSize">${sizeLbl}</button>` + e.v.map(([vid,ch],k)=>`<button class="vchip ${k===vi&&!st.ui.videoHidden?"on":""}" data-k="${k}">${multi?"":"▶ "}${esc(ch)}</button>`).join("")
    + (e.v.length>1?`<button class="vchip ghost" id="vLayout">${multi?"▢ Uno alla volta":"▦ Affiancati"}</button>`:"")
    + (st.ui.videoHidden||st.ui.vsize==="l"?"":`<button class="vchip ghost" id="vBig">▢ Video grande</button>`)
    + `<a class="vchip ghost" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--mut)">Apri in YouTube ↗</a>`;
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
  g.players[k]=new YT.Player("ytG"+k,{width:"100%",height:"100%",videoId:g.ids[k],
    playerVars:{autoplay:1,mute:1,playsinline:1,rel:0,modestbranding:1},
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
  yv=new YT.Player("ytV",{width:"100%",height:"100%",videoId:id,
    playerVars:{autoplay:1,mute:1,playsinline:1,rel:0,modestbranding:1},
    events:{
      onReady:e=>{ yvReady=true; yvId=id; if(yvWant&&yvWant!==id){ yv.loadVideoById(yvWant); yvId=yvWant; } applyVolV(); try{ e.target.playVideo(); }catch(err){} },
      onStateChange:e=>{ if(e.data===YT.PlayerState.ENDED){ yv.seekTo(0); yv.playVideo(); } }
    }});
}
function destroyExerciseVideo(){ if(!yv) return; try{ yv.destroy(); }catch(e){} yv=null; yvReady=false; yvId=null; $("#frame").innerHTML=""; }

function ensureMusic(){
  const m=st.ui.music; if(!apiOk()||ym||!m.src) return;
  const pv={playsinline:1,rel:0,modestbranding:1}; if(m.src.list){ pv.listType="playlist"; pv.list=m.src.list; }
  $("#mPh").hidden=true;
  ym=new YT.Player("ytM",{width:"100%",height:"100%",videoId:m.src.list?undefined:m.src.id,playerVars:pv,
    events:{
      onReady:()=>{ ymReady=true; ym.setVolume(m.vol); if(ymWant) ym.playVideo(); drawMusic(); },
      onStateChange:e=>{ const S=YT.PlayerState;
        if(e.data===S.ENDED && m.loop){ if(m.src&&m.src.list) ym.playVideoAt(0); else { ym.seekTo(0); ym.playVideo(); } return; }
        ymPlaying=(e.data===S.PLAYING||e.data===S.BUFFERING);
        if(e.data===S.PLAYING){ ymWant=false; noteTitle(); keepAwake(); }
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
  const m=st.ui.music; m.src=src; m.raw=raw.trim(); m.title=""; save();
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
setInterval(()=>{ if(!document.hidden) drawSeek(); },1000);
document.querySelectorAll("[data-sk]").forEach(b=>b.onclick=()=>{ if(!ym||!ymReady) return; try{ const t=Math.max(0,(ym.getCurrentTime()||0)+(+b.dataset.sk)); ym.seekTo(t,true); }catch(e){} setTimeout(drawSeek,200); });
$("#mPos").addEventListener("input",()=>{ seekDrag=true; drawSeek(); });
$("#mPos").addEventListener("change",()=>{ seekDrag=false; try{ ym.seekTo(+$("#mPos").value,true); }catch(e){} setTimeout(drawSeek,200); });
$("#mMore").onclick=()=>{ $("#mPanel").hidden=!$("#mPanel").hidden; drawMusic(); if(!$("#mPanel").hidden) loadDuetto(); };
/* libreria di Duetto: gli stessi autori YouTube, con i video più recenti (aggiornati da Duetto ogni 8 ore) */
const DUETTO_URL="https://valeriowork360.github.io/duetto/videos.json";
let duetto=null, dlTab="new";
function dlCache(){ try{ return JSON.parse(localStorage.getItem("gc_duetto")||"null"); }catch(e){ return null; } }
async function loadDuetto(){
  if(!duetto) duetto=dlCache(); drawDuetto();
  if(duetto && duetto._t && Date.now()-duetto._t<30*60e3) return;
  try{ const r=await fetch(DUETTO_URL+"?t="+Date.now(),{cache:"no-store"}); if(!r.ok) throw 0; const j=await r.json(); j._t=Date.now(); duetto=j;
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
  const big=!isTimeIt(it) && (lo>8||hi>12) ? `<span class="rng">Range ${lo}–${hi} rip.</span>` : "";
  $("#exbar").innerHTML=`<div class="nm">${esc(e.n)}${big}<span class="rx">${rx}</span></div><div class="dots">${dots}</div>`;
  drawTop();
}
function drawChips(){
  const c=$("#chips"), pend=st.cur&&st.cur.pending;
  let html="";
  if(pend && pend.need==="unit") html=`<button class="chip acc" data-say="${pend.alt}">Sì, ${wTxt(pend.kg,pend.alt)}</button><button class="chip" data-say="${pend.unit}">No, ${wTxt(pend.kg,pend.unit)}</button>`;
  else if(pend && pend.need==="rir") html=[0,1,2,3,4,5,6].map(v=>`<button class="chip ${v>=RIR_MIN&&v<=RIR_MAX?"acc":""}" data-say="RIR ${v}">RIR ${v}</button>`).join("");
  else if(pend && pend.need==="reps"){ const [, ,lo,hi]=item(); for(let v=1;v<=Math.max(30,hi+10);v++) html+=`<button class="chip ${v>=lo&&v<=hi?"acc":""}" data-say="${v} rip">${v}</button>`; }
  else {
    const list=curList(), allDone=list.every((x,k)=>workSets(k).length>=x[1]), it=item();
    html=(isTimeIt(it)?`<button class="chip acc" data-cmd="hold">▶ Avvia ${holdTxt(it)}</button><button class="chip acc" data-cmd="done">✓ Fatto</button>`:"")
      +`<button class="chip" data-cmd="undo">↶ Annulla</button>`
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
  c.querySelectorAll("[data-cmd]").forEach(b=>b.onclick=()=>{ unlockAudio(); ({unit:toggleUnit,swap:()=>openSwap(),hold:startHold,done:logTimed,undo:undoSet,next:()=>goEx(st.cur.exIdx+1),hist:showHistoryEx,list:openList,end:finishSession})[b.dataset.cmd](); });
}
function drawChat(){ $("#chat").innerHTML=""; (st.cur.chat||[]).forEach(drawMsg); }

function render(){
  if(st.cur){
    $("#home").hidden=true; $("#workout").hidden=false;
    drawTop(); drawVideo(); drawExbar(); drawChat(); drawChips(); drawMusic();
    const tm=st.cur.timer;
    if(tm && tm.end>Date.now()-300000 && !(tm.hold && tm.end<Date.now())){ tEnd=tm.end; tTot=tm.tot; tOpts={label:tm.label,sideAt:tm.sideAt,hold:tm.hold}; beeped=tEnd<Date.now(); sideBeeped=!!tm.sideAt && (tEnd-Date.now())/1000<=tm.sideAt; $(".t-lab").textContent=tm.label||"Recupero"; $("#timer").hidden=false; clearInterval(tInt); tick(); tInt=setInterval(tick,250); }
    keepAwake();
  } else { $("#workout").hidden=true; $("#home").hidden=false; stopTimer(); drawTop(); drawHome(); }
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
    <h3 class="sec">Recupero attivo <span class="muted">· fuori dal ciclo</span></h3>
    <div class="grid">${(typeof EXTRA_SESSIONS!=="undefined"?EXTRA_SESSIONS:[]).map(s=>`<button class="sbtn alt" data-s="${s}"><b>${s}</b><span>${cnt(s)}</span></button>`).join("")}</div>
    <div class="card"><h3>Come funziona</h3><p class="muted" style="margin:0">Durante ogni esercizio vedi i suoi video. A fine serie scrivi o detta, per esempio <i>24 kg 9 rip RIR 2</i>: registro la serie, ti dico se il carico è giusto, alto o basso, e parte il recupero. Puoi anche fare domande sull'esercizio${st.settings.apiKey?"":" (serve la chiave Gemini gratuita in ⚙)"}.</p></div>`;
  $("#home").querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>startSession(b.dataset.s));
  const rd=$("#restDone"); if(rd) rd.onclick=()=>{ st.cyclePos=ni; save(); drawHome(); };
}
function startSession(s){
  unlockAudio();
  st.cur={id:uid(),session:s,start:Date.now(),exIdx:0,vid:0,log:{},chat:[],pending:null,timer:null};
  save(); render();
  sys(`Sessione ${s} iniziata alle ${new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}`);
  introExercise(); drawChips();
}
function finishSession(){
  if(!st.cur) return;
  const list=curList();
  const ex=list.map((x,k)=>({ex:x[0],...(x[0]!==origId(k)?{al_posto_di:origId(k)}:{}),sets:(st.cur.log[k]||[]).map(cleanSet)})).filter(e=>e.sets.length);
  const total=ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), planned=list.reduce((a,x)=>a+x[1],0);
  if(!ex.length){
    openSheet("Fine sessione",`<p>Non hai registrato nessuna serie, quindi non c'è niente da salvare.</p><p class="muted">Scarta la sessione: non finisce nell'archivio e cancello anche la sua chat dal backup su GitHub.</p><div class="row"><button class="btn danger" id="discard">🗑 Scarta sessione</button><button class="btn" id="keep">Continua</button></div>`);
    $("#discard").onclick=e=>{ const b=e.target; if(b.dataset.armed){ discardSession(); closeSheet(); render(); } else { b.dataset.armed=1; b.textContent="Tocca di nuovo per scartare"; } };
    $("#keep").onclick=closeSheet; return;
  }
  openSheet("Fine sessione",`<p>Hai registrato <b>${total}/${planned}</b> ${isExtraSess(st.cur.session)?"giri":"serie allenanti"} in ${ex.length} esercizi.</p><p class="muted">La sessione verrà salvata nell'archivio${isExtraSess(st.cur.session)?" (il ciclo PPL non cambia)":" e il ciclo passerà al passaggio successivo"}.</p><div class="row"><button class="btn acc" id="confirmEnd">Salva e chiudi</button><button class="btn" id="keep">Continua ad allenarmi</button></div>
    <div class="card"><h3>Era solo una prova?</h3><p class="muted" style="margin:0 0 10px">Scarta la sessione: non finisce nell'archivio, i carichi consigliati tornano com'erano e cancello anche la sua chat e i suoi dati dal backup su GitHub.</p><button class="btn danger" id="discardAll">🗑 Scarta sessione</button></div>`);
  $("#keep").onclick=closeSheet;
  $("#discardAll").onclick=e=>{ const b=e.target; if(b.dataset.armed){ discardSession(); closeSheet(); render(); } else { b.dataset.armed=1; b.textContent="Tocca di nuovo per scartare"; } };
  $("#confirmEnd").onclick=()=>{
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

function exportJSON(){ return JSON.stringify({app:"gym-coach",version:1,exported:new Date().toISOString(),cyclePos:st.cyclePos,sugg:st.sugg,custom:st.custom,history:st.history},null,1); }
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
  $("#sheetBody").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
    if(b.dataset.armed){ deleteSession(b.dataset.del); openArchive(); }
    else { b.dataset.armed=1; b.textContent="Tocca di nuovo per eliminare"; }
  });
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
    <div class="inc"><span>Bilanciere (kg)</span><input class="inp" id="sBar" inputmode="decimal" value="${kgTxt(s.barKg??20)}"><span>Barra Smith (kg)</span><input class="inp" id="sSmith" inputmode="decimal" value="${kgTxt(s.smithKg??15)}"></div>
    <button class="btn acc wide" id="sSave">Salva</button>
    <div class="card"><h3>Ciclo</h3><p class="muted" style="margin:0 0 8px">Ultimo passaggio completato: <b>${st.cyclePos>=0?CYCLE[st.cyclePos]:"nessuno"}</b>. Correggilo se serve:</p>
      <select class="inp" id="sCycle"><option value="-1">Nessuno (si riparte da PUSH)</option>${CYCLE.map((c,k)=>`<option value="${k}" ${k===st.cyclePos?"selected":""}>${k+1}. ${c}</option>`).join("")}</select></div>
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
  $("#sUpdate").onclick=async()=>{ collect(); $("#sUpdate").textContent="Aggiorno…";
    try{ const rs=await navigator.serviceWorker?.getRegistrations?.()||[]; await Promise.all(rs.map(r=>r.unregister())); }catch(e){}
    try{ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); }catch(e){}
    location.replace(location.pathname+"?u="+Date.now()); };
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
setComposer(!!st.ui.composer);
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
  const dec=t=>t.replace(/<br\s*\/?>/g,"\n").replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
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
  if(q==="bb"||q==="smith"){ const bar=q==="bb"?(st.settings.barKg??20):(st.settings.smithKg??15); return mode==="tot" ? bar+2*k : (bar+2*k)/2; }
  if(mode!=="tot") return k;
  if(q==="db"||q==="plate") return 2*k;
  if(/per lato/.test((EX[id]&&EX[id].lm)||"")) return 2*k;   // es. croci ai cavi: un pacco per lato
  return k;
}
const e1n = (id,s,mode) => { const w=normKg(id,s,mode); return (w && s.reps) ? w*(1+(s.reps+(s.rir||0))/30) : null; };
const e1 = s => (s.kg && s.reps) ? s.kg*(1+(s.reps+(s.rir||0))/30) : null;   // stessa formula del tuo Excel (RIR mancante = 0)
const mondayOf = ts => { const d=new Date(ts); d.setHours(0,0,0,0); const k=(d.getDay()+6)%7; d.setDate(d.getDate()-k); return d.getTime(); };
function statsData(){
  const hs=allSessions().filter(h=>!isExtraSess(h.session));
  const work=[]; // una riga per serie allenante
  hs.forEach(h=>h.ex.forEach(e=>e.sets.forEach(s=>{ if(!s.extra && s.sec==null) work.push({h,ex:e.ex,s}); })));
  return {hs,work};
}
function openStats(sel){
  const {hs,work}=statsData();
  if(!hs.length){ openSheet("Progressi","<p class='muted'>Ancora nessun dato: registra una sessione o importa lo storico da 🗂 Archivio.</p>"); return; }
  const first=hs[0].start, last=hs[hs.length-1].start;
  const now=Date.now(), w4=hs.filter(h=>h.start>now-28*864e5).length;
  // volume settimanale per muscolo (ultime 6 settimane con dati)
  const weeks=[...new Set(work.map(w=>mondayOf(w.h.start)))].sort((a,b)=>a-b).slice(-6);
  const vol={}; work.forEach(w=>{ const g=MUSCLE[w.ex]||(EX[w.ex]&&EX[w.ex].like&&MUSCLE[EX[w.ex].like])||"Altro"; const k=mondayOf(w.h.start); if(!weeks.includes(k)) return; (vol[g] ||= {})[k]=((vol[g]||{})[k]||0)+1; });
  const maxV=Math.max(1,...Object.values(vol).flatMap(o=>Object.values(o)));
  const groups=[...MUSCLE_ORDER.filter(g=>vol[g]), ...Object.keys(vol).filter(g=>!MUSCLE_ORDER.includes(g))];
  const wk=t=>new Date(t).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"});
  const heat=`<table class="heat"><thead><tr><th></th>${weeks.map(k=>`<th>${wk(k)}</th>`).join("")}</tr></thead><tbody>${groups.map(g=>`<tr><th>${g}</th>${weeks.map(k=>{const v=(vol[g]||{})[k]||0; return `<td title="${g}, settimana del ${wk(k)}: ${v} serie allenanti" style="background:${v?`rgba(57,135,229,${(0.18+0.72*v/maxV).toFixed(2)})`:"transparent"}">${v||"·"}</td>`;}).join("")}</tr>`).join("")}</tbody></table>`;
  // esercizi con dati
  const exIds=[...new Set(work.map(w=>w.ex))].sort((a,b)=>MUSCLE_ORDER.indexOf(MUSCLE[a]||"Z")-MUSCLE_ORDER.indexOf(MUSCLE[b]||"Z")||EX[a].n.localeCompare(EX[b].n));
  const cur = sel && exIds.includes(sel) ? sel : (st.cur && exIds.includes(item()[0]) ? item()[0] : exIds[0]);
  openSheet("Progressi",`
    <div class="tiles">
      <div class="tile"><b>${hs.length}</b><span>sessioni</span></div>
      <div class="tile"><b>${work.length}</b><span>serie allenanti</span></div>
      <div class="tile"><b>${w4}</b><span>sessioni ultime 4 sett.</span></div>
    </div>
    <p class="muted" style="margin:6px 2px 0">Dal ${new Date(first).toLocaleDateString("it-IT")} al ${new Date(last).toLocaleDateString("it-IT")}</p>
    <div class="card"><h3>Andamento per esercizio</h3>
      <select class="inp" id="stEx">${exIds.map(id=>`<option value="${id}" ${id===cur?"selected":""}>${esc((MUSCLE[id]?MUSCLE[id]+" · ":"")+EX[id].n)}</option>`).join("")}</select>
      <div id="stChart"></div>
    </div>
    <div class="card"><h3>Serie allenanti a settimana per muscolo</h3><div class="heatwrap">${heat}</div>
      <p class="muted" style="margin:8px 0 0">Conta le serie allenanti (non riscaldamento, prova o extra) di ogni settimana, da lunedì. Più scuro = più serie.</p></div>`);
  $("#stEx").onchange=e=>drawExStats(e.target.value);
  drawExStats(cur);
}
function drawExStats(id){
  const {hs}=statsData();
  // miglior serie per seduta, separata per macchina/variante
  const split=!!st.ui.statsSplit, mode=st.ui.statsTot?"tot":"mano";
  const pts=[]; hs.forEach(h=>{ const e=h.ex.find(x=>x.ex===id); if(!e) return;
    const by={}; e.sets.filter(s=>!s.extra&&s.sec==null).forEach(s=>{ const v=e1n(id,s,mode); const m=split?(s.m||"—"):"all"; if(v!=null && (!by[m]||v>by[m].v)) by[m]={v,s}; });
    Object.entries(by).forEach(([m,b])=>pts.push({t:h.start,m,v:b.v,s:b.s,h,w:normKg(id,b.s,mode)})); });
  const hasBar=hs.some(h=>{ const e=h.ex.find(x=>x.ex===id); return e&&e.sets.some(s=>["bb","smith"].includes(eqOfSet(id,s))); });
  const modeTxt = mode==="tot" ? "carico totale" : "per manubrio / per lato";
  const ctrls=`<div class="seg"><button type="button" data-split="0" class="${split?"":"on"}">Linea unica</button><button type="button" data-split="1" class="${split?"on":""}">Per macchina</button></div>
    <div class="seg"><button type="button" data-tot="0" class="${mode==="tot"?"":"on"}">Per mano/lato</button><button type="button" data-tot="1" class="${mode==="tot"?"on":""}">Totale</button></div>`;
  const box=$("#stChart");
  const rows=[]; hs.slice().reverse().forEach(h=>{ const e=h.ex.find(x=>x.ex===id); if(e) rows.push(`<tr><td>${dateTxt(h.start)}</td><td>${esc(h.session)}</td><td>${e.sets.filter(s=>!s.extra).map(s=>esc(setTxt(s))+(s.m?` <span class="xs">· ${esc(s.m)}</span>`:"")).join("<br>")||"<span class='xs'>solo riscaldamento/prove</span>"}</td></tr>`); });
  const tableHtml=`<details class="tbl"><summary>Tabella delle sedute (${rows.length})</summary><table class="stt"><thead><tr><th>Data</th><th>Seduta</th><th>Serie allenanti</th></tr></thead><tbody>${rows.join("")}</tbody></table></details>`;
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
  const expl = `Forza stimata (e1RM, kg, ${modeTxt}) della serie migliore di ogni seduta.`
    + (hasBar ? ` Bilanciere: (barra ${kgTxt(st.settings.barKg??20)} kg + dischi dei due lati)${mode==="tot"?"":" ÷ 2, per confrontarlo coi manubri"}${id==="smith_sq"||hs.some(h=>{const e=h.ex.find(x=>x.ex===id);return e&&e.sets.some(s=>eqOfSet(id,s)==="smith");})?`; Smith con barra ${kgTxt(st.settings.smithKg??15)} kg`:""} (modificabile in ⚙).` : "")
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
  return {app:"gym-coach",version:1,aggiornato:new Date().toISOString(),ciclo_ultimo_passaggio:st.cyclePos>=0?CYCLE[st.cyclePos]:null,cyclePos:st.cyclePos,sugg:st.sugg,esercizi_personalizzati:st.custom,note_esercizi:st.exNotes||{},esercizi,sessioni};
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
window.__appOk=true;
