/* Gym Coach — registro allenamenti con video, chat e consigli sul carico.
   Tutti i dati restano nel browser (localStorage) del telefono. */

const LS = "gymcoach_v1";
const APP_VERSION = "17";
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
let st = loadState();
if(!st.settings.perSideMigrated){ if(st.settings.inc.bb===2.5) st.settings.inc.bb=1.25; if(st.settings.incLb.bb===5) st.settings.incLb.bb=2.5; st.settings.perSideMigrated=true; }
if(st.settings.model==="gemini-flash-latest") st.settings.model="gemini-3.8-flash";   // modello Flash più capace del livello gratuito
function save(){ try{ localStorage.setItem(LS, JSON.stringify(st)); }catch(e){ sys("Attenzione: impossibile salvare sul dispositivo."); } }

/* ---------------- utilità ---------------- */
const esc = t => String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/(^|[\s(])\*(\S[^*]*?)\*/g,"$1<i>$2</i>").replace(/\n/g,"<br>");
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
const setW   = s => s.u==="lb" ? `${kgTxt(s.v)} lb` : `${kgTxt(s.kg)} kg`;
const modeOf = id => (EX[id]&&EX[id].kind!=="time") ? (LOAD_MODE[EX[id].eq||"machine"]||"totale") : "";
function incFor(id,u){ const eq=EX[id].eq||"machine"; return (u==="lb"?st.settings.incLb[eq]:st.settings.inc[eq])||(u==="lb"?5:2.5); }
function setTxt(s){ return s.sec!=null ? `${s.sec} s ✓` : `${setW(s)} × ${s.reps} (RIR ${s.rir})`; }
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
function nextTime(it,sets){
  const [id,,lo,hi]=it;
  const ws=sets.filter(s=>!s.extra); if(!ws.length) return null;
  const last=ws[ws.length-1], u=unitOf(last), inc=incFor(id,u), w0=valOf(last);
  const mk=(v,txt)=>({v,u,kg:v==null?null:toKg(v,u),txt});
  if(!w0) return mk(null,"Prossima volta punta ad aggiungere ripetizioni mantenendo RIR 2–3.");
  if(ws.every(s=>s.reps>=hi && s.rir>=RIR_MIN)) return mk(w0+inc,`Tutte le serie al massimo del range (${hi} rip) con RIR ≥ ${RIR_MIN}: **la prossima volta sali a ${wTxt(w0+inc,u)}**.`);
  const v=judge(it,last);
  if(v==="heavy"){ const w=Math.max(inc,Math.min(targetLoad(it,last)??w0, w0-inc)); return mk(w,`La prossima volta parti da **${wTxt(w,u)}** per restare nel range a RIR 2–3.`); }
  if(v==="light"){ const w=Math.max(targetLoad(it,last)??w0, w0+inc); return mk(w,`La prossima volta prova **${wTxt(w,u)}**.`); }
  return mk(w0,`La prossima volta **resta a ${wTxt(w0,u)}** e prova ad aggiungere ripetizioni fino a ${hi} in entrambe le serie.`);
}
/* carico consigliato per oggi: {v,u} nell'unità usata l'ultima volta */
function suggested(exId){
  const s=st.sugg[exId]; if(s && s.kg!=null) return s.u==="lb"?{v:s.v,u:"lb"}:{v:s.kg,u:"kg"};
  const p=lastPerf(exId); if(p){ const ws=p.sets.filter(x=>!x.extra&&x.kg!=null); if(ws.length){ const l=ws[ws.length-1]; return {v:valOf(l),u:unitOf(l)}; } }
  return null;
}
function suggestedKg(exId){ const g=suggested(exId); return g?toKg(g.v,g.u):null; }
function suggTxt(exId){ const g=suggested(exId); if(!g) return null; return g.u==="lb"?`${wTxt(g.v,"lb")} (≈${kgTxt(Math.round(toKg(g.v,"lb")*10)/10)} kg)`:wTxt(g.v,"kg"); }
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
  if(kg!=null && reps==null && rir==null && left.length===1){ reps=kg; kg=null; } // "9" da solo = ripetizioni
  if(reps!=null && (reps<1||reps>60)) reps=null;
  if(rir!=null && rir>10) rir=null;
  if(unit==null){ if(/\b(lbs?|libbr[ae]|pounds?)\b/.test(t)) unit="lb"; else if(/\b(kg|chili|kili)\b/.test(t)) unit="kg"; }
  return {kg,unit,reps,rir,found:reps!=null||rir!=null&&kg!=null};
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
  $("#chat").appendChild(d); $("#chat").scrollTop=1e9;
  return d;
}

function introExercise(){
  if(isTimeIt(item())) return introTimed();
  const it=item(), e=exOf(it), [id,n,lo,hi,rest]=it, list=curList();
  const p=lastPerf(id), sk=suggTxt(id), g=suggested(id);
  let t=`<b>${st.cur.exIdx+1}/${list.length} · ${esc(e.n)}</b>${e.s?` <span class="muted">(${esc(e.s)})</span>`:""}<br>${n} serie × ${lo}–${hi} rip · RIR ${RIR_MIN}–${RIR_MAX} · recupero ${restTxt(rest)}`;
  if(e.note) t+=`<br><span class="down">⚠ ${esc(e.note)}</span>`;
  if(p) t+=`<br>Ultima volta (${dateTxt(p.date)}): ${esc(perfTxt(p.sets))}`;
  t+=`<br><span class="muted">Carico ${modeOf(id)}</span>`;
  if(sk!=null) t+=`<br>👉 <b>Oggi: ${sk}</b> <span class="muted">${modeOf(id)}</span>`;
  else t+=`<br>👉 Prima volta: scegli un carico con cui arrivi a ~${Math.round((lo+hi)/2)} rip lasciandone 2–3 in canna.`;
  t+=`<br><span class="muted">${esc(e.cue)}</span>`;
  const done=workSets(st.cur.exIdx).length;
  if(done) t+=`<br><span class="muted">Già fatte ${done}/${n} serie.</span>`;
  else t+=`<br><span class="muted">A fine serie scrivimi, per esempio: <i>${g?wTxt(g.v,g.u):"20 kg"} ${hi-1} rip RIR 2</i> (anche in libbre: <i>50 lb</i>)</span>`;
  bot(t,"intro");
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
  if(!isQuestion(t) && p.found){ st.cur.pending=null; return logSet(p); }
  return askAI(text);
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
  }
  bot(txt);
  if(lastOfEx){
    const nt=nextTime(it,setsOf(i));
    if(nt){ (st.cur.prevSugg ||= {})[id] = st.sugg[id] ?? null; st.sugg[id]={kg:nt.kg,...(nt.u==="lb"?{u:"lb",v:nt.v}:{}),txt:nt.txt,date:Date.now()}; bot(`<b>${esc(EX[id].n)} completato.</b> ${md(nt.txt)}`); }
    afterExercise(i,rest);
  } else if(!extra) startTimer(rest);
  drawExbar(); drawChips();
}
function toggleUnit(){
  const nu=prefUnit()==="lb"?"kg":"lb"; (st.cur.unitPref ||= {})[st.cur.exIdx]=nu; save();
  const r=refKg(item()[0]);
  bot(`Da ora su questo esercizio uso le <b>${nu==="lb"?"libbre":"chili"}</b>${r?` (l'ultimo carico equivale a circa <b>${kgTxt(Math.round(fromKg(r,nu)*2)/2)} ${nu}</b>)`:""}. Puoi sempre scrivere l'unità nel messaggio.`);
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
  const id=forId||item()[0], rows=[];
  for(let i=st.history.length-1;i>=0 && rows.length<6;i--){
    const h=st.history[i], e=h.ex.find(x=>x.ex===id&&x.sets.length);
    if(e) rows.push(`${dateTxt(h.start)} (${h.session}): ${esc(perfTxt(e.sets))}`);
  }
  const sg=st.sugg[id];
  bot(rows.length?`<b>Storico ${esc(EX[id].n)}</b><br>`+rows.join("<br>")+(suggTxt(id)?`<br>👉 Carico consigliato per la prossima volta: <b>${suggTxt(id)}</b>`:""):`Nessuno storico per ${esc(EX[id].n)}: non l'hai ancora registrato nell'app.`);
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

function exHistoryTxt(id,max=6){
  const rows=[];
  for(let i=st.history.length-1;i>=0 && rows.length<max;i--){ const h=st.history[i], e=h.ex.find(x=>x.ex===id&&x.sets.length); if(e) rows.push(`${dateTxt(h.start)} ${h.session}: ${perfTxt(e.sets)}`); }
  return rows.length?rows.join(" | "):"nessuno";
}
function recentSessionsTxt(max=6){
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
PROGRAMMA: obiettivo ipertrofia e progressione tecnica/forza. PPL + Upper/Lower (ciclo PUSH→PULL→LEGS→REST→UPPER→REST→LOWER, senza giorni fissi), 2 serie allenanti per esercizio, RIR target 2–3, double progression (prima ripetizioni nel range, poi carico quando entrambe le serie arrivano al limite alto a RIR 2–3). Le serie extra non contano. Non convertire unità, fori o kg/lato tra macchine diverse. CONVENZIONE CARICHI: manubri = peso di un manubrio; bilanciere, Smith e macchine a dischi = peso PER LATO (dischi su un lato, bilanciere escluso); macchine a pacco pesi e cavi = peso TOTALE indicato sul pacco. Rispetta sempre questa convenzione nei numeri che dai.
L'utente si allena in palestre diverse: a volte i pesi sono in kg, a volte in libbre (1 lb = 0,4536 kg). Rispondi nella stessa unità che sta usando per quell'esercizio e, se utile, indica l'equivalente. Incrementi minimi in kg: manubri ${kgTxt(st.settings.inc.db)}, bilanciere ${kgTxt(st.settings.inc.bb)}, cavi ${kgTxt(st.settings.inc.cable)}, macchine ${kgTxt(st.settings.inc.machine)}; in libbre: manubri ${kgTxt(st.settings.incLb.db)}, bilanciere ${kgTxt(st.settings.incLb.bb)}, cavi ${kgTxt(st.settings.incLb.cable)}, macchine ${kgTxt(st.settings.incLb.machine)}.
${COACH_KNOWLEDGE}

DATI DELL'UTENTE
Sessione in corso: ${st.cur.session}, iniziata alle ${new Date(st.cur.start).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}${days!=null?`; giorni dall'ultima sessione: ${days}`:""}.
Scheda di oggi (▶ = esercizio corrente):
${today}
Esercizio corrente: ${e.n}${e.s?` (${e.s})`:""}${id!==origId(st.cur.exIdx)?` (sostituisce ${EX[origId(st.cur.exIdx)].n} della scheda)`:""}, ${isTimeIt(it)?`esercizio a tempo di mobilità/stretching: ${n} giri × ${holdTxt(it)}, niente carichi`:`attrezzo: ${EQ_LABEL[e.eq]}, ${n} serie × ${lo}–${hi} rip, RIR 2–3`}, recupero ${rest}s. Tecnica: ${e.cue}${e.note?` Nota: ${e.note}`:""}
Carico di questo esercizio: ${modeOf(id)}. Alternative mirate (stesso muscolo e stesso stimolo) se chiede di cambiarlo: ${(typeof ALT!=="undefined"&&ALT[origId(st.cur.exIdx)]||[]).map(([a,w])=>`${EX[a]?EX[a].n:a} (${w})`).join("; ")||"scegli tu con lo stesso pattern e muscolo bersaglio"}.
Serie fatte oggi su questo esercizio: ${perfTxt(setsOf(st.cur.exIdx))||"nessuna"}.
Storico di questo esercizio (più recente prima): ${exHistoryTxt(id)}.
Carico consigliato oggi dall'app: ${suggTxt(id)??"non definito"}. Unità che sta usando ora: ${prefUnit()}.
Ultime sessioni:
${recentSessionsTxt()}
Ultima prestazione registrata per ogni esercizio (usala per rispondere a domande su carichi e ripetizioni passate; se un dato non c'è, dillo chiaramente invece di inventarlo):
${allExLastTxt()}

FORMATO DELLA RISPOSTA:
- Se il messaggio comunica una serie appena fatta, rispondi SOLO con questa riga: #SERIE kg=<numero o ?> unita=<kg|lb|?> rip=<numero o ?> rir=<numero o ?>
- Se l'utente vuole sostituire l'esercizio corrente (es. macchina occupata), rispondi SOLO con: #CAMBIA <nome dell'esercizio>
- In tutti gli altri casi rispondi direttamente in testo semplice (puoi usare **grassetto** e andare a capo), senza JSON e senza preamboli.`;
}
async function callGemini(sys,prompt,onDelta){
  const key=st.settings.apiKey; if(!key) return {err:"manca la chiave Gemini"};
  const models=[...new Set([st.settings.model||"gemini-3.8-flash","gemini-3.8-flash","gemini-flash-latest","gemini-3.6-flash","gemini-2.5-flash"])];
  let err="", retried=false, noThink=false;
  for(const model of models){
    const think = !noThink && /^gemini-(3|flash-latest)/.test(model);
    let got="";
    try{
      const ctl=new AbortController(); let to=setTimeout(()=>ctl.abort(),45000);
      const gc = think ? {thinkingConfig:{thinkingLevel: st.settings.think==="medium"?"medium":"low"}} : {};
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,{
        method:"POST",signal:ctl.signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:gc})});
      if(r.status===404){ clearTimeout(to); err="modello Gemini non trovato"; continue; }
      if(r.status===429){ clearTimeout(to); return {err:"limite gratuito di Gemini raggiunto per ora"}; }
      if(r.status===400||r.status===401||r.status===403){ clearTimeout(to); const j=await r.json().catch(()=>({})); const m=(j.error&&j.error.message)||"";
        if(think && r.status===400 && /think/i.test(m)){ noThink=true; models.splice(models.indexOf(model)+1,0,model); continue; }
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
async function callOpenRouter(sys,prompt){
  const key=st.settings.orKey; if(!key) return {err:"manca la chiave OpenRouter"};
  const models=[...new Set([st.settings.orModel||"moonshotai/kimi-k2.6:free","moonshotai/kimi-k2.6:free","moonshotai/kimi-k2:free","openrouter/free"])];
  try{
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+key,"HTTP-Referer":location.origin,"X-Title":"Gym Coach"},
      body:JSON.stringify({model:models[0],models,messages:[{role:"system",content:sys},{role:"user",content:prompt}]})});
    if(r.status===401) return {err:"chiave OpenRouter non valida"};
    if(r.status===402) return {err:"credito OpenRouter esaurito"};
    if(r.status===429) return {err:"limite gratuito di OpenRouter raggiunto (50 domande al giorno senza credito)"};
    if(!r.ok){ const j=await r.json().catch(()=>({})); return {err:"OpenRouter: "+((j.error&&j.error.message)||r.status)}; }
    const j=await r.json(); const out=(j.choices||[])[0]?.message?.content||"";
    return out?{out,by:j.model||models[0]}:{err:"OpenRouter: risposta vuota"};
  }catch(e){ return navigator.onLine===false?{err:"nessuna connessione",offline:true}:{err:`errore di rete con OpenRouter (${e.message||e.name})`}; }
}
function aiReady(){ return !!(st.settings.apiKey||st.settings.orKey); }
let wentHidden=false;
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden") wentHidden=true;
  else if(st.cur && st.cur.aiRetry){ const t=st.cur.aiRetry; st.cur.aiRetry=null; save(); sys("Riprovo la domanda rimasta in sospeso…"); askAI(t); }
});
async function askAI(text){
  if(!aiReady()){
    bot(`Non ho capito il messaggio come serie. Per registrarla scrivi per esempio <i>24 kg 9 rip RIR 2</i>.<br>Per farmi domande libere aggiungi una chiave gratuita (Gemini o OpenRouter/Kimi) in ⚙ Impostazioni.`);
    return;
  }
  const recent=st.cur.chat.slice(-15,-1).filter(m=>m.who!=="sys").map(m=>(m.who==="user"?"Utente: ":"Coach: ")+m.text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,300)).join("\n");
  const prompt=(recent?`Conversazione recente:\n${recent}\n\n`:"")+`Nuovo messaggio dell'utente: ${text}`;
  const typing=drawMsg({who:"bot",text:"…",cls:"typing"});
  wentHidden=document.visibilityState==="hidden";
  const sysTxt=aiContext();
  const order=st.settings.provider==="openrouter"?[callOpenRouter,callGemini]:[callGemini,callOpenRouter];
  let res=null; const errs=[];
  for(const f of order){
    if(f===callGemini&&!st.settings.apiKey || f===callOpenRouter&&!st.settings.orKey) continue;
    res=await f(sysTxt,prompt,txt=>{ if(!/^\s*#/.test(txt)){ typing.classList.remove("typing"); typing.innerHTML=md(txt); $("#chat").scrollTop=1e9; } }); if(res.out) break; errs.push(res.err); if(res.offline) break;
  }
  typing.remove();
  if((!res||!res.out) && wentHidden && !errs.every(e=>e==="nessuna connessione")){
    st.cur.aiRetry=text; save();
    if(document.visibilityState==="visible"){ st.cur.aiRetry=null; save(); sys("La richiesta si era interrotta mentre eri in un'altra app: riprovo…"); return askAI(text); }
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
    destroyExerciseVideo(); yvWant=null;
    const q=encodeURIComponent(e.n+" tecnica esecuzione");
    $("#frame").innerHTML=`<div style="display:grid;place-items:center;text-align:center;color:var(--mut);padding:16px">Nessun video salvato per questo esercizio.<br><a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Cerca “${esc(e.n)}” su YouTube ↗</a></div>`;
    $("#player").classList.remove("collapsed");
    $("#vchips").innerHTML=`<span class="muted" style="padding:4px 2px">Esercizio personalizzato</span>`; return;
  }
  const vi=clamp(st.cur.vid||0,0,e.v.length-1), [id]=e.v[vi];
  $("#player").classList.toggle("collapsed",!!st.ui.videoHidden);
  if(!st.ui.videoHidden) showExerciseVideo(id); else destroyExerciseVideo();
  $("#vchips").innerHTML = e.v.map(([vid,ch],k)=>`<button class="vchip ${k===vi&&!st.ui.videoHidden?"on":""}" data-k="${k}">▶ ${esc(ch)}</button>`).join("")
    + `<button class="vchip ghost" id="vToggle">${st.ui.videoHidden?"Mostra video":"Nascondi video"}</button>`
    + `<a class="vchip ghost" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--mut)">Apri in YouTube ↗</a>`;
  $("#vchips").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ st.cur.vid=+b.dataset.k; st.ui.videoHidden=false; save(); drawVideo(); });
  $("#vToggle").onclick=()=>{ st.ui.videoHidden=!st.ui.videoHidden; save(); drawVideo(); };
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
function applyVolV(){ if(!yvReady) return; try{ const v=st.ui.volV; if(v<=0) yv.mute(); else { yv.unMute(); yv.setVolume(v); } }catch(e){} }
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
function destroyExerciseVideo(){ try{ yv&&yv.destroy(); }catch(e){} yv=null; yvReady=false; yvId=null; $("#frame").innerHTML=""; }

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
  $("#mPlay").textContent = (ymPlaying||ymWant) ? "❚❚" : "▶"; $("#mPlay").classList.toggle("on",ymPlaying);
  $("#mPh").hidden = !!ym;
  $("#volV").value=st.ui.volV; $("#oV").textContent=st.ui.volV;
  $("#volM").value=m.vol; $("#oM").textContent=m.vol;
  $("#mLoop").checked=!!m.loop;
  $("#mMore").textContent = $("#mPanel").hidden ? "⌄" : "⌃";
  $("#mRecent").innerHTML = m.recent.map((r,k)=>`<button class="vchip ${r.raw===m.raw?"on":""}" data-r="${k}">${r.list?"☰ ":"♪ "}${esc(r.title.length>28?r.title.slice(0,27)+"…":r.title)}</button>`).join("");
  $("#mRecent").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{ loadMusic(m.recent[+b.dataset.r].raw,true); $("#mPanel").hidden=true; drawMusic(); });
}
$("#mPlay").onclick=toggleMusic;
$("#mMore").onclick=$("#mInfo").onclick=()=>{ $("#mPanel").hidden=!$("#mPanel").hidden; drawMusic(); };
$("#mForm").onsubmit=e=>{ e.preventDefault(); if(loadMusic($("#mIn").value,true)){ $("#mIn").value=""; $("#mIn").blur(); $("#mPanel").hidden=true; drawMusic(); } };
$("#mLoop").onchange=e=>{ st.ui.music.loop=e.target.checked; save(); drawMusic(); };
$("#volV").oninput=e=>{ st.ui.volV=+e.target.value; $("#oV").textContent=st.ui.volV; applyVolV(); save(); };
$("#volM").oninput=e=>{ const v=+e.target.value; st.ui.music.vol=v; $("#oM").textContent=v; if(ymReady) ym.setVolume(v); save(); };
window.onYouTubeIframeAPIReady=()=>{ if(st.cur&&!st.ui.videoHidden&&yvWant) showExerciseVideo(yvWant); ensureMusic(); drawMusic(); };
function loadYTApi(){ const sc=document.createElement("script"); sc.src="https://www.youtube.com/iframe_api"; sc.async=true; document.head.appendChild(sc); }
loadYTApi();
setTimeout(()=>{ if(!apiOk()) loadYTApi(); },8000);

function drawExbar(){
  const it=item(), e=exOf(it), [,n,lo,hi,rest]=it, ws=workSets(st.cur.exIdx);
  let dots=""; for(let s=0;s<n;s++){ const x=ws[s]; dots+=`<span class="dot ${x?"done":s===ws.length?"next":""}" title="Serie ${s+1}">${x?(x.sec!=null?"✓":x.reps):s+1}</span>`; }
  const g=isTimeIt(it)?null:suggested(it[0]), sk=g?wTxt(g.v,g.u):null;
  const rx=isTimeIt(it)?`${n} giri × ${holdTxt(it)} · pausa ${rest} s`:`${n}×${lo}–${hi} · RIR ${RIR_MIN}–${RIR_MAX} · rec ${restTxt(rest)}${sk!=null?` · oggi ${sk} ${modeOf(it[0])}`:` · kg ${modeOf(it[0])}`}`;
  $("#exbar").innerHTML=`<div class="nm">${esc(e.n)}<span class="rx">${rx}</span></div><div class="dots">${dots}</div>`;
  drawTop();
}
function drawChips(){
  const c=$("#chips"), pend=st.cur&&st.cur.pending;
  let html="";
  if(pend && pend.need==="unit") html=`<button class="chip acc" data-say="${pend.alt}">Sì, ${wTxt(pend.kg,pend.alt)}</button><button class="chip" data-say="${pend.unit}">No, ${wTxt(pend.kg,pend.unit)}</button>`;
  else if(pend && pend.need==="rir") html=[0,1,2,3,4,5].map(v=>`<button class="chip acc" data-say="RIR ${v}">RIR ${v}</button>`).join("");
  else if(pend && pend.need==="reps"){ const [, ,lo,hi]=item(); for(let v=Math.max(1,lo-2);v<=hi+2;v++) html+=`<button class="chip acc" data-say="${v} rip">${v}</button>`; }
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
    openSheet("Fine sessione",`<p>Non hai registrato nessuna serie. Vuoi chiudere la sessione senza salvarla?</p><div class="row"><button class="btn danger" id="discard">Chiudi senza salvare</button><button class="btn" id="keep">Continua</button></div>`);
    $("#discard").onclick=()=>{ discardSession(); closeSheet(); render(); }; $("#keep").onclick=closeSheet; return;
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
  return st.history.map(h=>`${h.session} — ${new Date(h.start).toLocaleDateString("it-IT")}\n`+h.ex.map(e=>`  ${EX[e.ex]?EX[e.ex].n:e.ex}: ${e.sets.map(s=>(s.sec!=null?`${s.sec}s`:`${setW(s).replace(" ","")}×${s.reps} RIR${s.rir}`)+(s.extra?" (extra)":"")).join(", ")}`).join("\n")).join("\n\n");
}
function openArchive(){
  const hs=[...st.history].reverse();
  const items=hs.length?hs.map(h=>{
    const n=h.ex.reduce((a,e)=>a+e.sets.filter(s=>!s.extra).length,0), dur=Math.round((h.end-h.start)/60000);
    return `<details class="hs"><summary><span><b>${h.session}</b> <span class="muted">${new Date(h.start).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit",year:"2-digit"})}</span></span><span class="muted">${n} ${isExtraSess(h.session)?"giri":"serie"} · ${dur} min</span></summary>
      <div class="det">${h.ex.map(e=>`<div><b>${esc(EX[e.ex]?EX[e.ex].n:e.ex)}</b>${e.al_posto_di?` <span>(al posto di ${esc(EX[e.al_posto_di]?EX[e.al_posto_di].n:e.al_posto_di)})</span>`:""}<br><span>${esc(e.sets.map(s=>(s.sec!=null?`${s.sec} s ✓`:`${setW(s)} × ${s.reps} · RIR ${s.rir}`)+(s.extra?" (extra)":"")).join("  |  "))}</span></div>`).join("")}
      <div class="row"><button class="btn" data-chat="${h.id}">💬 Vedi chat</button><button class="btn danger" data-del="${h.id}">Elimina sessione</button></div></div></details>`;
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
      if(j.sugg) st.sugg={...j.sugg,...st.sugg};
      mergeCustom(j.custom);
      if(typeof j.cyclePos==="number" && st.cyclePos<0) st.cyclePos=j.cyclePos;
      save(); syncNow(); openArchive(); $("#exMsg").textContent=`Importate ${added} sessioni.`;
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
    <select class="inp" id="sThink"><option value="low" ${s.think!=="medium"?"selected":""}>Veloci (consigliato in palestra)</option><option value="medium" ${s.think==="medium"?"selected":""}>Più ragionate (più lente)</option></select>
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
  const collect=()=>{ s.ghToken=$("#sGhTok").value.trim(); s.ghRepo=$("#sGhRepo").value.trim().replace(/^https?:\/\/github.com\//,"").replace(/\/$/,""); s.apiKey=$("#sKey").value.replace(/[\s"'`]/g,""); s.model=$("#sModel").value.trim()||"gemini-3.8-flash"; s.provider=$("#sProv").value; s.think=$("#sThink").value; s.orKey=$("#sOrKey").value.replace(/[\s"'`]/g,""); s.orModel=$("#sOrModel").value.trim()||"moonshotai/kimi-k2.6:free";
    document.querySelectorAll("[data-inc]").forEach(i=>{ const v=parseFloat(i.value.replace(",",".")); if(v>0) s.inc[i.dataset.inc]=v; });
    document.querySelectorAll("[data-inclb]").forEach(i=>{ const v=parseFloat(i.value.replace(",",".")); if(v>0) s.incLb[i.dataset.inclb]=v; });
    s.defUnit=$("#sUnit").value;
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

/* ---------------- composer e dettatura ---------------- */
$("#msg").addEventListener("focus",()=>document.body.classList.add("kbd"));
$("#msg").addEventListener("blur",()=>setTimeout(()=>document.body.classList.remove("kbd"),150));
$("#composer").onsubmit=e=>{ e.preventDefault(); const v=$("#msg").value; $("#msg").value=""; onSend(v); };
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){
  const mic=$("#btnMic"); mic.hidden=false; let rec=null;
  mic.onclick=()=>{
    unlockAudio();
    if(rec){ rec.stop(); return; }
    rec=new SR(); rec.lang="it-IT"; rec.interimResults=true; rec.maxAlternatives=1;
    mic.classList.add("on"); let final="";
    rec.onresult=ev=>{ let txt=""; for(const r of ev.results){ txt+=r[0].transcript; if(r.isFinal) final=txt; } $("#msg").value=txt; };
    rec.onend=()=>{ mic.classList.remove("on"); rec=null; const v=(final||$("#msg").value).trim(); if(v){ $("#msg").value=""; onSend(v); } };
    rec.onerror=()=>{ mic.classList.remove("on"); rec=null; };
    rec.start();
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
  const e={n:name.charAt(0).toUpperCase()+name.slice(1),s:like&&EX[like]?`Alternativa a ${EX[like].n}`:"Esercizio personalizzato",eq:eqGuess,cue:"Esecuzione controllata, range di movimento completo.",v:[],...(timed?{kind:"time",sec:item()[2]}:{})};
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
  const nt=EX[id] && EX[id].kind!=="time" ? nextTime(slotOf(id),p.sets) : null;
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
      if(e) storico.push({data:new Date(h.start).toISOString().slice(0,10),sessione:h.session,...(h.inCorso?{in_corso:true}:{}),...(e.al_posto_di?{al_posto_di:EX[e.al_posto_di]?EX[e.al_posto_di].n:e.al_posto_di}:{}),serie:e.sets.map(s=>s.sec!=null?{sec:s.sec,...(s.extra?{extra:true}:{})}:{kg:s.kg,...(s.u==="lb"?{lb:s.v}:{}),rip:s.reps,rir:s.rir,...(s.extra?{extra:true}:{})})}); }
    const sch=Object.keys(SESSIONS).filter(k=>SESSIONS[k].some(x=>x[0]===id)).map(k=>{const x=SESSIONS[k].find(y=>y[0]===id);return isTimeIt(x)?{sessione:k,giri:x[1],durata:holdTxt(x),pausa_s:x[4]}:{sessione:k,serie:x[1],range:`${x[2]}-${x[3]}`,recupero_s:x[4]};});
    let best=null; storico.forEach(r=>r.serie.forEach(s=>{ if(s.kg){ const e=e1rm(s.kg,s.rip,s.rir); if(!best||e>best.e1rm) best={e1rm:Math.round(e*10)/10,kg:s.kg,rip:s.rip,rir:s.rir,data:r.data}; } }));
    esercizi[id]={nome:EX[id].n,attrezzo:EX[id].kind==="time"?"a tempo (mobilità/stretching)":`${EQ_LABEL[EX[id].eq]||"macchina"} · carico ${modeOf(id)}`,nelle_schede:sch,prossimo_carico:st.sugg[id]?.kg??null,prossimo_carico_testo:suggTxt(id),miglior_serie_stimata:best,storico};
  }
  const sessioni=sessions.map(({chat,chatSynced,...h})=>({...h,chat_file:chatPath(h)}));
  return {app:"gym-coach",version:1,aggiornato:new Date().toISOString(),ciclo_ultimo_passaggio:st.cyclePos>=0?CYCLE[st.cyclePos]:null,cyclePos:st.cyclePos,sugg:st.sugg,esercizi_personalizzati:st.custom,esercizi,sessioni};
}
function masterMd(m){
  let t=`# Gym Coach — master per esercizio\n\nAggiornato: ${new Date(m.aggiornato).toLocaleString("it-IT")}  \nUltimo passaggio del ciclo: ${m.ciclo_ultimo_passaggio||"—"}  \nLe conversazioni di ogni sessione sono nella cartella [chat](chat/).\n`;
  for(const [id,e] of Object.entries(m.esercizi)){
    if(!e.storico.length) continue;
    const sch=e.nelle_schede;
    t+=`\n## ${e.nome}\n\n${e.attrezzo?`Attrezzo: ${e.attrezzo}  \n`:""}Schede: ${!sch.length?"esercizio personalizzato":sch.map(x=>x.giri?`${x.sessione} (${x.giri} giri × ${x.durata})`:`${x.sessione} (${x.serie}×${x.range})`).join(", ")}${sch[0]&&sch[0].giri?"":` · Prossimo carico: ${e.prossimo_carico_testo||"—"}`}\n\n| Data | Sessione | Serie |\n|---|---|---|\n`;
    for(const r of e.storico) t+=`| ${r.data.split("-").reverse().join("/")} | ${r.sessione}${r.in_corso?" (in corso)":""}${r.al_posto_di?` · al posto di ${r.al_posto_di}`:""} | ${r.serie.map(s=>(s.sec!=null?`${s.sec} s ✓`:`${s.lb!=null?`${kgTxt(s.lb)} lb (${kgTxt(Math.round(s.kg*10)/10)} kg)`:`${kgTxt(s.kg)} kg`} × ${s.rip} · RIR ${s.rir}`)+(s.extra?" (extra)":"")).join(" — ")} |\n`;
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
    if(j.sugg) st.sugg={...j.sugg,...st.sugg};
    mergeCustom(j.esercizi_personalizzati);
    if(typeof j.cyclePos==="number" && st.cyclePos<0) st.cyclePos=j.cyclePos;
    save(); return `✓ Ripristinate ${added} sessioni da GitHub.`;
  }catch(e){ return "Ripristino non riuscito: nessuna connessione o file non valido."; }
}
window.addEventListener("online",()=>{ if(st.sync.pending) syncNow(true); });
if(st.sync.pending) setTimeout(()=>syncNow(true),1500);

render();
