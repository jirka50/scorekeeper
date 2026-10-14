/* Baseball Scorekeeper · webová verze (GitHub Pages + Firebase) */
var WEB={role:null,team:null,code:null,uid:null,online:false,setupDone:null,msg:'',busy:false,pins:null,parentTeam:null,parentName:''};
var SYNC={st:'off',last:0,err:''};
var FBX=null; /* {db,auth} */
const KEY='tball-zapisnik-v2';
const POS=['','nadhazovač','catcher','1. metař','2. metař','3. metař','spojka','levý zadák','střední zadák','pravý zadák'];
const LABEL={'1B':'odpal na metu','2B':'dvoumetový odpal','3B':'třímetový odpal','HR':'homerun','FC':'volba polaře'};
const EX=[['7','12','3','21','9','15','4','18','11'],['2','10','5','14','8','23','6','17','1']];
function fresh(){return{gameId:newId(),settings:{innings:3,runLimit:5,swingLimit:5},teams:[{name:'Hosté',lineup:EX[0].slice()},{name:'Domácí',lineup:EX[1].slice()}],inning:1,top:true,bat:[0,0],outs:0,bases:[null,null,null],pas:[],runs:[[],[]],hits:[0,0],errs:[0,0],log:[],example:true}}
let S=null,hist=[],ui={tab:'game',panel:null,seq:[],sheet:0,confirm:false,msg:['','']};
const store={get(k,d){try{const x=JSON.parse(localStorage.getItem(k));return x??d}catch(e){return d}},set(k,v){let ok=true;try{localStorage.setItem(k,JSON.stringify(v))}catch(e){ok=false}syncNote(k);return ok}};
const TEAMS_KEY='tball-teams-v1',TCUR_KEY='tball-team-cur';
let TEAMS=store.get(TEAMS_KEY,null);if(!TEAMS||!Array.isArray(TEAMS.list)||!TEAMS.list.length)TEAMS={list:[{id:'t1',name:''}]};
TEAMS.cur=store.get(TCUR_KEY,'t1');if(!TEAMS.list.some(t=>t.id===TEAMS.cur))TEAMS.cur=TEAMS.list[0].id;
const keyFor=(base,tid)=>tid==='t1'?base:base+':'+tid;
const tkey=base=>keyFor(base,TEAMS.cur);
S=store.get(tkey(KEY),null);
if(!S||!S.teams)S=fresh();
const save=()=>store.set(tkey(KEY),S);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const bt=()=>S.top?0:1;
const RKEY='tball-tym-v1';
let R=store.get(tkey(RKEY),null);if(!R||!Array.isArray(R.players))R={name:'',players:[]};
const saveR=()=>store.set(tkey(RKEY),R);
const ours=()=>S.ours??1;
const rname=num=>{const p=R.players.find(p=>p.num===num);return p?p.name:''};
const anon=num=>String(num)[0]==='?';
const short=num=>anon(num)?'P'+String(num).slice(1):'#'+num;
const lbl=(t,num)=>{const n=t===ours()?rname(num):S.vsTid?nameIn(vsRoster(),num):S.oppId?nameIn(oppById(S.oppId),num):'';return (anon(num)?'Pálkař '+String(num).slice(1):'#'+num)+(n?' '+n:'')};
const nm=(t,p)=>{const v=S.teams[t].lineup[p];return v!=null?lbl(t,v):'—'};
const pn=r=>lbl(r.t,r.num);
const sortedRoster=()=>R.players.slice().sort((a,b)=>(+a.num)-(+b.num));
const jersey=raw=>{const v=String(raw||'').trim().replace(/^0+(?=\d)/,'');return /^\d{1,3}$/.test(v)?v:null};
const halfLbl=()=>S.inning+'. '+(S.top?'▲':'▼');
const started=()=>S.pas.length>0;
function snap(){hist.push(JSON.stringify(S));if(hist.length>300)hist.shift()}
function commit(){save();render()}
function undo(){if(!hist.length)return;S=JSON.parse(hist.pop());ui.panel=null;ui.seq=[];commit()}
function log(t){S.log.unshift(halfLbl()+' · '+t);if(S.log.length>300)S.log.pop()}

function startPA(code){const t=bt();const r={id:S.pas.length,t,num:S.teams[t].lineup[S.bat[t]],inn:S.inning,code,reach:0,scored:false,outNo:null,sw:code==='K'?(S.swings||0):(S.swings||0)+1};S.pas.push(r);return r}
const lim=()=>S.settings.runLimit??5;
const swl=()=>S.settings.swingLimit??5;
const maxB=()=>S.settings.maxAdvance??4;
const halfRuns=()=>S.runs[bt()][S.inning-1]||0;
function score(r){if(lim()>0&&halfRuns()>=lim())return;r.reach=4;r.scored=true;const a=S.runs[r.t];a[S.inning-1]=(a[S.inning-1]||0)+1;log(pn(r)+' doběhl domů, bod')}
function setBase(b,id){S.bases[b]=id;const r=S.pas[id];r.reach=Math.max(r.reach,b+1)}
function moveRunners(n){for(let b=2;b>=0;b--){const id=S.bases[b];if(id==null)continue;S.bases[b]=null;if(b+n>=3)score(S.pas[id]);else setBase(b+n,id)}}
function forceChain(){const B=S.bases;if(B[0]==null)return;if(B[1]!=null){if(B[2]!=null)score(S.pas[B[2]]);setBase(2,B[1])}setBase(1,B[0]);B[0]=null}
function runnerOut(id){S.outs++;S.pas[id].outNo=S.outs;log(pn(S.pas[id])+' vyautován na metách')}
function switchHalf(){const t=bt();const a=S.runs[t];a[S.inning-1]=a[S.inning-1]||0;log('konec poloviny směny');HALF_ENDED=true;S.bases=[null,null,null];S.outs=0;S.swings=0;if(S.top)S.top=false;else{S.top=true;S.inning++}}
function checkHalf(){if(S.outs>=3){switchHalf();return}if(lim()>0&&halfRuns()>=lim()){log(lim()+' bodů v polovině směny');switchHalf()}}
function endPA(){PA_ENDED=true;S.swings=0;const t=bt();S.bat[t]=(S.bat[t]+1)%S.teams[t].lineup.length;checkHalf()}

function doPA(code,arg){const t=bt(),f=1-t;let r;
  if(code==='hit'){r=startPA(['1B','2B','3B','HR'][arg-1]);S.hits[t]++;log(pn(r)+': '+LABEL[r.code]);moveRunners(arg);if(arg===4)score(r);else setBase(arg-1,r.id)}
  else if(code==='K'){r=startPA('K');S.outs++;r.outNo=S.outs;log(pn(r)+': aut po '+swl()+' švizích')}
  else if(code==='FC'){r=startPA('FC');log(pn(r)+': volba polaře');if(S.bases[0]!=null){const id=S.bases[0];S.bases[0]=null;runnerOut(id)}setBase(0,r.id)}
  else if(code==='out'){r=startPA(arg.code);S.outs++;r.outNo=S.outs;log(pn(r)+': aut '+arg.code);if(arg.sac&&S.outs<3)moveRunners(1)}
  else if(code==='E'){r=startPA('E'+arg);S.errs[f]++;log(pn(r)+': na metě po chybě ('+POS[arg]+')');forceChain();setBase(0,r.id)}
  endPA()}

function act(code,arg){if(S.final)return;snap();S.example=false;S.lastLbl=actLabel(code,arg);clockAutoStart();
  switch(code){
    case 'adv':{const id=S.bases[arg];S.bases[arg]=null;const r=S.pas[id];if(arg===2)score(r);else{setBase(arg+1,id);log(pn(r)+' postoupil na '+(arg+2)+'. metu')}checkHalf();break}
    case 'rout':{const id=S.bases[arg];S.bases[arg]=null;runnerOut(id);checkHalf();break}
    case 'endhalf':switchHalf();break;
    case 'swing':S.swings=(S.swings||0)+1;if(swl()>0&&S.swings>=swl())doPA('K');break;
    default:doPA(code,arg)}
  ui.panel=null;ui.seq=[];commit();if(HALF_ENDED||PA_ENDED){HALF_ENDED=false;PA_ENDED=false;autoPub()}else if(PUB_T)autoPub()}

function swapTeams(){if(started())return;snap();S.teams.reverse();S.bat.reverse();(S.subs||[]).forEach(x=>{x.t=1-x.t});S.ours=1-ours();ui.msg=['',''];commit()}

/* ---------- views ---------- */
function scoreTable(o){const R=t=>o.runs[t]||[],played=(t,i)=>o.final?R(t)[i-1]!=null:i<o.inning||(i===o.inning&&(t===0||!o.top));
  let h=`<div class="ls-wrap"><table class="ls"><thead><tr><th></th>${range(o.n).map(i=>`<th class="${o.cur&&i===o.inning?'cur':''}">${i}</th>`).join('')}<th class="tot">B</th></tr></thead><tbody>`;
  [0,1].forEach(t=>{let tot=0;const cells=range(o.n).map(i=>{if(!played(t,i))return'<td></td>';const v=R(t)[i-1]||0;tot+=v;return`<td>${v}</td>`}).join('');
    h+=`<tr><td class="team ${o.bat===t?'bat':''} ${o.ours===t?'ours':''}">${o.side?`<span class="side">${t?'D':'H'}</span>`:''}${esc(o.teams[t])}</td>${cells}<td class="tot">${tot}</td></tr>`});
  return h+'</tbody></table></div>'}
const lineScore=()=>`<div class="card">${scoreTable({teams:S.teams.map(x=>x.name),runs:S.runs,inning:S.inning,top:S.top,n:innCount(),ours:ours(),bat:bt(),cur:true,side:true})}</div>`;
const dots=(n,max,cls)=>Array.from({length:max},(_,i)=>`<span class="dot ${i<n?cls:''}"></span>`).join('');
function diamond(){const P=[[200,100],[120,20],[40,100]];
  let s='<svg viewBox="0 0 240 205" class="dia" role="img" aria-label="Obsazení met"><polygon points="120,180 200,100 120,20 40,100" class="dia-in"/>';
  P.forEach(([x,y],i)=>{const id=S.bases[i];s+=`<rect x="${x-11}" y="${y-11}" width="22" height="22" transform="rotate(45 ${x} ${y})" class="base ${id!=null?'on':''}"/>`;
    if(id!=null)s+=`<text x="${x}" y="${y+36}" text-anchor="middle" class="rn">${esc(short(S.pas[id].num))}</text>`});
  s+='<polygon points="111,175 129,175 129,184 120,193 111,184" class="home"/></svg>';return s}
function runners(){let h='';for(let b=2;b>=0;b--){const id=S.bases[b];if(id==null)continue;const r=S.pas[id];const blocked=b<2&&S.bases[b+1]!=null;
  h+=`<div class="runner"><span class="label">${b+1}. meta</span><b>${esc(pn(r))}</b><button class="mini-btn" data-act="adv" data-v="${b}" ${blocked?'disabled':''}>${b===2?'Domů':'P+1'}</button><button class="mini-btn out" data-act="rout" data-v="${b}">Aut</button></div>`}
  return h?`<div class="runners">${h}</div>`:'<div class="empty-bases">Mety jsou prázdné.</div>'}

function panel(){const err=ui.panel==='err';
  let h=`<div class="card panel"><div class="label">${err?'Kdo udělal chybu?':'Kdo se podílel na autu? Ťukej v pořadí'}</div>`;
  if(!err)h+=`<div class="seq">${ui.seq.length?ui.seq.join('-'):'–'}</div>`;
  h+='<div class="grid g3" style="margin-top:8px">';
  for(let i=1;i<=9;i++)h+=`<button class="big chip" data-act="chip" data-v="${i}"><b>${i}</b><small>${POS[i]}</small></button>`;
  h+='</div><div class="row" style="margin-top:10px">';
  if(!err){const dis=ui.seq.length?'':'disabled';const last=ui.seq[ui.seq.length-1];
    h+=`<button class="solid" data-act="ground" ${dis}>Zemní aut${dis?'':' '+esc(ui.seq.join('-'))}</button>
        <button class="solid" data-act="fly" ${dis}>Chycený${dis?'':' F'+last}</button>
        <button class="solid" data-act="sac" ${dis}>Obětovaný</button>`}
  return h+'<button class="ghost" data-act="cancel">Zrušit</button></div></div>'}

function gameView(){const t=bt(),p=S.bat[t],len=S.teams[t].lineup.length,sw=S.swings||0,last=swl()>0&&sw+1>=swl();
  const RES=[['1B','na metu','pálkař doběhl na 1. metu'],['2B','dvoumetový','pálkař doběhl na 2. metu'],['3B','třímetový','pálkař doběhl na 3. metu'],['HR','homerun','pálkař oběhl všechny mety']];
  const d=(short,long)=>`<small><span class="ds">${short}</span><span class="dl">${long}</span></small>`;
  let a=lineScore();
  if(S.example)a+='<div class="note">Ukázková čísla hráčů. Svoji sestavu zadáš v Nastavení.</div>';
  if(S.inning>S.settings.innings)a+=`<div class="note">Odehráno ${S.settings.innings} směn. Můžeš pokračovat, nebo v Nastavení začít nový zápas.</div>`;
  a+=`<div class="card status"><div class="inn">${S.inning}. ${S.top?'▲':'▼'}<span>${S.top?'horní':'dolní'} polovina</span></div>
    <div class="counts"><span class="cnt">Švihy ${swl()>0?dots(sw,swl(),'s'):sw}</span><span class="cnt">Auty ${dots(S.outs,3,'o')}</span><span class="cnt">Body ${lim()>0?dots(halfRuns(),lim(),'b'):halfRuns()}</span></div></div>`;
  a+=clockCard();
  a+=`<div class="card field">${diamond()}${runners()}</div>`;
  a+=`<div class="card batter"><div><div class="label">Na pálce · ${esc(S.teams[t].name)} (${t?'domácí':'hosté'})</div><div class="who"><i>${p+1}.</i>${esc(nm(t,p))}</div></div><div class="next">Další: ${esc(nm(t,(p+1)%len))}</div></div>`;
  a+=`<div class="wide">${orderCard(t)}</div>`;
  let b='';
  if(S.final)b+=finalCard();
  else if(ui.endC)b+=endConfirm();
  else if(ui.panel)b+=panel();
  else{
    b+=`<button class="big bad swingbtn" data-act="swing"><b>Švih ${sw+1}${swl()>0?' / '+swl():''}</b>${d(last?'poslední švih = aut':'nezasáhl nebo faul',last?'Poslední povolený švih. Když netrefí, je pálkař aut.':'Pálkař netrefil míček nebo ho odpálil do autu (faul).')}</button>
    <div class="label">Výsledek odpalu z tee</div>
    <div class="grid" style="grid-template-columns:repeat(${maxB()},minmax(0,1fr))">${RES.slice(0,maxB()).map(([c,sh,lo],i)=>`<button class="big hit" data-act="hit" data-v="${i+1}"><b>${c}</b>${d(sh,lo)}</button>`).join('')}</div>
    ${maxB()<4?`<div class="next">Pálkař smí po odpalu postoupit nejvýš o ${maxB()} ${maxB()===1?'metu':'mety'}.</div>`:''}
    <div class="grid g3"><button class="big bad" data-act="openout"><b>Aut…</b>${d('zem / chycený','míček chycen ve vzduchu nebo hozen na metu')}</button><button class="big err" data-act="openerr"><b>Chyba…</b>${d('E + pozice','polař chyboval, pálkař je na metě')}</button><button class="big" data-act="FC"><b>FC</b>${d('volba polaře','polař vyautoval jiného běžce')}</button></div>
    <div class="row"><button class="ghost" data-act="undo" ${hist.length?'':'disabled'}>↶ Vrátit${S.lastLbl&&hist.length?': '+esc(S.lastLbl):' krok'}</button><button class="ghost" data-act="endhalf">Ukončit polovinu směny</button></div>
    <button class="ghost danger endbtn" data-act="endask">🏁 Konec zápasu</button>`;
    if(PUB_T)b+='<div class="next">Skóre pro rodiče se za chvíli odešle.</div>';
  }
  if(S.log.length)b+=`<div class="card"><div class="label">Průběh</div><ul class="log">${S.log.slice(0,20).map((l,i)=>`<li class="${i>=8?'wide-li':''}">${esc(l)}</li>`).join('')}</ul></div>`;
  if(!started())b+=`<div class="card swap"><span>Hosté pálí první (▲), domácí druzí (▼).</span><button class="ghost" data-act="swap">⇄ Prohodit domácí a hosty</button></div>`;
  return `<div class="gv"><div class="col">${a}</div><div class="col">${b}</div></div>`}
function orderCard(t){const L=S.teams[t].lineup,cur=S.bat[t];
  return `<div class="card"><div class="label">Pálkařské pořadí · ${esc(S.teams[t].name)}</div><ol class="order">${L.map((num,i)=>{const res=S.pas.filter(r=>r.t===t&&r.num===num).map(r=>r.code);
    return `<li class="${i===cur?'now':i===(cur+1)%L.length?'nx':''}"><span class="o">${i+1}.</span><b>${esc(lbl(t,num))}</b><span class="rs">${res.length?esc(res.join(' · ')):'–'}</span></li>`}).join('')}</ol></div>`}

function mini(r){const pts=[[18,32],[32,18],[18,4],[4,18],[18,32]];let s=`<svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true"><polygon points="18,32 32,18 18,4 4,18" class="md-base"/>`;
  if(r.scored)s+='<polygon points="18,32 32,18 18,4 4,18" class="md-fill"/>';
  if(r.reach>0)s+=`<polyline points="${pts.slice(0,r.reach+1).map(p=>p.join(',')).join(' ')}" class="md-line"/>`;return s+'</svg>'}
function sheetView(){const t=ui.sheet,n=Math.max(S.settings.innings,S.inning);
  let h=(ui.edit!=null?paEditor():'<p class="next" style="margin:0">Ťukni na libovolný záznam a můžeš ho opravit.</p>')+`<div class="tabs" style="align-self:flex-start">${[0,1].map(i=>`<button class="${i===t?'on':''}" data-act="sheet" data-v="${i}">${esc(S.teams[i].name)} (${i?'D':'H'})</button>`).join('')}</div>`;
  h+='<div class="sheet-wrap"><table class="sheet"><thead><tr><th>Hráč</th>';for(let i=1;i<=n;i++)h+=`<th>${i}</th>`;h+='</tr></thead><tbody>';
  S.teams[t].lineup.forEach((num,p)=>{const sl=slotNums(t,p),was=sl.filter(x=>x!==num);h+=`<tr class="${bt()===t&&S.bat[t]===p?'now':''}"><td class="nm">${p+1}. ${esc(lbl(t,num))}${was.length?`<small class="was">dříve ${was.map(x=>'#'+esc(x)).join(', ')}</small>`:''}</td>`;
    for(let i=1;i<=n;i++){const list=S.pas.filter(r=>r.t===t&&slotNums(t,p).includes(r.num)&&r.inn===i);h+='<td class="c">'+list.map(r=>`<button class="pa ${ui.edit===r.id?'editing':''}" data-act="paedit" data-v="${r.id}" aria-label="Opravit zápis">${mini(r)}<span class="code">${esc(r.code)}</span>${r.outNo?`<span class="outn">${r.outNo}</span>`:''}${r.sw?`<span class="sw" title="Počet švihů">${r.sw}</span>`:''}</button>`).join('')+'</td>'}
    h+='</tr>'});
  h+='</tbody><tfoot><tr><td class="nm">Body</td>';for(let i=1;i<=n;i++){const played=i<S.inning||(i===S.inning&&(t===0||!S.top));h+=`<td>${played?(S.runs[t][i-1]||0):''}</td>`}
  h+='</tr></tfoot></table></div>';
  h+=`<div class="card"><div class="label">Legenda</div><div class="legend" style="margin-top:6px">
  <span><b>1B–3B</b>odpal na metu</span><span><b>HR</b>homerun</span><span><b>K</b>aut po max. švizích</span><span><b>6-3</b>zemní aut</span><span><b>F8</b>chycený odpal</span>
  <span><b>E5</b>chyba polaře</span><span><b>FC</b>volba polaře</span><span><b>SAC</b>obětovaný</span><span><span class="outn">2</span> pořadí autu</span><span>Plný diamant = bod</span><span><b style="font-size:.75rem;color:var(--muted)">3</b> vpravo dole = počet švihů</span></div></div>`;
  h+=playTimeCard()+metaCard()+pdfBox()+gameTools();
  return h}

function lineupEditor(t){const L=S.teams[t].lineup;
  const sideR=rosterSide(t),pick=sideR&&sideR.players.length?`<div class="label">Přidat ze soupisky${t===ours()?'':' · '+esc(S.teams[t].name)}</div><div class="plist">${sortPl(sideR.players).filter(p=>!L.includes(p.num)).map(p=>`<button class="pchip pick" data-act="radd" data-t="${t}" data-v="${esc(p.num)}"><b>#${esc(p.num)}</b> ${esc(p.name)}</button>`).join('')||'<span class="next">Všichni ze soupisky už jsou v sestavě.</span>'}</div>`:'';
  return `<div class="form"><div class="label">${t?'Domácí · pálí ve spodní polovině ▼':'Hosté · pálí v horní polovině ▲'}${t===ours()?' · náš tým':''}</div>
   <label for="n${t}">Název týmu<input type="text" id="n${t}" value="${esc(S.teams[t].name)}"></label>
   <div class="label">Pálkařské pořadí · ${L.length} hráčů</div>
   <div class="plist">${L.map((v,i)=>`<span class="pchip ${ui.sub&&ui.sub.t===t&&ui.sub.i===i?'subbing':''}"><span class="ord">${i+1}.</span><b>${esc(lbl(t,v))}</b>${anon(v)?`<button class="pbtn" aria-label="Doplnit číslo" title="Doplnit číslo dresu" data-act="pren" data-t="${t}" data-v="${i}">✎</button>`:''}<button class="pbtn" aria-label="Vystřídat" title="Vystřídat na tomto místě" data-act="psub" data-t="${t}" data-v="${i}">⇄</button>${i>0?`<button class="pbtn" aria-label="Posunout dopředu" data-act="pup" data-t="${t}" data-v="${i}">‹</button>`:''}<button class="pbtn x" aria-label="Odebrat" data-act="prem" data-t="${t}" data-v="${i}">×</button></span>`).join('')}</div>
   <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="add${t}" placeholder="Číslo dresu" aria-label="Číslo hráče"><button class="solid" data-act="padd" data-t="${t}">Přidat</button></div>
   ${ui.ren&&ui.ren.t===t?renPanel(t):ui.sub&&ui.sub.t===t?subPanel(t):pick}${t!==ours()?oppPick(t)+anonRow(t):''}
   ${ui.msg[t]?`<div class="msg">${esc(ui.msg[t])}</div>`:''}</div>`}
function teamView(){const ps=sortedRoster();
  return accessCard()+(WEB.role==='admin'?teamsCard()+adminCard():'')+`<div class="card form">
  <label for="tn">Název našeho týmu<input type="text" id="tn" value="${esc(R.name||S.teams[ours()].name)}"></label>
  <div class="label">Soupiska · ${ps.length} hráčů</div>
  ${ps.length?`<div class="roster">${ps.map(p=>`<div class="rrow"><b>#${esc(p.num)}</b><span>${esc(p.name)}</span><button class="pbtn x" aria-label="Odebrat ze soupisky" data-act="rdel" data-v="${esc(p.num)}">×</button></div>`).join('')}</div>`:'<div class="next">Soupiska je zatím prázdná. Přidej první hráče.</div>'}
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="rnum" placeholder="Č." aria-label="Číslo dresu" style="max-width:76px"><input type="text" id="rname" placeholder="Jméno" aria-label="Jméno hráče"><button class="solid" data-act="rnew">Přidat</button></div>
  ${ui.rmsg?`<div class="msg">${esc(ui.rmsg)}</div>`:''}
  <div class="next">Zadáním stejného čísla změníš jméno. Soupiska zůstává uložená i po novém zápasu.</div></div>
  ${ps.length?`<div class="card form"><div class="label">Sestava pro zápas</div><p class="next" style="margin:0">Hráče do pálkařského pořadí vybíráš v Nastavení u týmu „${esc(S.teams[ours()].name)}“.</p><div class="row"><button class="solid" data-act="tab" data-v="set">Vybrat sestavu</button><button class="ghost" data-act="rall">Celá soupiska podle čísel</button></div></div>`:''}`+attendCard()+teamTransferCard()+seasonView()}
function addRoster(){const num=jersey(document.getElementById('rnum').value),name=(document.getElementById('rname').value||'').trim();
  if(!num){ui.rmsg='Zadej číslo dresu.';render();return}
  const ex=R.players.find(p=>p.num===num);if(ex)ex.name=name;else R.players.push({num,name});
  saveR();ui.rmsg=ex?'Jméno u #'+num+' změněno.':'';render();const f=document.getElementById('rnum');if(f)f.focus()}
function setView(){const s=S.settings;
  return `<div class="card form">
  <div class="cols">${lineupEditor(0)}${lineupEditor(1)}</div>
  ${vsSelect()}<label for="ours">Náš tým (jména ze soupisky)<select id="ours" class="sel"><option value="0" ${ours()===0?'selected':''}>Hosté · ${esc(S.teams[0].name)}</option><option value="1" ${ours()===1?'selected':''}>Domácí · ${esc(S.teams[1].name)}</option></select></label>
  <button class="ghost" data-act="swap" ${started()?'disabled':''}>⇄ Prohodit domácí a hosty</button>
  ${started()?'<p class="next" style="margin:0">Prohodit jde jen před prvním odpalem.</p>':''}
  <label for="inn">Počet směn<input type="number" id="inn" min="1" max="12" value="${s.innings}"></label>
  <label for="maxa">O kolik met se pálkař může po odpalu nejvýš posunout<select id="maxa" class="sel">${[[1,'1 meta (jen 1B)'],[2,'2 mety (do 2B)'],[3,'3 mety (do 3B)'],[4,'bez omezení (i homerun)']].map(([v,l])=>`<option value="${v}" ${maxB()===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label for="tlim">Časový limit zápasu v minutách (0 = bez limitu)<input type="number" id="tlim" min="0" max="180" inputmode="numeric" value="${S.settings.timeLimit||0}"></label>
  <label for="swl">Maximum švihů na pálkaře, pak aut (0 = bez limitu)<input type="number" id="swl" min="0" max="20" inputmode="numeric" value="${swl()}"></label>
  <label for="lim">Polovina směny končí po 3 autech, nebo po tomto počtu bodů (0 = bez limitu)<input type="number" id="lim" min="0" max="30" inputmode="numeric" value="${lim()}"></label>
  <button class="solid" data-act="tab" data-v="game">Hotovo, k zápasu</button></div>
  <div class="card form"><div class="label">Nový zápas</div><p style="margin:0" class="next">Smaže všechny zapsané akce. Sestavy a nastavení zůstanou.</p>
  ${ui.confirm?'<div class="row"><button class="solid" style="background:var(--pencil)" data-act="reset">Ano, smazat zápis</button><button class="ghost" data-act="noreset">Zpět</button></div>':'<button class="ghost danger" data-act="askreset">Začít nový zápas</button>'}</div>
  <p class="next" style="margin:0">${SYNC&&SYNC.st==='ok'?'Zápis se ukládá v telefonu a online pro tvůj tým.':'Zápis se ukládá v tomto prohlížeči na tomto zařízení.'}</p>`+syncCard()+settingsExtra()}

function render(){if(ROLE==='login'){renderLogin();return}if(ROLE!=='scorer'){renderParent();return}document.getElementById('sub').textContent='t-ball · bez nadhozu';
  {const T=[['game','Zápas'],['sheet','Zápis'],['def','Obrana'],['score','Skóre'],['games','Zápasy'],['set','Nastavení'],['team','Tým']];const cur=(T.find(x=>x[0]===ui.tab)||T[0])[1];document.getElementById('tabs').innerHTML=teamSwitch()+`<div class="menu"><button class="menu-btn" data-act="menu" aria-haspopup="true" aria-expanded="${ui.menu?'true':'false'}"><span class="burger" aria-hidden="true"></span>${cur}<span class="caret" aria-hidden="true">${ui.menu?'▴':'▾'}</span></button>${ui.menu?`<div class="menu-list" role="menu">${T.map(([k,l])=>`<button role="menuitem" class="${ui.tab===k?'on':''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>`:''}</div>`}
  document.getElementById('view').innerHTML=ui.tab==='game'?gameView():ui.tab==='sheet'?sheetView():ui.tab==='team'?teamView():ui.tab==='score'?scoreView():ui.tab==='def'?defView():ui.tab==='games'?gamesView():setView()}

function addPlayer(t){const inp=document.getElementById('add'+t);const v=jersey(inp.value);
  if(!v){ui.msg[t]='Zadej číslo dresu (0–999).';render();return}
  if(S.teams[t].lineup.includes(v)){ui.msg[t]='Číslo #'+v+' už v sestavě je.';render();return}
  snap();S.teams[t].lineup.push(v);S.example=false;ui.msg=['',''];commit();const ni=document.getElementById('add'+t);if(ni)ni.focus()}

document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='subnum'){e.preventDefault();return doSub(e.target.value)}if(e.target.id==='rennum'){e.preventDefault();return doRen(e.target.value)}if(/^add[01]$/.test(e.target.id)){e.preventDefault();addPlayer(+e.target.id[3])}else if(e.target.id==='rnum'){e.preventDefault();const f=document.getElementById('rname');if(f)f.focus()}else if(e.target.id==='rname'){e.preventDefault();addRoster()}});

/* ---------- PDF export ---------- */
let DL=null;
DL={save:async({filename,data})=>{const b=data instanceof Blob?data:new Blob([data]);const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return{status:'saved'}}};
function pdfBox(){if(!DL)return'';
  return `<div class="card row" style="align-items:center"><button class="solid" data-act="pdf" ${ui.pdfBusy?'disabled':''}>Uložit zápis jako PDF</button>${ui.pdfMsg?`<span class="next">${esc(ui.pdfMsg)}</span>`:''}</div>`}
function playedInnings(){return Math.max(1,S.settings.innings,S.top?S.inning-1:S.inning)}
function drawPage(t){const W=2339,H=1654,M=90;const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const INK='#1c2836',MUT='#5d6b66',LINE='#b9c6b7',FIELD='#2c6a43',SOFT='#eef4ee',RED='#c0392b';
  const D='"Barlow Condensed","Arial Narrow",sans-serif',B='"Atkinson Hyperlegible",Arial,sans-serif';
  const n=playedInnings();
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  g.fillStyle=INK;g.font=`700 66px ${D}`;g.fillText(`${S.teams[0].name} vs ${S.teams[1].name}`,M,M+50);
  g.fillStyle=MUT;g.font=`400 30px ${B}`;g.fillText(`Zápis t-ballového utkání · ${metaLine()}`,M,M+95);
  g.fillStyle=INK;g.font=`700 38px ${D}`;g.fillText(`Pálí: ${S.teams[t].name} (${t?'domácí':'hosté'})`,M,M+150);
  // line score
  const lw=60,ln=240,lr=44,lsW=ln+lw*(n+3),x0=W-M-lsW,y0=M;
  g.textAlign='center';g.textBaseline='middle';
  const hdr=[...Array(n).keys()].map(i=>String(i+1)).concat(['B','O','Ch']);
  g.font=`600 28px ${D}`;g.fillStyle=MUT;hdr.forEach((h,i)=>g.fillText(h,x0+ln+lw*i+lw/2,y0+lr/2));
  [0,1].forEach(tt=>{const y=y0+lr*(tt+1);let tot=0;g.strokeStyle=LINE;g.lineWidth=2;g.beginPath();g.moveTo(x0,y);g.lineTo(x0+lsW,y);g.stroke();
    g.textAlign='left';g.font=`700 28px ${B}`;g.fillStyle=INK;g.fillText((tt?'D ':'H ')+S.teams[tt].name,x0,y+lr/2,ln-10);g.textAlign='center';
    for(let i=1;i<=n;i++){const pl=i<S.inning||(i===S.inning&&(tt===0||!S.top));const v=S.runs[tt][i-1]||0;if(pl)tot+=v;g.font=`400 28px ${B}`;g.fillText(pl?String(v):'',x0+ln+lw*(i-1)+lw/2,y+lr/2)}
    g.font=`700 28px ${B}`;[tot,S.hits[tt],S.errs[tt]].forEach((v,k)=>g.fillText(String(v),x0+ln+lw*(n+k)+lw/2,y+lr/2))});
  // sheet grid
  const top=M+200,nameW=250,cw=(W-2*M-nameW)/n,L=S.teams[t].lineup,rows=L.length;
  const rh=Math.min(120,(H-top-M-70)/(rows+2));
  g.fillStyle=SOFT;g.fillRect(M,top,W-2*M,rh);g.fillRect(M,top+rh*(rows+1),W-2*M,rh);
  g.strokeStyle=LINE;g.lineWidth=2;
  for(let r=0;r<=rows+2;r++){g.beginPath();g.moveTo(M,top+rh*r);g.lineTo(W-M,top+rh*r);g.stroke()}
  for(let i=0;i<=n;i++){const x=M+nameW+cw*i;g.beginPath();g.moveTo(x,top);g.lineTo(x,top+rh*(rows+2));g.stroke()}
  g.beginPath();g.moveTo(M,top);g.lineTo(M,top+rh*(rows+2));g.stroke();
  g.fillStyle=MUT;g.font=`600 32px ${D}`;g.textAlign='left';g.fillText('Hráč',M+16,top+rh/2);g.textAlign='center';
  for(let i=1;i<=n;i++)g.fillText(String(i),M+nameW+cw*(i-1)+cw/2,top+rh/2);
  L.forEach((num,p)=>{const y=top+rh*(p+1);g.textAlign='left';g.fillStyle=INK;g.font=`700 ${Math.min(40,rh*.45)}px ${D}`;const was=slotNums(t,p).filter(x=>x!==num);g.fillText(`${p+1}. ${lbl(t,num)}${was.length?' (dříve '+was.map(x=>'#'+x).join(', ')+')':''}`,M+16,y+rh/2,nameW-24);
    for(let i=1;i<=n;i++){const list=S.pas.filter(r=>r.t===t&&slotNums(t,p).includes(r.num)&&r.inn===i);if(!list.length)continue;const sw=cw/list.length;
      list.forEach((r,k)=>{const sx=M+nameW+cw*(i-1)+sw*k;const s=Math.min(rh*.6,sw*.42);const cx=sx+14+s/2,cy=y+rh/2;
        const P=[[cx,cy+s/2],[cx+s/2,cy],[cx,cy-s/2],[cx-s/2,cy]];
        g.beginPath();P.forEach((q,j)=>j?g.lineTo(...q):g.moveTo(...q));g.closePath();
        if(r.scored){g.fillStyle=FIELD;g.fill()}g.strokeStyle=LINE;g.lineWidth=2;g.stroke();
        if(r.reach>0){g.beginPath();g.moveTo(...P[0]);for(let j=1;j<=r.reach;j++)g.lineTo(...P[j%4]);g.strokeStyle=INK;g.lineWidth=4;g.lineCap='round';g.stroke()}
        const fs=Math.min(34,rh*.38);g.font=`700 ${fs}px ${D}`;g.fillStyle=INK;g.textAlign='left';const tx=cx+s/2+10;g.fillText(r.code,tx,cy);
        let ex=tx+g.measureText(r.code).width+20;
        if(r.outNo){g.beginPath();g.arc(ex,cy,fs*.42,0,Math.PI*2);g.strokeStyle=RED;g.lineWidth=2.5;g.stroke();g.fillStyle=RED;g.font=`700 ${fs*.55}px ${B}`;g.textAlign='center';g.fillText(String(r.outNo),ex,cy+1)}
        if(r.sw){g.fillStyle=MUT;g.font=`700 ${Math.min(22,rh*.24)}px ${B}`;g.textAlign='right';g.textBaseline='alphabetic';g.fillText(String(r.sw),sx+sw-8,y+rh-8);g.textBaseline='middle'}})}});
  const fy=top+rh*(rows+1);g.textAlign='left';g.fillStyle=INK;g.font=`700 32px ${D}`;g.fillText('Body',M+16,fy+rh/2);g.textAlign='center';
  for(let i=1;i<=n;i++){const pl=i<S.inning||(i===S.inning&&(t===0||!S.top));g.fillText(pl?String(S.runs[t][i-1]||0):'',M+nameW+cw*(i-1)+cw/2,fy+rh/2)}
  g.textAlign='left';g.fillStyle=MUT;g.font=`400 26px ${B}`;
  g.fillText('1B–3B odpal na metu · HR homerun · K aut po max. švizích · 6-3 zemní aut · F8 chycený · E5 chyba · FC volba polaře · plný diamant = bod · červené číslo = pořadí autu · malé číslo vpravo dole = švihy',M,H-M+40,W-2*M);
  return c}
async function makePdf(){if(!DL)return;ui.pdfBusy=true;ui.pdfMsg='Připravuji PDF…';render();
  try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;
    if(!window.jspdf)throw{code:'nolib'};
    const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    [0,1].forEach((t,i)=>{if(i)doc.addPage();doc.addImage(drawPage(t).toDataURL('image/jpeg',0.92),'JPEG',0,0,297,210)});
    const fn=('zapis-'+S.teams[0].name+'-'+S.teams[1].name+'-'+meta().date).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.pdf';
    const res=await DL.save({filename:fn,data:doc.output('blob')});
    ui.pdfMsg=res&&res.status==='delivered'?'PDF odesláno.':'PDF uloženo.'}
  catch(e){const c=e&&e.code;ui.pdfMsg=c==='declined'?'Ukládání zrušeno.':c==='rate_limited'?'Chvíli počkej a zkus to znovu.':c==='nolib'?'Knihovnu pro PDF se nepodařilo načíst. Zkontroluj připojení.':'PDF se nepodařilo uložit.'}
  ui.pdfBusy=false;render()}

/* ---------- live score for parents ---------- */
let PA_ENDED=false,PUB_T=null,HALF_ENDED=false,ROLE=webRole(),LIVE=null;


function liveData(final){const t=bt();return{v:1,ours:ours(),next:ourNext(),teams:S.teams.map(x=>x.name),runs:S.runs.map(a=>Array.from(a,x=>x||0)),
  inning:S.inning,top:S.top,outs:S.outs,bases:S.bases.map(b=>b!=null),batter:short(S.teams[t].lineup[S.bat[t]]),innings:S.settings.innings,final:!!final,sheet:{lineups:S.teams.map(x=>x.lineup.slice()),pas:S.pas.map(r=>[r.t,r.num,r.inn,r.code,r.scored?4:r.reach,r.outNo||0])},updated:new Date().toISOString()}}
const fmtTime=iso=>{try{return new Date(iso).toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'})}catch(e){return''}};
function miniBases(b){const P=[[52,30],[30,8],[8,30]];return `<svg viewBox="0 0 60 60" class="pb-dia" role="img" aria-label="Obsazené mety"><polygon points="30,52 52,30 30,8 8,30" class="dia-in"/>${P.map(([x,y],i)=>`<rect x="${x-6}" y="${y-6}" width="12" height="12" transform="rotate(45 ${x} ${y})" class="base ${b[i]?'on':''}"/>`).join('')}</svg>`}
function board(L){const tot=t=>(L.runs[t]||[]).reduce((a,b)=>a+(b||0),0);const n=Math.max(L.innings,L.top?L.inning-1:L.inning,1);
  let h=`<div class="card pb"><div class="pb-head">${L.final?'Konec zápasu':`${L.inning}. směna · ${L.top?'▲ horní':'▼ dolní'} polovina`}</div>
  <div class="pb-score"><div class="pb-team ${L.ours===0?'ours':''}"><span>${esc(L.teams[0])}</span><small>hosté${L.ours===0?' · náš tým':''}</small></div><div class="pb-num">${tot(0)}<i>:</i>${tot(1)}</div><div class="pb-team r ${L.ours===1?'ours':''}"><span>${esc(L.teams[1])}</span><small>domácí${L.ours===1?' · náš tým':''}</small></div></div>`;
  if(!L.final)h+=`<div class="pb-state">${miniBases(L.bases)}<div><div class="cnt">Auty ${dots(L.outs,3,'o')}</div><div class="next">Pálí ${esc(L.teams[L.top?0:1])} · na pálce ${esc(L.batter)}</div></div></div>`;
  if(!L.final&&L.next&&L.next.length&&L.ours!=null)h+=`<div class="pb-next"><span class="label">${esc(L.teams[L.ours])} · pořadí na pálce</span><div>${L.next.map((x,k)=>`<b class="${k===0&&(L.top?0:1)===L.ours?'now':''}">${esc(x)}</b>`).join('')}</div></div>`;
  h+=scoreTable({teams:L.teams,runs:L.runs,inning:L.inning,top:L.top,n,ours:L.ours,final:L.final});
  return h+`<div class="next">Aktualizováno v ${fmtTime(L.updated)}</div></div>`}



/* scoreView, publishLive a autoPub jsou ve webovém modulu na konci */



/* ---------- match info (date, field) ---------- */
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function meta(){if(!S.meta)S.meta={};if(!S.meta.date)S.meta.date=todayISO();return S.meta}
function metaLine(){const m=meta();let d=m.date;try{const [y,mo,da]=m.date.split('-').map(Number);d=new Date(y,mo-1,da).toLocaleDateString('cs-CZ')}catch(e){}return d+(m.field?' · hřiště: '+m.field:'')+(kindTxt(m)?' · '+kindTxt(m):'')}
function metaCard(){const m=meta();return `<div class="card form meta"><div class="cols2"><label for="md">Datum<input type="date" id="md" value="${esc(m.date)}"></label><label for="mf">Hřiště<input type="text" id="mf" value="${esc(m.field||'')}" placeholder="např. hřiště Sokol"></label>${metaSel('my','Typ zápasu',GTYPES,m.type)}${metaSel('mc','Soutěž',COMPS,m.comp)}</div></div>`}
const metaSel=(id,label,list,cur)=>`<label for="${id}">${label}<select id="${id}" class="sel"><option value="">–</option>${list.map(v=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;

/* =========== extras: timer, defense, playing time, history, season, recap, backup =========== */
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
if(!S.gameId){S.gameId=newId();save()}
const range=n=>Array.from({length:n},(_,i)=>i+1);
const innCount=()=>Math.max(S.settings.innings,S.inning);
const HITS=['1B','2B','3B','HR'];

function actLabel(code,arg){const t=bt(),who=nm(t,S.bat[t]);
  switch(code){case 'hit':return who+' '+HITS[arg-1];case 'swing':return who+' švih';case 'out':return who+' aut '+arg.code;case 'E':return who+' E'+arg;case 'FC':return who+' FC';
    case 'adv':{const id=S.bases[arg];return (id!=null?pn(S.pas[id]):'běžec')+' posun'}case 'rout':{const id=S.bases[arg];return (id!=null?pn(S.pas[id]):'běžec')+' aut'}
    case 'endhalf':return 'konec poloviny';default:return String(code)}}
function ourNext(){const o=ours(),L=S.teams[o].lineup;if(!L.length)return[];const out=[];for(let k=0;k<Math.min(5,L.length);k++)out.push(short(L[(S.bat[o]+k)%L.length]));return out}

/* ----- game timer ----- */
const tlim=()=>S.settings.timeLimit||0;
function clockAutoStart(){if(!S.clock)S.clock={start:null};if(!S.clock.start)S.clock.start=Date.now()}
function clockNow(){const c=S.clock;if(!c||!c.start)return null;const s=Math.max(0,Math.floor(((c.end||Date.now())-c.start)/1000));return{s,txt:Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}}
function clockState(){const c=clockNow(),L=tlim()*60;if(!c||!L)return'';const left=L-c.s;return left<=0?'over':left<=600?'warn':''}
function clockCard(){const c=clockNow(),st=clockState(),L=tlim();let msg='';
  if(st==='over')msg='Čas vypršel. Dohrajte rozehranou směnu.';else if(st==='warn')msg='Zbývá '+Math.ceil((L*60-c.s)/60)+' min. Zvaž, jestli začít další směnu.';
  const btn=!c?'<button class="mini-btn" data-act="clkstart">Spustit</button>':ui.clkC?'<button class="mini-btn out" data-act="clkyes">Opravdu vynulovat</button><button class="mini-btn" data-act="clkno">Ne</button>':'<button class="mini-btn" data-act="clkreset">Vynulovat</button>';
  return `<div class="card clock ${st}"><span class="label">Čas zápasu</span><b id="clk">${c?c.txt:'0:00'}</b>${L?`<span class="next">z ${L} min</span>`:''}<span class="clkbtns">${btn}</span>${msg?`<div class="clkmsg">${msg}</div>`:''}</div>`}
let CLK_ST=null;
setInterval(()=>{const el=document.getElementById('clk');if(!el)return;const c=clockNow();if(c)el.textContent=c.txt;const st=clockState();if(CLK_ST!==null&&st!==CLK_ST&&ROLE==='scorer'&&ui.tab==='game'&&!ui.panel)render();CLK_ST=st},1000);

/* ----- defense ----- */
const POSN={...POS,10:'další zadák',B:'lavička'};
const POS_ORDER=['1','2','3','4','5','6','7','8','9','10','B'];
const posTxt=p=>p==='B'?'Lavička':p==='10'?'Další zadák':p+' · '+POSN[p];
const posShort=p=>p==='B'?'L':p==='10'?'Z+':p;
const defL=()=>S.teams[ours()].lineup;
function defOf(i){if(!S.def)S.def={};if(!S.def[i])S.def[i]={};return S.def[i]}
function defFill(i){const d=defOf(i);defL().forEach((n,k)=>{d[n]=k<9?String(k+1):'10'})}
function defRotate(i){const L=defL(),p=defOf(i-1),d=defOf(i);const pos=L.map(n=>p[n]||'B');L.forEach((n,k)=>{d[n]=pos[(k-1+L.length)%L.length]})}
function defWarn(d){const cnt={};Object.values(d).forEach(p=>{if(p&&p!=='B'&&p!=='10')cnt[p]=(cnt[p]||0)+1});
  const dup=Object.keys(cnt).filter(p=>cnt[p]>1);const miss=range(9).map(String).filter(p=>!cnt[p]);const w=[];
  if(dup.length)w.push('Dvakrát obsazeno: '+dup.map(p=>POSN[p]).join(', ')+'.');
  if(miss.length&&miss.length<9&&defL().length>=9)w.push('Neobsazeno: '+miss.map(p=>POSN[p]).join(', ')+'.');
  return w.length?`<div class="msg">${w.join(' ')}</div>`:''}
function defView(){const L=defL(),n=innCount();let i=ui.defInn||Math.min(S.inning,n);if(i>n)i=n;ui.defInn=i;const d=defOf(i);
  let h=`<div class="card form"><div class="label">Obrana · ${esc(S.teams[ours()].name)}</div>
  <div class="tabs innt">${range(n).map(k=>`<button class="${k===i?'on':''}" data-act="definn" data-v="${k}">${k}. směna</button>`).join('')}</div>
  <div class="row">${i>1?`<button class="ghost" data-act="defrot">Rotovat z ${i-1}. směny</button>`:''}<button class="ghost" data-act="deffill">Podle pořadí</button><button class="ghost" data-act="defclear">Vymazat</button></div>
  <div class="defl">${L.map(num=>`<div class="defrow"><label for="dp-${esc(num)}"><b>${esc(lbl(ours(),num))}</b></label><select id="dp-${esc(num)}" class="sel" data-num="${esc(num)}"><option value="">–</option>${POS_ORDER.map(p=>`<option value="${p}" ${d[num]===p?'selected':''}>${posTxt(p)}</option>`).join('')}</select></div>`).join('')}</div>
  ${defWarn(d)}<p class="next" style="margin:0">Rotace posune každého hráče na pozici, kterou v minulé směně hrál hráč před ním v pořadí. Tak se během zápasu vystřídají na různých místech.</p></div>`;
  return h+playTimeCard()}

/* ----- fair playing time ----- */
function playTimeCard(){const o=ours(),L=defL(),n=innCount();if(!L.length)return'';
  const rows=[...new Set([...L,...(S.subs||[]).filter(x=>x.t===o).map(x=>x.out)])].map(num=>{const pa=S.pas.filter(r=>r.t===o&&r.num===num);let inf=0,outf=0,bench=0;const pos=[];
    for(let i=1;i<=n;i++){const p=S.def&&S.def[i]&&S.def[i][num];pos.push(p?posShort(p):'·');if(!p)continue;if(p==='B')bench++;else if(+p>=7)outf++;else inf++}
    return{num,pa:pa.length,on:pa.filter(r=>HITS.includes(r.code)||r.code==='FC'||r.code[0]==='E').length,runs:pa.filter(r=>r.scored).length,inf,outf,bench,pos}});
  const minPa=Math.min(...rows.map(r=>r.pa)),maxPa=Math.max(...rows.map(r=>r.pa)),minB=Math.min(...rows.map(r=>r.bench));
  return `<div class="card"><div class="label">Herní čas · ${esc(S.teams[ours()].name)}</div><div class="ls-wrap"><table class="pt">
  <thead><tr><th>Hráč</th><th>Pálil</th><th>Met</th><th>Body</th><th>Vnitř.</th><th>Vnější</th><th>Lav.</th><th>Pozice po směnách</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td class="nm">${esc(lbl(o,r.num))}</td><td class="${maxPa-minPa>=2&&r.pa===minPa?'low':''}">${r.pa}</td><td>${r.on}</td><td>${r.runs}</td><td>${r.inf}</td><td>${r.outf}</td><td class="${r.bench>minB+1?'low':''}">${r.bench}</td><td class="posl">${r.pos.join(' ')}</td></tr>`).join('')}
  </tbody></table></div><p class="next" style="margin:6px 0 0">Vnitř. = vnitřní pole, nadhazovač a catcher, Vnější = zadáci. Červeně: hráč je pozadu oproti ostatním.</p></div>`}

/* ----- history & season ----- */
const HKEY='tball-history-v1';
const loadHFor=tid=>{const x=store.get(keyFor(HKEY,tid),[]);return Array.isArray(x)?x:[]};
const loadH=()=>loadHFor(TEAMS.cur);
const saveH=h=>store.set(tkey(HKEY),h);
function archiveGame(){if(!S.pas.length)return false;meta();const H=loadH();const g=JSON.parse(JSON.stringify(S));g.ours=ours();g.savedAt=new Date().toISOString();
  const i=H.findIndex(x=>x.gameId===g.gameId);if(i>=0)H[i]=g;else H.unshift(g);H.sort((a,b)=>String(b.meta&&b.meta.date).localeCompare(String(a.meta&&a.meta.date)));const ok=saveH(H);mirrorGame(g);return ok}
const gTot=(g,t)=>(g.runs[t]||[]).reduce((a,b)=>a+(b||0),0);
function gDate(g){const d=g.meta&&g.meta.date;if(!d)return'';const [y,m,da]=d.split('-').map(Number);return new Date(y,m-1,da).toLocaleDateString('cs-CZ')}
const avg=(a,b)=>(a/b).toFixed(3);
const inFilter=g=>(!ui.fType||(g.meta&&g.meta.type)===ui.fType)&&(!ui.fComp||(g.meta&&g.meta.comp)===ui.fComp);
const allTeams=()=>ui.allTeams&&TEAMS.list.length>1;
function seasonData(){const H=loadH();let games=[];
  const teams=allTeams()?TEAMS.list.map(t=>t.id):[TEAMS.cur];
  teams.forEach(tid=>{const h=tid===TEAMS.cur?H:loadHFor(tid),cur=tid===TEAMS.cur?S:store.get(keyFor(KEY,tid),null),ros=tid===TEAMS.cur?R:store.get(keyFor(RKEY,tid),{players:[]})||{players:[]};
    const nameOf=n=>((ros.players||[]).find(p=>p.num===n)||{}).name||'';
    h.forEach(g=>games.push({g,tid,nameOf}));if(cur&&cur.pas&&cur.pas.length&&!h.some(g=>g.gameId===cur.gameId))games.push({g:cur,tid,nameOf})});
  games=games.filter(x=>inFilter(x.g));const st={};
  games.forEach(({g,tid,nameOf})=>{const o=g.ours??1;const seen=new Set();(g.pas||[]).filter(r=>r.t===o&&!anon(r.num)).forEach(r=>{const nm=nameOf(r.num),key=allTeams()?(nm?r.num+'|'+nm:tid+'|'+r.num):r.num;
    const s=st[key]||(st[key]={num:r.num,label:'#'+r.num+(nm?' '+nm:''),g:0,pa:0,h:0,xb:0,r:0,ob:0,k:0});
    if(!seen.has(key)){seen.add(key);s.g++}s.pa++;if(HITS.includes(r.code))s.h++;if(HITS.slice(1).includes(r.code))s.xb++;if(r.scored)s.r++;if(HITS.includes(r.code)||r.code==='FC'||r.code[0]==='E')s.ob++;if(r.code==='K')s.k++})});
  return{H,games:games.map(x=>x.g),rows:Object.values(st).sort((a,b)=>(+a.num)-(+b.num))}}
function seasonView(){const {H,games,rows}=seasonData();const o=ours();
  const all=loadH().length+(S.pas.length&&!loadH().some(g=>g.gameId===S.gameId)?1:0);
  let h=`<div class="card"><div class="label">Sezóna · statistiky hráčů</div>${TEAMS.list.length>1?`<div class="row filt"><button class="ghost ${allTeams()?'':'on-btn'}" data-act="stteam">Jen tento tým</button><button class="ghost ${allTeams()?'on-btn':''}" data-act="stall">Všechny týmy</button></div>`:''}${all?`<div class="cols2 filt">${metaSel('ft','Typ zápasu',GTYPES,ui.fType).replace('<option value="">–</option>','<option value="">všechny</option>')}${metaSel('fc','Soutěž',COMPS,ui.fComp).replace('<option value="">–</option>','<option value="">všechny</option>')}</div>`:''}`;
  if(!rows.length)h+=`<p class="next" style="margin:6px 0 0">${all?'Žádný zápas neodpovídá zvolenému filtru.':'Statistiky se objeví po prvním zapsaném zápase.'}</p>`;
  else h+=`<div class="ls-wrap"><table class="pt"><thead><tr><th>Hráč</th><th>Záp.</th><th>Pálil</th><th>Odpaly</th><th>Na metě</th><th>Body</th><th>K</th><th>Úspěš.</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td class="nm">${esc(r.label)}</td><td>${r.g}</td><td>${r.pa}</td><td>${r.h}${r.xb?` <small>(${r.xb} dlouhé)</small>`:''}</td><td>${r.ob}</td><td>${r.r}</td><td>${r.k}</td><td>${r.pa?avg(r.ob,r.pa):'–'}</td></tr>`).join('')}
    </tbody></table></div><p class="next" style="margin:6px 0 0">${games.length} ${games.length===1?'zápas':games.length<5?'zápasy':'zápasů'}. Úspěšnost = jak často se hráč po svém odpalu dostal na metu.</p>`;
  h+=(rows.length?`<div class="row" style="margin-top:8px"><button class="ghost" data-act="csvseason">Export statistik (CSV)</button></div>`:'')+csvBox()+(ui.hMsg?`<div class="next">${esc(ui.hMsg)}</div>`:'')+`</div>`+achCard();
  return h}
function historyCard(){const H=loadH();let h=`<div class="card"><div class="label">Historie zápasů</div>`;
  if(!H.length)h+='<p class="next" style="margin:6px 0 0">Zatím nic. Zápas se uloží tlačítkem v Zápisu, při „Konec zápasu“ nebo při založení nového zápasu.</p>';
  else h+=`<div class="hist">${H.map(g=>{const go=g.ours??1,a=gTot(g,go),b=gTot(g,1-go),res=a>b?'V':a<b?'P':'R';
    return `<div class="hrow"><span class="res r${res}">${res}</span><div class="hmain"><b>${esc(g.teams[go].name)} ${a} : ${b} ${esc(g.teams[1-go].name)}</b><span class="next">${esc(gDate(g))}${g.meta&&g.meta.field?' · '+esc(g.meta.field):''}${kindTxt(g.meta)?' · '+esc(kindTxt(g.meta)):''}${g.gameId===S.gameId?' · právě otevřený':''}${g.stars&&g.stars.length?' · ⭐ '+g.stars.map(x=>esc(short(x))).join(' '):''}</span></div>
    <div class="hbtns">${ui.hdel===g.gameId?`<button class="mini-btn out" data-act="hdelyes" data-v="${esc(g.gameId)}">Smazat</button><button class="mini-btn" data-act="hdelno">Ne</button>`:`${g.gameId===S.gameId?'':`<button class="mini-btn" data-act="hopen" data-v="${esc(g.gameId)}">Otevřít</button>`}<button class="mini-btn out" data-act="hdel" data-v="${esc(g.gameId)}" aria-label="Smazat zápas">×</button>`}</div></div>`}).join('')}</div>
    <p class="next" style="margin:6px 0 0">Otevřený zápas najdeš v Zápisu, odkud ho můžeš uložit i jako PDF. Rozehraný zápas se před otevřením uloží do historie.</p>`;
  return h+(ui.hMsg?`<div class="next">${esc(ui.hMsg)}</div>`:'')+'</div>'}
const gamesView=()=>scheduleCard()+oppCard()+historyCard();

/* ----- recap text ----- */
function summaryText(){const o=ours(),st={};S.pas.filter(r=>r.t===o).forEach(r=>{const x=st[r.num]||(st[r.num]={h:0,r:0});if(HITS.includes(r.code))x.h++;if(r.scored)x.r++});
  const list=(k)=>Object.entries(st).filter(([,x])=>x[k]>0).sort((a,b)=>b[1][k]-a[1][k]).map(([n,x])=>lbl(o,n)+(x[k]>1?' ('+x[k]+')':'')).join(', ');
  let s=`${S.teams[0].name} ${gTot(S,0)} : ${gTot(S,1)} ${S.teams[1].name}\n${metaLine()}`;
  const hl=list('h'),rl=list('r');if(hl)s+=`\nOdpaly: ${hl}`;if(rl)s+=`\nBody: ${rl}`;
  s+=recapExtra();const pi=Math.max(1,S.top?S.inning-1:S.inning);const hh=S.hits[o];s+=`\n${S.teams[o].name}: ${hh} ${hh===1?'odpal':hh>=2&&hh<=4?'odpaly':'odpalů'} za ${pi} ${pi===1?'směnu':pi<5?'směny':'směn'}. Díky všem za skvělý zápas!`;return s}
function gameTools(){let h=`<div class="card form"><div class="label">Po zápase</div>${starsBlock()}${achNow()}
  <div class="row"><button class="ghost" data-act="sum">Shrnutí pro rodiče</button><button class="ghost" data-act="hsave">Uložit do historie</button><button class="ghost" data-act="csvgame">Export zápisu (CSV)</button></div>`;
  if(ui.sum)h+=`<textarea readonly id="sumtext" class="bktext">${esc(summaryText())}</textarea><div class="row"><button class="solid" data-act="sumcopy">Kopírovat text</button><button class="ghost" data-act="sumclose">Zavřít</button></div>`;
  h+=csvBox();
  return h+(ui.gMsg?`<div class="next">${esc(ui.gMsg)}</div>`:'')+'</div>'}

/* ----- backup ----- */
function backupData(){save();saveR();const data={};TEAMS.list.forEach(t=>{data[t.id]={S:store.get(keyFor(KEY,t.id),null),R:store.get(keyFor(RKEY,t.id),null),H:loadHFor(t.id),Sch:store.get(keyFor(SKEY,t.id),[])}});
  return{app:'tball-scorekeeper',v:2,when:new Date().toISOString(),S,R,H:loadH(),teams:{list:TEAMS.list,data},opponents:loadOpp()}}
function settingsExtra(){return `<div class="card form"><div class="label">Záloha</div><p class="next" style="margin:0">Uloží soupisku, rozehraný zápas i historii do jednoho souboru. Na jiném telefonu ho pak obnovíš.</p>
  <div class="row">${DL?'<button class="solid" data-act="bkup">Zálohovat do souboru</button>':'<button class="solid" data-act="bkshow">Zobrazit zálohu</button>'}<label class="ghost filebtn" for="bkfile">Obnovit ze souboru<input type="file" id="bkfile" accept=".json,application/json" class="vh"></label></div>
  ${ui.bkText?`<textarea readonly class="bktext" id="bktext">${esc(ui.bkText)}</textarea><button class="ghost" data-act="bkcopy">Kopírovat zálohu</button>`:''}
  ${ui.bkPending?`<div class="msg">Obnovit zálohu z ${esc(new Date(ui.bkPending.when).toLocaleString('cs-CZ'))}? ${ui.bkPending.teams&&ui.bkPending.teams.list?' Obsahuje '+ui.bkPending.teams.list.length+' '+(ui.bkPending.teams.list.length===1?'tým':'týmy')+'.':''} Přepíše soupisky, zápasy i historii v tomto telefonu.</div><div class="row"><button class="solid" data-act="bkapply">Ano, obnovit</button><button class="ghost" data-act="bkcancel">Zrušit</button></div>`:''}
  ${ui.bkMsg?`<div class="next">${esc(ui.bkMsg)}</div>`:''}</div>`}
async function copyFrom(id,okMsg){const el=document.getElementById(id);const txt=el?el.value:'';try{await navigator.clipboard.writeText(txt);return okMsg}catch(e){if(el){el.focus();el.select()}return'Text je označený, zkopíruj ho ručně.'}}

/* =========== one dispatcher for every tap and every field change =========== */
const num=(x,lo,hi)=>{const n=parseInt(x,10);return n>=lo?Math.min(n,hi):null};
async function copyAct(id,key,ok){const r=await copyFrom(id,ok);ui[key]=r;render();if(r!==ok)selectText(id)}
function selectText(id){const t=document.getElementById(id);if(t){t.focus();t.select()}}
const ACT={
  tab:v=>{ui.menu=false;ui.tab=v;ui.confirm=false;ui.msg=['',''];render()},
  menu:()=>{ui.menu=!ui.menu;render()},
  sheet:v=>{ui.sheet=+v;render()},
  /* scoring */
  hit:v=>{if(+v>=1&&+v<=maxB())act('hit',+v)},adv:v=>{if(S.bases[+v]!=null)act('adv',+v)},rout:v=>{if(S.bases[+v]!=null)act('rout',+v)},
  swing:()=>act('swing'),FC:()=>act('FC'),endhalf:()=>act('endhalf'),undo:()=>undo(),swap:()=>swapTeams(),
  openout:()=>{ui.panel='out';ui.seq=[];render()},openerr:()=>{ui.panel='err';render()},cancel:()=>{ui.panel=null;ui.seq=[];render()},
  chip:v=>{if(ui.panel==='err')act('E',+v);else{ui.seq.push(+v);render()}},
  ground:()=>ui.seq.length&&act('out',{code:ui.seq.join('-')}),fly:()=>ui.seq.length&&act('out',{code:'F'+ui.seq[ui.seq.length-1]}),sac:()=>ui.seq.length&&act('out',{code:'SAC '+ui.seq.join('-'),sac:true}),
  /* roster & lineup */
  rnew:()=>addRoster(),padd:(v,t)=>addPlayer(t),
  rdel:v=>{R.players=R.players.filter(p=>p.num!==v);saveR();ui.rmsg='';render()},
  rall:()=>{const o=ours();snap();S.teams[o].lineup=sortedRoster().map(p=>p.num);S.bat[o]=0;S.example=false;ui.rmsg='Sestava nastavena z celé soupisky.';commit()},
  radd:(v,t)=>{const L=S.teams[t].lineup;if(L.includes(v))return;snap();L.push(v);S.example=false;ui.msg=['',''];commit()},
  prem:(v,t)=>{const L=S.teams[t].lineup;if(L.length<=1){ui.msg[t]='V sestavě musí zůstat aspoň jeden hráč.';return render()}
    snap();const i=+v;L.splice(i,1);S.subs=(S.subs||[]).filter(x=>!(x.t===t&&x.slot===i)).map(x=>x.t===t&&x.slot>i?{...x,slot:x.slot-1}:x);if(S.bat[t]>i)S.bat[t]--;S.bat[t]%=L.length;S.example=false;ui.msg=['',''];commit()},
  psub:(v,t)=>{ui.sub={t,i:+v};ui.subMsg='';render();const f=document.getElementById('subnum');if(f)f.focus()},
  psubno:()=>{ui.sub=null;render()},psubpick:v=>doSub(v),psubgo:()=>{const f=document.getElementById('subnum');doSub(f?f.value:'')},
  pup:(v,t)=>{const L=S.teams[t].lineup,i=+v;snap();[L[i-1],L[i]]=[L[i],L[i-1]];(S.subs||[]).forEach(x=>{if(x.t===t){if(x.slot===i)x.slot=i-1;else if(x.slot===i-1)x.slot=i}});S.example=false;commit()},
  /* new game */
  askreset:()=>{ui.confirm=true;render()},noreset:()=>{ui.confirm=false;render()},
  reset:()=>{archiveGame();const k={settings:S.settings,teams:S.teams,ours:S.ours};S=fresh();Object.assign(S,k);S.example=false;hist=[];ui.confirm=false;ui.tab='game';commit()},
  /* pdf & live score */
  pdf:()=>makePdf(),pubnow:()=>publishLive(false),pubfinal:()=>endGame(true),iamscorer:()=>{ROLE='scorer';render()},
  /* clock */
  clkstart:()=>{S.clock={start:Date.now()};commit()},clkreset:()=>{ui.clkC=true;render()},clkno:()=>{ui.clkC=false;render()},
  clkyes:()=>{ui.clkC=false;S.clock={start:null};commit()},
  /* defense */
  definn:v=>{ui.defInn=+v;render()},
  defrot:()=>{snap();defRotate(ui.defInn);commit()},deffill:()=>{snap();defFill(ui.defInn);commit()},defclear:()=>{snap();defOf(ui.defInn);S.def[ui.defInn]={};commit()},
  /* history */
  hsave:()=>{ui.gMsg=archiveGame()?'Uloženo do historie. Najdeš ji v záložce Zápasy.':S.pas.length?'Uložení se nepovedlo.':'Zatím není co ukládat.';render()},
  hopen:v=>{const g=loadH().find(x=>x.gameId===v);if(!g)return;archiveGame();S=JSON.parse(JSON.stringify(g));delete S.savedAt;hist=[];ui.tab='sheet';ui.hMsg='';commit()},
  hdel:v=>{ui.hdel=v;render()},hdelno:()=>{ui.hdel=null;render()},
  hdelyes:v=>{saveH(loadH().filter(x=>x.gameId!==v));ui.hdel=null;ui.hMsg='Zápas smazán z historie.';render()},
  /* recap */
  sum:()=>{ui.sum=true;ui.gMsg='';render()},sumclose:()=>{ui.sum=false;render()},
  sumcopy:()=>copyAct('sumtext','gMsg','Zkopírováno. Vlož text do skupiny rodičů.'),
  /* backup */
  bkshow:()=>{ui.bkText=JSON.stringify(backupData());ui.bkMsg='Zálohu zkopíruj a ulož si ji třeba do poznámek.';render()},
  bkcopy:()=>copyAct('bktext','bkMsg','Záloha zkopírována.'),
  bkup:async()=>{try{await DL.save({filename:'tball-zaloha-'+todayISO()+'.json',data:JSON.stringify(backupData())});ui.bkMsg='Záloha uložena.'}catch(err){ui.bkMsg=err&&err.code==='declined'?'Ukládání zrušeno.':'Zálohu se nepodařilo uložit.'}render()},
  bkcancel:()=>{ui.bkPending=null;render()},
  bkapply:()=>{const b=ui.bkPending;if(!b||!b.S||!b.S.teams)return;if(b.teams&&Array.isArray(b.teams.list)&&b.teams.list.length&&b.teams.data)return restoreAllTeams(b);S=b.S;if(b.R&&Array.isArray(b.R.players))R=b.R;saveR();saveH(Array.isArray(b.H)?b.H:[]);hist=[];ui.bkPending=null;ui.bkMsg='Záloha obnovena.';commit()},
};
const CHG={
  n0:v=>{if(v.trim())S.teams[0].name=v.trim()},n1:v=>{if(v.trim())S.teams[1].name=v.trim()},
  tn:v=>{R.name=v.trim();saveR();if(R.name)S.teams[ours()].name=R.name;saveTeams()},
  ours:v=>{S.ours=+v;render()},
  inn:v=>{const n=num(v,1,12);if(n)S.settings.innings=n},
  maxa:v=>{S.settings.maxAdvance=+v},
  swl:v=>{const n=num(v,0,20);if(n!=null)S.settings.swingLimit=n},
  lim:v=>{const n=num(v,0,30);if(n!=null)S.settings.runLimit=n},
  tlim:v=>{const n=num(v,0,180);if(n!=null)S.settings.timeLimit=n},
  md:v=>{meta().date=v||todayISO()},mf:v=>{meta().field=v.trim()},my:v=>{meta().type=v},mc:v=>{meta().comp=v},ft:v=>{ui.fType=v;render()},fc:v=>{ui.fComp=v;render()},
  'pub-auto':(v,el)=>{S.settings.autoPub=el.checked},
  bkfile:(v,el)=>{const f=el.files&&el.files[0];if(!f)return;readJson(f,b=>{if(b.kind==='team'){ui.tmPending=b;ui.tab='team';return}if(!b.S||!b.S.teams)throw 0;ui.bkPending=b;ui.bkMsg=''},m=>ui.bkMsg=m)},
  tmfile:(v,el)=>{const f=el.files&&el.files[0];if(f)readJson(f,b=>{if(b.kind==='team')ui.tmPending=b;else if(b.R&&Array.isArray(b.R.players))ui.tmPending=teamFromBackup(b);else throw 0;ui.tmMsg=''},m=>ui.tmMsg=m)},
};
document.addEventListener('click',e=>{
  if(ui.menu&&!e.target.closest('.menu')){ui.menu=false;render();return}
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;const f=ACT[el.dataset.act];if(f)f(el.dataset.v,+el.dataset.t)});
document.addEventListener('change',e=>{const el=e.target,id=el.id||'';
  if(id.startsWith('dp-')){const d=defOf(ui.defInn);if(el.value)d[el.dataset.num]=el.value;else delete d[el.dataset.num];save();return render()}
  if(id.startsWith('att-')){const n=id.slice(4),a=attList();S.att=el.checked?[...new Set([...a,n])]:a.filter(x=>x!==n);save();return render()}
  const f=CHG[id];if(f){f(el.value,el);save()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.menu){ui.menu=false;render()}});

/* ----- substitution on the same batting slot (ČBA § 9.5.7: libovolné střídání, ale jen na místě vystřídaného) ----- */
function slotNums(t,i){const cur=S.teams[t].lineup[i],h=[];(S.subs||[]).forEach(x=>{if(x.t===t&&x.slot===i){h.push(x.out,x.in)}});h.push(cur);return[...new Set(h)]}
function subPanel(t){const {i}=ui.sub,L=S.teams[t].lineup,out=L[i];
  const sr=rosterSide(t),picks=sr?sortPl(sr.players).filter(p=>!L.includes(p.num)):[];
  return `<div class="subp"><div class="label">Střídání na ${i+1}. místě v pořadí · za ${esc(lbl(t,out))}</div>
  ${picks.length?`<div class="plist">${picks.map(p=>`<button class="pchip pick" data-act="psubpick" data-v="${esc(p.num)}"><b>#${esc(p.num)}</b> ${esc(p.name)}</button>`).join('')}</div>`:''}
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="subnum" placeholder="Číslo náhradníka" aria-label="Číslo náhradníka"><button class="solid" data-act="psubgo">Vystřídat</button><button class="ghost" data-act="psubno">Zrušit</button></div>
  ${ui.subMsg?`<div class="msg">${esc(ui.subMsg)}</div>`:''}
  <p class="next" style="margin:0">Náhradník bude pálit na tomto místě. Vystřídaný hráč se může později vrátit, ale zase jen na toto místo.</p></div>`}
function doSub(raw){if(!ui.sub)return;const {t,i}=ui.sub,L=S.teams[t].lineup,num=jersey(raw);
  if(!num){ui.subMsg='Zadej číslo dresu náhradníka.';return render()}
  if(L.includes(num)){ui.subMsg='#'+num+' už v pořadí je. Hráč smí pálit jen na jednom místě.';return render()}
  const elsewhere=(S.subs||[]).find(x=>x.t===t&&x.slot!==i&&(x.out===num||x.in===num));
  if(elsewhere){ui.subMsg='#'+num+' už pálil na '+(elsewhere.slot+1)+'. místě. Může se vrátit jen tam.';return render()}
  snap();const out=L[i];L[i]=num;(S.subs=S.subs||[]).push({t,slot:i,out,in:num,inn:S.inning});
  if(t===ours()&&S.def){const d=S.def[S.inning];if(d&&d[out]&&!d[num]){d[num]=d[out];delete d[out]}}
  log('střídání: '+lbl(t,num)+' za '+lbl(t,out)+' ('+(i+1)+'. v pořadí)');S.example=false;ui.sub=null;ui.subMsg='';commit()}

/* =========== v4: oprava zápisu, soupeř bez sestavy, úspěchy, hvězdy, rozpis, docházka, CSV, živý zápis =========== */
/* ----- oprava starší akce ----- */
const isHit=c=>HITS.includes(c),isErr=c=>/^E\d/.test(c||'');
function paEditor(){const r=S.pas[ui.edit];if(!r)return'';
  return `<div class="card form panel"><div class="label">Oprava zápisu · ${esc(lbl(r.t,r.num))} · ${r.inn}. směna</div>
  <label for="pe-code">Výsledek<input type="text" id="pe-code" maxlength="12" value="${esc(r.code)}" placeholder="např. 1B, 6-3, F8, E5, FC, K"></label>
  <div class="plist">${['1B','2B','3B','HR','6-3','4-3','F8','E5','FC','K'].map(c=>`<button class="pchip pick" data-act="pecode" data-v="${c}">${c}</button>`).join('')}</div>
  <div class="cols2"><label for="pe-reach">Kam se dostal<select id="pe-reach" class="sel">${['nedostal se na metu','1. meta','2. meta','3. meta','doběhl domů (bod)'].map((l,i)=>`<option value="${i}" ${(r.scored?4:r.reach)===i?'selected':''}>${l}</option>`).join('')}</select></label>
  <label for="pe-out">Aut<select id="pe-out" class="sel"><option value="">bez autu</option>${[1,2,3].map(n=>`<option value="${n}" ${r.outNo===n?'selected':''}>${n}. aut směny</option>`).join('')}</select></label></div>
  ${ui.peMsg?`<div class="msg">${esc(ui.peMsg)}</div>`:''}
  <div class="row"><button class="solid" data-act="pesave">Uložit opravu</button><button class="ghost" data-act="pecancel">Zrušit</button></div>
  <p class="next" style="margin:0">Oprava změní zápis, body, odpaly a chyby. Mety a auty právě hrané směny zůstanou, jak jsou.</p></div>`}
function paSave(){const r=S.pas[ui.edit];if(!r)return;const g=id=>document.getElementById(id);
  const code=(g('pe-code').value||'').trim().toUpperCase(),reach=+g('pe-reach').value,out=g('pe-out').value;
  if(!code){ui.peMsg='Zadej výsledek, např. 1B nebo 6-3.';return render()}
  snap();const o={code:r.code,scored:r.scored},runs=S.runs[r.t];
  r.code=code;r.scored=reach===4;r.reach=reach;r.outNo=out?+out:null;
  if(o.scored!==r.scored)runs[r.inn-1]=Math.max(0,(runs[r.inn-1]||0)+(r.scored?1:-1));
  if(isHit(o.code)!==isHit(code))S.hits[r.t]=Math.max(0,S.hits[r.t]+(isHit(code)?1:-1));
  if(isErr(o.code)!==isErr(code))S.errs[1-r.t]=Math.max(0,S.errs[1-r.t]+(isErr(code)?1:-1));
  if(r.scored||r.outNo)S.bases=S.bases.map(b=>b===r.id?null:b);
  log('oprava zápisu: '+lbl(r.t,r.num)+' '+o.code+' → '+code);ui.edit=null;ui.peMsg='';commit()}

/* ----- soupeř bez sestavy ----- */
function anonRow(t){return `<div class="anonrow"><span class="next">Neznáte sestavu soupeře? Místa v pořadí:</span>${[5,6,7,8,9].map(n=>`<button class="mini-btn" data-act="anon" data-t="${t}" data-v="${n}">${n}</button>`).join('')}</div>`}
function renPanel(t){const {i}=ui.ren;return `<div class="subp"><div class="label">Číslo dresu pro ${i+1}. místo v pořadí</div>
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="rennum" placeholder="Číslo dresu" aria-label="Číslo dresu"><button class="solid" data-act="rengo">Uložit</button><button class="ghost" data-act="renno">Zrušit</button></div>
  ${ui.renMsg?`<div class="msg">${esc(ui.renMsg)}</div>`:''}<p class="next" style="margin:0">Číslo se doplní i do všech dosavadních zápisů tohoto hráče.</p></div>`}
function doRen(raw){if(!ui.ren)return;const {t,i}=ui.ren,L=S.teams[t].lineup,num=jersey(raw);
  if(!num){ui.renMsg='Zadej číslo dresu.';return render()}
  if(L.includes(num)||(S.subs||[]).some(x=>x.t===t&&(x.in===num||x.out===num))){ui.renMsg='#'+num+' už v zápisu je.';return render()}
  snap();const old=L[i];L[i]=num;S.pas.forEach(r=>{if(r.t===t&&r.num===old)r.num=num});
  (S.subs||[]).forEach(x=>{if(x.t===t){if(x.out===old)x.out=num;if(x.in===old)x.in=num}});
  ui.ren=null;ui.renMsg='';commit()}

/* ----- úspěchy dětí ----- */
const ACH=[['hit','první odpal',r=>isHit(r.code)],['run','první doběhnutý bod',r=>r.scored],['xb','první dlouhý odpal',r=>HITS.slice(1).includes(r.code)],['hr','první homerun',r=>r.code==='HR']];
function gamesChrono(){const g=loadH().filter(x=>x.gameId!==S.gameId);if(S.pas.length)g.push(S);const k=x=>String(x.meta&&x.meta.date)+'|'+String(x.gameId).padStart(14,'0');return g.sort((a,b)=>k(a).localeCompare(k(b)))}
/* who caught a fly out: position from the code (F8 = střední zadák), player from that inning's defense */
function catcherOf(g,r){const m=/^F(\d)$/.exec(r.code||''),d=g.def&&g.def[r.inn];if(!m||!d)return null;return Object.keys(d).find(n=>d[n]===m[1])||null}
function achievements(){const seen={},out=[];gamesChrono().forEach(g=>{const o=g.ours??1,add=(num,k,label)=>{const key=num+'|'+k;if(!seen[key]){seen[key]=1;out.push({num,label,gameId:g.gameId,date:g.meta&&g.meta.date})}};
  (g.pas||[]).forEach(r=>{if(r.t===o){if(!anon(r.num))ACH.forEach(([k,label,f])=>{if(f(r))add(r.num,k,label)})}else{const c=catcherOf(g,r);if(c&&!anon(c))add(c,'fo','první chycený aut ze vzduchu')}})});return out}
function flyouts(g){const o=g.ours??1,by={};let unknown=0;(g.pas||[]).filter(r=>r.t!==o&&/^F\d$/.test(r.code)).forEach(r=>{const c=catcherOf(g,r);if(c)by[c]=(by[c]||0)+1;else unknown++});return{by,unknown}}
const achThisGame=()=>achievements().filter(a=>a.gameId===S.gameId);
function achNow(){const a=achThisGame();return a.length?`<div class="ach"><div class="label">Poprvé v sezóně</div>${a.map(x=>`<span class="achip">🎉 ${esc(lbl(ours(),x.num))} · ${esc(x.label)}</span>`).join('')}</div>`:''}
function achCard(){const a=achievements();if(!a.length)return'';const by={};a.forEach(x=>(by[x.num]=by[x.num]||[]).push(x));
  return `<div class="card"><div class="label">Úspěchy v sezóně</div><div class="achl">${Object.keys(by).sort((a,b)=>(+a)-(+b)).map(n=>`<div class="achr"><b>${esc(lbl(ours(),n))}</b><span>${by[n].map(x=>`🎉 ${esc(x.label)} <small>${esc(x.date?gDate({meta:{date:x.date}}):'')}</small>`).join('<br>')}</span></div>`).join('')}</div></div>`}

/* ----- hvězda zápasu ----- */
function starSuggest(){const o=ours(),sc={};S.pas.filter(r=>r.t===o&&!anon(r.num)).forEach(r=>{sc[r.num]=(sc[r.num]||0)+(isHit(r.code)?2:0)+(r.scored?2:0)+(r.reach>0?1:0)});
  return Object.entries(sc).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n])=>n)}
function starsBlock(){const o=ours(),players=[...new Set([...S.teams[o].lineup,...(S.subs||[]).filter(x=>x.t===o).map(x=>x.out)])].filter(n=>!anon(n));if(!players.length)return'';
  const st=S.stars||[],sug=starSuggest();
  return `<div class="ach"><div class="label">Hvězda zápasu (nejvýš 3)</div><div class="plist">${players.map(n=>`<button class="pchip pick ${st.includes(n)?'star-on':''}" data-act="star" data-v="${esc(n)}">${st.includes(n)?'⭐ ':''}${esc(lbl(o,n))}${sug.includes(n)&&!st.includes(n)?' <small>návrh</small>':''}</button>`).join('')}</div>
  ${sug.length&&!st.length?'<button class="ghost" data-act="starsug" style="align-self:flex-start">Použít návrh</button>':''}</div>`}
function recapExtra(){let s='';const fo=flyouts(S),fk=Object.keys(fo.by);if(fk.length||fo.unknown)s+='\nChycené auty ze vzduchu: '+[...fk.sort((a,b)=>fo.by[b]-fo.by[a]).map(n=>lbl(ours(),n)+(fo.by[n]>1?' ('+fo.by[n]+')':'')),...(fo.unknown?[fo.unknown+'× bez zapsané obrany']:[])].join(', ');const by={};achThisGame().forEach(x=>(by[x.num]=by[x.num]||[]).push(x.label));const k=Object.keys(by);if(k.length)s+='\nPoprvé v sezóně: '+k.map(n=>lbl(ours(),n)+' ('+by[n].join(', ')+')').join('; ');
  if(S.stars&&S.stars.length)s+='\nHvězd'+(S.stars.length>1?'y':'a')+' zápasu: '+S.stars.map(n=>lbl(ours(),n)).join(', ')+' ⭐';return s}

/* ----- docházka ----- */
const attList=()=>Array.isArray(S.att)?S.att:sortedRoster().map(p=>p.num);
function attendCard(){const ps=sortedRoster();if(!ps.length)return'';const a=attList();
  return `<div class="card form"><div class="label">Kdo dnes hraje · ${a.filter(n=>ps.some(p=>p.num===n)).length} z ${ps.length}</div>
  <div class="attl">${ps.map(p=>`<label class="radio att" for="att-${esc(p.num)}"><input type="checkbox" id="att-${esc(p.num)}" ${a.includes(p.num)?'checked':''}> <b>#${esc(p.num)}</b> ${esc(p.name)}</label>`).join('')}</div>
  <div class="row"><button class="solid" data-act="attlineup">Sestavit pořadí z přítomných</button><button class="ghost" data-act="attdef">…a vyplnit obranu</button></div>
  <p class="next" style="margin:0">V U7 hraje 5–9 dětí, víc jen po dohodě trenérů.</p>${ui.attMsg?`<div class="next">${esc(ui.attMsg)}</div>`:''}</div>`}
function attLineup(withDef){if(S.pas.some(r=>r.t===ours())){ui.attMsg='Pořadí z přítomných jde sestavit jen před prvním odpalem našeho týmu. Během zápasu použij střídání (⇄ v Nastavení).';return render()}const a=attList(),L=sortedRoster().map(p=>p.num).filter(n=>a.includes(n));if(!L.length){ui.attMsg='Nikdo není zaškrtnutý.';return render()}
  const o=ours();snap();S.teams[o].lineup=L;S.bat[o]=0;S.subs=(S.subs||[]).filter(x=>x.t!==o);if(withDef)defFill(1);S.example=false;
  ui.attMsg='Pořadí: '+L.map(n=>'#'+n).join(', ')+(withDef?'. Obrana 1. směny je vyplněná.':'.');commit()}

/* ----- rozpis zápasů ----- */
const SKEY='tball-schedule-v1',OKEY='tball-opp-v1';
const GTYPES=['Scrimmage','Friendly','Přebor','Turnaj'],COMPS=['Baseball U9','Softball U10'];
const kindTxt=m=>[m&&m.type,m&&m.comp].filter(Boolean).join(' · ');
const optList=(id,label,list)=>`<label for="${id}">${label}<select id="${id}" class="sel">${list.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`;
const loadSch=()=>{const x=store.get(tkey(SKEY),[]);return Array.isArray(x)?x:[]};
const saveSch=x=>store.set(tkey(SKEY),x);
function scheduleCard(){const list=loadSch().filter(x=>!x.played).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  return `<div class="card form"><div class="label">Rozpis zápasů</div>
  ${list.length?`<div class="hist">${list.map(x=>`<div class="hrow"><span class="res rR">${x.home?'D':'H'}</span><div class="hmain"><b>${esc(R.name||S.teams[ours()].name)} – ${esc(x.opp)}</b><span class="next">${esc(gDate({meta:{date:x.date}}))}${x.time?' · '+esc(x.time):''}${x.field?' · '+esc(x.field):''} · ${x.home?'doma':'venku'}${kindTxt(x)?'<br>'+esc(kindTxt(x)):''}</span></div><div class="hbtns"><button class="mini-btn" data-act="schstart" data-v="${esc(x.id)}">Začít</button><button class="mini-btn out" data-act="schdel" data-v="${esc(x.id)}" aria-label="Smazat z rozpisu">×</button></div></div>`).join('')}</div>`:'<p class="next" style="margin:0">Zatím žádné naplánované zápasy.</p>'}
  <div class="cols2"><label for="sch-d">Datum<input type="date" id="sch-d" value="${todayISO()}"></label><label for="sch-t">Čas<input type="time" id="sch-t"></label>
  <label for="sch-o">Soupeř<input type="text" id="sch-o" placeholder="název týmu"></label>${oppSchedSelect()}${TEAMS.list.length>1?`<label for="sch-v">…nebo můj tým<select id="sch-v" class="sel"><option value="">ne, cizí tým</option>${TEAMS.list.filter(t=>t.id!==TEAMS.cur).map(t=>`<option value="${esc(t.id)}">${esc(teamName(t))}</option>`).join('')}</select></label>`:''}<label for="sch-f">Hřiště<input type="text" id="sch-f" placeholder="kde se hraje"></label>
  <label for="sch-h">Hrajeme<select id="sch-h" class="sel"><option value="1">doma (pálíme druzí)</option><option value="0">venku (pálíme první)</option></select></label>
  ${optList('sch-y','Typ zápasu',GTYPES)}${optList('sch-c','Soutěž',COMPS)}</div>
  <button class="ghost" data-act="schadd" style="align-self:flex-start">Přidat do rozpisu</button>${ui.schMsg?`<div class="next">${esc(ui.schMsg)}</div>`:''}
  <p class="next" style="margin:0">„Začít“ uloží rozehraný zápas do historie a založí nový s vyplněným soupeřem, datem a hřištěm. Soupeř dostane místa v pořadí bez čísel.</p></div>`}
function schAdd(){const g=id=>(document.getElementById(id)||{}).value||'';const vs=TEAMS.list.find(t=>t.id===g('sch-v')&&t.id!==TEAMS.cur),so=!vs&&oppById(g('sch-p'));const opp=vs?teamName(vs):so?so.name:g('sch-o').trim();if(!opp){ui.schMsg='Doplň soupeře.';return render()}
  const x={id:newId(),date:g('sch-d')||todayISO(),time:g('sch-t'),opp,field:g('sch-f').trim(),home:g('sch-h')!=='0',type:g('sch-y')||GTYPES[0],comp:g('sch-c')||COMPS[0]};if(vs)x.vsTid=vs.id;else if(so){x.oppId=so.id;const oc=oppComps(so);if(oc.length===1&&!oc.includes(x.comp))x.comp=oc[0]}const l=loadSch();l.push(x);saveSch(l);if(vs)twinSchedule(x);ui.schMsg='Přidáno: '+opp+(vs?'. Zápas je i v rozpisu týmu '+opp+'.':'.');render()}
function schStart(id){const l=loadSch(),x=l.find(y=>y.id===id);if(!x)return;archiveGame();
  const o=ours(),me={name:R.name||S.teams[o].name,lineup:S.teams[o].lineup.slice()},vs=x.vsTid&&TEAMS.list.some(t=>t.id===x.vsTid)?x.vsTid:null,so=!vs&&oppById(x.oppId),them={name:so?so.name:x.opp,lineup:vs?sideLineup(vs):so?oppLineup(so):range(9).map(i=>'?'+i)};
  const keep=S.settings;S=fresh();S.settings=keep;S.teams=x.home?[them,me]:[me,them];S.ours=x.home?1:0;S.meta={date:x.date,field:x.field,type:x.type,comp:x.comp};S.example=false;if(vs)S.vsTid=vs;else if(so)S.oppId=so.id;
  x.played=true;x.gameId=S.gameId;saveSch(l);if(vs)twinPlayed(x);hist=[];ui.tab='game';commit()}

/* ----- CSV export ----- */
const csvBox=()=>ui.csvText?`<textarea readonly id="csvtext" class="bktext">${esc(ui.csvText)}</textarea><div class="row"><button class="solid" data-act="csvcopy">Kopírovat CSV</button><button class="ghost" data-act="csvclose">Zavřít</button></div>`:'';
const csvCell=v=>{v=String(v??'');return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const csv=rows=>'\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
function csvGame(){const rows=[['Směna','Polovina','Tým','Hráč','Výsledek','Kam se dostal','Bod','Aut','Švihy']];
  S.pas.forEach(r=>rows.push([r.inn,r.t?'dolní':'horní',S.teams[r.t].name,lbl(r.t,r.num),r.code,['–','1. meta','2. meta','3. meta','domů'][r.scored?4:r.reach],r.scored?'ano':'',r.outNo||'',r.sw||'']));return csv(rows)}
function csvSeason(){const {rows}=seasonData();return csv([['Hráč','Zápasy','Pálil','Odpaly','Dlouhé odpaly','Na metě','Body','K','Úspěšnost']].concat(rows.map(r=>[r.label,r.g,r.pa,r.h,r.xb,r.ob,r.r,r.k,r.pa?avg(r.ob,r.pa):''])))}
async function saveCsv(name,text){if(DL){try{await DL.save({filename:name,data:text});ui.gMsg=ui.hMsg='Soubor uložen.'}catch(e){ui.gMsg=ui.hMsg=e&&e.code==='declined'?'Ukládání zrušeno.':'Soubor se nepodařilo uložit.'}ui.csvText=''}
  else{ui.csvText=text;ui.gMsg=ui.hMsg='Ukládání souborů tady není dostupné. Text zkopíruj a vlož do tabulky.'}render()}

/* ----- živý zápis pro asistenta a rodiče (jen čísla) ----- */
function liveSheet(L){if(!L||!L.sheet)return'';if(!ui.lsheet)return '<button class="ghost" data-act="lsheet" style="align-self:flex-start">Zobrazit celý zápis</button>';
  const n=Math.max(L.innings,L.inning,1),P=L.sheet.pas,codeOf=x=>esc(x[3])+(x[4]===4?' •':'')+(x[5]?` <small>(${x[5]})</small>`:'');
  const team=t=>{const nums=[...new Set([...(L.sheet.lineups[t]||[]),...P.filter(x=>x[0]===t).map(x=>x[1])])];
    return `<div class="label">${esc(L.teams[t])}</div><div class="sheet-wrap"><table class="sheet"><thead><tr><th>Hráč</th>${range(n).map(i=>`<th>${i}</th>`).join('')}</tr></thead><tbody>${nums.map(num=>`<tr><td class="nm">${esc(short(num))}</td>${range(n).map(i=>`<td class="c">${P.filter(x=>x[0]===t&&x[1]===num&&x[2]===i).map(codeOf).join('<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`};
  return `<div class="card form">${team(0)}${team(1)}<p class="next" style="margin:0">• = doběhl domů, (2) = pořadí autu. Zápis se obnoví s každým odeslaným skóre.</p><button class="ghost" data-act="lsheet" style="align-self:flex-start">Skrýt zápis</button></div>`}

Object.assign(ACT,{
  paedit:v=>{ui.edit=+v;ui.peMsg='';render();window.scrollTo&&window.scrollTo(0,0)},pecancel:()=>{ui.edit=null;render()},pesave:()=>paSave(),
  pecode:v=>{const f=document.getElementById('pe-code');if(f)f.value=v},
  anon:(v,t)=>{if(S.pas.some(r=>r.t===t)){ui.msg[t]='Bez sestavy jde nastavit jen před prvním odpalem tohoto týmu.';return render()}snap();S.teams[t].lineup=range(+v).map(i=>'?'+i);S.bat[t]=0;S.example=false;ui.msg=['',''];commit()},
  pren:(v,t)=>{ui.ren={t,i:+v};ui.sub=null;ui.renMsg='';render();const f=document.getElementById('rennum');if(f)f.focus()},renno:()=>{ui.ren=null;render()},
  rengo:()=>{const f=document.getElementById('rennum');doRen(f?f.value:'')},
  star:v=>{const st=S.stars||[];if(st.includes(v))S.stars=st.filter(x=>x!==v);else if(st.length<3)S.stars=[...st,v];else{ui.gMsg='Nejvýš 3 hvězdy. Nejdřív jednu odeber.';return render()}ui.gMsg='';commit()},
  starsug:()=>{S.stars=starSuggest();commit()},
  attlineup:()=>attLineup(false),attdef:()=>attLineup(true),
  schadd:()=>schAdd(),schdel:v=>{saveSch(loadSch().filter(x=>x.id!==v));render()},schstart:v=>schStart(v),
  csvgame:()=>saveCsv('zapis-'+(S.teams[0].name+'-'+S.teams[1].name+'-'+meta().date).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.csv',csvGame()),
  csvseason:()=>saveCsv('statistiky-sezona-'+[ui.fType,ui.fComp].filter(Boolean).map(x=>x.replace(/\s+/g,'-')+'-').join('')+todayISO()+'.csv',csvSeason()),
  csvcopy:()=>copyAct('csvtext','gMsg','Zkopírováno.'),csvclose:()=>{ui.csvText='';render()},
  lsheet:()=>{ui.lsheet=!ui.lsheet;render()},
});
/* ----- konec zápasu ----- */
const resultTxt=()=>`${esc(S.teams[0].name)} ${gTot(S,0)} : ${gTot(S,1)} ${esc(S.teams[1].name)}`;
function endConfirm(){const live=liveOn()&&S.settings.pubOn;
  return `<div class="card form panel"><div class="label">Ukončit zápas?</div><div class="fin-score">${resultTxt()}</div>
  <p class="next" style="margin:0">Zápis se uzamkne, zastaví se čas a zápas se uloží do historie.${live?' Rodičům se pošle konečné skóre.':''} Kdyby to bylo omylem, zápis jde znovu otevřít.</p>
  <div class="row"><button class="solid" data-act="endyes">Ano, ukončit zápas</button><button class="ghost" data-act="endno">Zpět k zápisu</button></div></div>`}
function finalCard(){const o=ours(),a=gTot(S,o),b=gTot(S,1-o),res=a>b?'Vyhráli jsme':a<b?'Prohráli jsme':'Remíza';
  return `<div class="card form fin"><div class="label">🏁 Zápas skončil · ${res}</div><div class="fin-score">${resultTxt()}</div>
  ${achNow()}
  ${saveBox()}
  <div class="row"><button class="solid" data-act="tab" data-v="sheet">Shrnutí a hvězdy</button><button class="ghost" data-act="tab" data-v="set">Nový zápas</button></div>
  <button class="ghost" data-act="endundo" style="align-self:flex-start">Znovu otevřít zápis</button></div>`}
function saveBox(){if(!DL)return `<p class="next" style="margin:0">Ukládání souborů tady telefon nedovolí. Otevři zápisník v aplikaci Claude nebo v prohlížeči.</p>`;
  return `<div class="savebox"><div class="label">Uložit na Google Disk</div>
  <div class="row"><button class="ghost" data-act="pdf" ${ui.pdfBusy?'disabled':''}>📄 Uložit PDF zápis</button><button class="ghost" data-act="bkup">💾 Uložit zálohu</button></div>
  ${ui.pdfMsg?`<div class="next">PDF: ${esc(ui.pdfMsg)}</div>`:''}${ui.bkMsg?`<div class="next">Záloha: ${esc(ui.bkMsg)}</div>`:''}
  <p class="next" style="margin:0">Soubor se uloží do telefonu. Pak ho otevři ve Stažených souborech a přes <b>Sdílet → Disk</b> ho pošli na Google Disk. Záloha obsahuje soupisku i všechny zápasy, dá se z ní všechno obnovit v Nastavení.</p></div>`}
function endGame(force){if(!S.pas.length&&!force){ui.endC=false;return render()}
  snap();S.final=true;ui.endC=false;ui.panel=null;if(S.clock&&S.clock.start&&!S.clock.end)S.clock.end=Date.now();
  clearTimeout(PUB_T);PUB_T=null;log('konec zápasu · '+gTot(S,0)+' : '+gTot(S,1));save();archiveGame();
  if(liveOn()&&(S.settings.pubOn||force))publishLive(true);else render()}
Object.assign(ACT,{
  endask:()=>{ui.endC=true;ui.panel=null;render()},endno:()=>{ui.endC=false;render()},endyes:()=>endGame(false),
  endundo:()=>{snap();S.final=false;if(S.clock)delete S.clock.end;log('zápis znovu otevřen');commit()},
});
/* ----- přenos týmu (soupiska + nastavení) na jiné zařízení ----- */
const TEAM_SETTINGS=['innings','runLimit','swingLimit','maxAdvance','timeLimit'];
function teamData(){const st={};TEAM_SETTINGS.forEach(k=>{if(S.settings[k]!=null)st[k]=S.settings[k]});
  return{app:'tball-scorekeeper',kind:'team',v:1,when:new Date().toISOString(),R:{name:R.name||S.teams[ours()].name,players:R.players},settings:st,lineup:S.teams[ours()].lineup.filter(n=>!anon(n))}}
const teamFromBackup=b=>({app:b.app,kind:'team',v:1,when:b.when,R:b.R,settings:(b.S&&b.S.settings)||{},lineup:[]});
function readJson(f,ok,bad){const rd=new FileReader();rd.onload=()=>{try{const b=JSON.parse(rd.result);if(!b||b.app!=='tball-scorekeeper')throw 0;ok(b)}catch(e){bad('Tohle není soubor z této aplikace.')}render()};rd.readAsText(f)}
function teamTransferCard(){const p=ui.tmPending;
  return `<div class="card form"><div class="label">Přenos týmu na jiné zařízení</div>
  <p class="next" style="margin:0">Uloží soupisku (čísla a jména), název týmu a pravidla zápasu do malého souboru. Pošli ho na Google Disk (Sdílet → Disk) a na druhém telefonu ho tady načti. Zápasy a historie se nemění.</p>
  <div class="row">${DL?'<button class="solid" data-act="tmsave">Uložit tým do souboru</button>':'<button class="solid" data-act="tmshow">Zobrazit data týmu</button>'}<label class="ghost filebtn" for="tmfile">Načíst tým ze souboru<input type="file" id="tmfile" accept=".json,application/json" class="vh"></label></div>
  ${ui.tmText?`<textarea readonly class="bktext" id="tmtext">${esc(ui.tmText)}</textarea><button class="ghost" data-act="tmcopy">Kopírovat</button>`:''}
  ${p?`<div class="msg">Načíst tým „${esc(p.R&&p.R.name||'bez názvu')}“ (${(p.R&&p.R.players||[]).length} hráčů)${p.when?' uložený '+esc(new Date(p.when).toLocaleString('cs-CZ')):''}? Nahradí soupisku a pravidla v tomto telefonu.</div><div class="row"><button class="solid" data-act="tmapply">Ano, načíst</button><button class="ghost" data-act="tmcancel">Zrušit</button></div>`:''}
  ${ui.tmMsg?`<div class="next">${esc(ui.tmMsg)}</div>`:''}</div>`}
function teamApply(){const b=ui.tmPending;if(!b||!b.R||!Array.isArray(b.R.players)){ui.tmPending=null;return render()}
  snap();R={name:b.R.name||'',players:b.R.players.filter(p=>p&&jersey(p.num)).map(p=>({num:jersey(p.num),name:String(p.name||'')}))};saveR();
  TEAM_SETTINGS.forEach(k=>{if(b.settings&&b.settings[k]!=null)S.settings[k]=b.settings[k]});
  const o=ours();if(R.name)S.teams[o].name=R.name;
  if(!S.pas.some(r=>r.t===o)&&Array.isArray(b.lineup)&&b.lineup.length){S.teams[o].lineup=b.lineup.filter(jersey);S.bat[o]=0;S.example=false}
  saveTeams();ui.tmPending=null;ui.tmMsg='Tým načten: '+R.players.length+' hráčů.';commit()}
Object.assign(ACT,{
  tmsave:async()=>{try{await DL.save({filename:('tym-'+(R.name||S.teams[ours()].name)+'-'+todayISO()).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.json',data:JSON.stringify(teamData())});ui.tmMsg='Uloženo. Teď ho pošli na Google Disk (Sdílet → Disk).'}catch(e){ui.tmMsg=e&&e.code==='declined'?'Ukládání zrušeno.':'Soubor se nepodařilo uložit.'}render()},
  tmshow:()=>{ui.tmText=JSON.stringify(teamData());ui.tmMsg='Text zkopíruj a ulož, třeba do poznámky na Google Disku.';render()},
  tmcopy:()=>copyAct('tmtext','tmMsg','Zkopírováno.'),
  tmapply:()=>teamApply(),tmcancel:()=>{ui.tmPending=null;render()},
});
/* =========== více týmů =========== */
const teamName=t=>t.id===TEAMS.cur?(R.name||S.teams[ours()].name||t.name||'Tým'):(t.name||((store.get(keyFor(RKEY,t.id),null)||{}).name)||'Tým');
function saveTeams(){TEAMS.list.forEach(t=>{if(t.id===TEAMS.cur)t.name=R.name||t.name});store.set(TEAMS_KEY,{list:TEAMS.list,ts:Date.now()});try{localStorage.setItem(TCUR_KEY,JSON.stringify(TEAMS.cur))}catch(e){}}
function teamSwitch(){if(TEAMS.list.length<2)return'';
  return `<label class="tsw" for="teamsel"><span class="vh">Tým</span><select id="teamsel" class="sel">${TEAMS.list.map(t=>`<option value="${esc(t.id)}" ${t.id===TEAMS.cur?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>`}
function loadTeam(tid){TEAMS.cur=tid;try{localStorage.setItem(TCUR_KEY,JSON.stringify(tid))}catch(e){}
  R=store.get(tkey(RKEY),null);if(!R||!Array.isArray(R.players))R={name:(TEAMS.list.find(t=>t.id===tid)||{}).name||'',players:[]};
  S=store.get(tkey(KEY),null);if(!S||!S.teams){S=fresh();if(R.name)S.teams[ours()].name=R.name;if(R.players.length){S.teams[ours()].lineup=sortedRoster().map(p=>p.num);S.example=false}}
  hist=[];clearTimeout(PUB_T);PUB_T=null;Object.assign(ui,{panel:null,seq:[],sheet:0,confirm:false,msg:['',''],edit:null,sub:null,ren:null,endC:false,tmPending:null,bkPending:null,sum:false,csvText:'',defInn:null,gMsg:'',hMsg:'',attMsg:'',schMsg:'',fType:'',fComp:''})}
function switchTeam(tid){if(tid===TEAMS.cur||!TEAMS.list.some(t=>t.id===tid))return;save();saveR();loadTeam(tid);render()}
function teamsCard(){const L=TEAMS.list;
  return `<div class="card form"><div class="label">Moje týmy · ${L.length}</div>
  <div class="hist">${L.map(t=>{const cur=t.id===TEAMS.cur,n=(cur?R:store.get(keyFor(RKEY,t.id),{players:[]})).players.length,g=loadHFor(t.id).length;
    return `<div class="hrow"><span class="res ${cur?'rV':'rR'}">${cur?'✓':''}</span><div class="hmain"><b>${esc(teamName(t))}</b><span class="next">${n} hráčů · ${g} ${g===1?'zápas':g>=2&&g<=4?'zápasy':'zápasů'} v historii${cur?' · vybraný':''}</span></div>
    <div class="hbtns">${cur?'':`<button class="mini-btn" data-act="tsel" data-v="${esc(t.id)}">Přepnout</button>`}${L.length>1&&!cur?(ui.tdel===t.id?`<button class="mini-btn out" data-act="tdelyes" data-v="${esc(t.id)}">Smazat vše</button><button class="mini-btn" data-act="tdelno">Ne</button>`:`<button class="mini-btn out" data-act="tdel" data-v="${esc(t.id)}" aria-label="Smazat tým">×</button>`):''}</div></div>`}).join('')}</div>
  ${ui.tdel?'<p class="msg" style="margin:0">Smazáním týmu zmizí jeho soupiska, rozpis, historie i statistiky. Nejde to vrátit.</p>':''}
  <div class="addrow"><input type="text" id="tnew" placeholder="Název nového týmu, např. Eagles Blue" aria-label="Název nového týmu"><button class="solid" data-act="tadd">+ Přidat tým</button></div>
  ${ui.tMsg?`<div class="next">${esc(ui.tMsg)}</div>`:''}
  <p class="next" style="margin:0">Každý tým má vlastní soupisku, pravidla, rozpis, historii, statistiky i rozehraný zápas. Mezi týmy přepínáš nahoře vedle menu.</p></div>`}
function addTeam(){const f=document.getElementById('tnew'),name=(f&&f.value||'').trim();if(!name){ui.tMsg='Napiš název nového týmu.';return render()}
  if(TEAMS.list.length>=6){ui.tMsg='Víc než 6 týmů zápisník nezvládne.';return render()}
  save();saveR();const id='t'+newId();TEAMS.list.push({id,name});
  const keep=S.settings;loadTeam(id);S.settings={...keep};R.name=name;S.teams[ours()].name=name;
  saveR();save();saveTeams();ui.tMsg='Tým „'+name+'“ je vytvořený a vybraný. Přidej do něj hráče níže.';ui.tab='team';render()}
function deleteTeam(tid){if(tid===TEAMS.cur||TEAMS.list.length<2)return;
  [KEY,RKEY,HKEY,SKEY].forEach(b=>{try{localStorage.removeItem(keyFor(b,tid))}catch(e){}});
  TEAMS.list=TEAMS.list.filter(t=>t.id!==tid);saveTeams();syncDropTeam(tid);ui.tdel=null;ui.tMsg='Tým smazán.';render()}
Object.assign(ACT,{stteam:()=>{ui.allTeams=false;render()},stall:()=>{ui.allTeams=true;render()},tsel:v=>{switchTeam(v);ui.tMsg=''},tadd:()=>addTeam(),tdel:v=>{ui.tdel=v;render()},tdelno:()=>{ui.tdel=null;render()},tdelyes:v=>deleteTeam(v)});
CHG.teamsel=v=>switchTeam(v);
{const t1=TEAMS.list.find(t=>t.id==='t1');if(t1&&!t1.name&&R.name){t1.name=R.name}}
function restoreAllTeams(b){const keep=b.teams.data;
  b.teams.list.forEach(t=>{const d=keep[t.id]||{};if(d.S)store.set(keyFor(KEY,t.id),d.S);if(d.R)store.set(keyFor(RKEY,t.id),d.R);store.set(keyFor(HKEY,t.id),Array.isArray(d.H)?d.H:[]);store.set(keyFor(SKEY,t.id),Array.isArray(d.Sch)?d.Sch:[])});
  if(Array.isArray(b.opponents))mergeOpp(b.opponents);TEAMS.list=b.teams.list.map(t=>({id:t.id,name:t.name||''}));loadTeam(TEAMS.list.some(t=>t.id===TEAMS.cur)?TEAMS.cur:TEAMS.list[0].id);saveTeams();
  ui.bkPending=null;ui.bkMsg='Záloha obnovena ('+TEAMS.list.length+' '+(TEAMS.list.length===1?'tým':'týmy')+').';render()}
/* ----- zápas mezi dvěma mými týmy ----- */
const sortPl=ps=>(ps||[]).slice().sort((a,b)=>(+a.num)-(+b.num));
const rosterOfTeam=tid=>tid===TEAMS.cur?R:(store.get(keyFor(RKEY,tid),null)||{players:[]});
function vsRoster(){return S.vsTid&&TEAMS.list.some(t=>t.id===S.vsTid)?rosterOfTeam(S.vsTid):null}
const rosterSide=t=>t===ours()?R:vsRoster();
const nameIn=(ros,num)=>{const p=ros&&(ros.players||[]).find(p=>p.num===num);return p?p.name:''};
const sideLineup=tid=>{const ps=sortPl(rosterOfTeam(tid).players);return ps.length?ps.map(p=>p.num):range(9).map(i=>'?'+i)};
function vsSelect(){if(TEAMS.list.length<2)return'';const others=TEAMS.list.filter(t=>t.id!==TEAMS.cur),locked=S.pas.length>0;
  return `<label for="vstid">Soupeř je můj druhý tým<select id="vstid" class="sel" ${locked?'disabled':''}><option value="">ne, hrajeme proti cizímu týmu</option>${others.map(t=>`<option value="${esc(t.id)}" ${S.vsTid===t.id?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>
  ${S.vsTid?'<p class="next" style="margin:0">Soupeř dostal soupisku a jména svého týmu. Po skončení se zápas uloží do historie a statistik obou týmů.</p>':locked?'':'<p class="next" style="margin:0">Vyber před prvním odpalem. Soupeř pak dostane soupisku svého týmu.</p>'}`}
function setVs(tid){if(S.pas.length)return;const t=1-ours();snap();delete S.oppId;
  if(tid&&TEAMS.list.some(x=>x.id===tid&&x.id!==TEAMS.cur)){S.vsTid=tid;S.teams[t]={name:teamName(TEAMS.list.find(x=>x.id===tid)),lineup:sideLineup(tid)}}
  else{delete S.vsTid;S.teams[t]={name:t?'Domácí':'Hosté',lineup:range(9).map(i=>'?'+i)}}
  S.bat[t]=0;S.subs=(S.subs||[]).filter(x=>x.t!==t);save();render()}
function mirrorGame(g){const vs=g.vsTid;if(!vs||vs===TEAMS.cur||!TEAMS.list.some(t=>t.id===vs))return;
  const m=JSON.parse(JSON.stringify(g));m.gameId=g.mirrorOf||g.gameId+'v';m.mirrorOf=g.gameId;m.vsTid=TEAMS.cur;m.ours=1-(g.ours??1);m.stars=[];delete m.def;delete m.att;
  const H=loadHFor(vs),i=H.findIndex(x=>x.gameId===m.gameId);if(i>=0)H[i]=m;else H.unshift(m);
  H.sort((a,b)=>String(b.meta&&b.meta.date).localeCompare(String(a.meta&&a.meta.date)));store.set(keyFor(HKEY,vs),H)}
function twinSchedule(x){const k=keyFor(SKEY,x.vsTid),l=store.get(k,[])||[];l.push({...x,id:newId(),home:!x.home,opp:R.name||S.teams[ours()].name,vsTid:TEAMS.cur,pairId:x.id});store.set(k,l)}
function twinPlayed(x){if(!x.vsTid)return;const k=keyFor(SKEY,x.vsTid),l=store.get(k,[])||[];let ch=false;l.forEach(y=>{if(y.pairId===x.id||x.pairId===y.id){y.played=true;ch=true}});if(ch)store.set(k,l)}
CHG.vstid=v=>setVs(v);

/* =================================================================================
   WEBOVÁ VERZE · Firebase Realtime Database
   Role: správce (kód správce) · zapisovatel týmu (kód týmu) · rodiče (odkaz ?tym=<id>, jen čtení)
   Data: teamlist/<tid> · teams/<tid>/{state,roster,schedule,history/<gid>} · public/<tid>/live
         pinmap/<kód> {role,team} · claims/<uid> = kód · setupDone
   Obsah ukládáme jako JSON text, aby se zachovaly prázdné hodnoty a pole.
   ================================================================================= */
const FB_CONFIG={apiKey:"AIzaSyDqwd6A6eaeHlczoLhGvaxQlzdp9od-0Pg",authDomain:"eagles-scorekeeper.firebaseapp.com",databaseURL:"https://eagles-scorekeeper-default-rtdb.europe-west1.firebasedatabase.app",projectId:"eagles-scorekeeper",storageBucket:"eagles-scorekeeper.firebasestorage.app",messagingSenderId:"691498301504",appId:"1:691498301504:web:ec05dfb8a51095ec1e87a5"};
const AUTH_KEY='sk-auth',SMETA='sk-sync-meta',CODE_ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function webRole(){try{if(new URLSearchParams(location.search).get('tym'))return'parent';const a=JSON.parse(localStorage.getItem('sk-auth')||'null');return a&&a.code?'scorer':'login'}catch(e){return'login'}}
const DEV=(()=>{let d=store.get('tball-dev',null);if(!d){d=newId();try{localStorage.setItem('tball-dev',JSON.stringify(d))}catch(e){}}return d})();
const KIND_OF={[KEY]:'state',[RKEY]:'team',[SKEY]:'schedule',[HKEY]:'games'},NODE={state:'state',team:'roster',schedule:'schedule'},BASE={state:KEY,team:RKEY,schedule:SKEY};
const FS={dirty:new Set(),meta:store.get(SMETA,{})||{},pushed:{},applying:false,t:null,chain:Promise.resolve(),subs:[],seen:{}};
const metaSave=()=>{try{localStorage.setItem(SMETA,JSON.stringify(FS.meta))}catch(e){}};
const quiet=fn=>{FS.applying=true;try{fn()}finally{FS.applying=false}};
const canWrite=tid=>WEB.role==='admin'||WEB.team===tid;
const liveOn=()=>!!(FBX&&WEB.role&&WEB.online);
const baseUrl=()=>location.origin+location.pathname;
const parentUrl=tid=>baseUrl()+'?tym='+encodeURIComponent(tid);
function genCode(){let c='';const r=crypto.getRandomValues(new Uint32Array(8));for(let i=0;i<8;i++)c+=CODE_ABC[r[i]%CODE_ABC.length];return c.slice(0,4)+'-'+c.slice(4)}
const normCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(.{4})(.+)$/,'$1-$2');

/* ---------- start ---------- */
function fbInit(){if(FBX)return FBX;if(typeof firebase==='undefined'){WEB.msg='Nepodařilo se načíst připojení. Zkontroluj internet a obnov stránku.';return null}
  try{firebase.initializeApp(FB_CONFIG);FBX={db:firebase.database(),auth:firebase.auth()};
    FBX.db.ref('.info/connected').on('value',s=>{WEB.online=!!s.val();if(SYNC.st!=='off'){SYNC.st=WEB.online?(FS.dirty.size?'saving':'ok'):'offline';if(WEB.online)flushSoon()}if(ui.tab==='set'||ui.tab==='score')render()})}
  catch(e){WEB.msg='Připojení se nepodařilo spustit.';FBX=null}return FBX}
async function signIn(){const f=fbInit();if(!f)throw{code:'offline'};if(f.auth.currentUser)return f.auth.currentUser.uid;
  const u=await new Promise(res=>{const off=f.auth.onAuthStateChanged(x=>{off();res(x)})});if(u)return u.uid;const c=await f.auth.signInAnonymously();return c.user.uid}
async function claim(code){const uid=await signIn();WEB.uid=uid;await FBX.db.ref('claims/'+uid).set(code);const p=(await FBX.db.ref('pinmap/'+code).once('value')).val();if(!p||!p.role)throw{code:'bad'};return p}
async function startSession(code,p){WEB.code=code;WEB.role=p.role;WEB.team=p.team||null;
  try{localStorage.setItem(AUTH_KEY,JSON.stringify({code,role:p.role,team:p.team||null}))}catch(e){}
  ROLE='scorer';SYNC.st='connecting';
  if(WEB.role==='scorer'&&WEB.team){if(!TEAMS.list.some(t=>t.id===WEB.team)){TEAMS.list.push({id:WEB.team,name:''})}if(TEAMS.cur!==WEB.team){save();saveR();loadTeam(WEB.team)}}
  listenTeamlist();listenOpp();render()}
(async()=>{await null;
  if(ROLE==='parent'){const tid=new URLSearchParams(location.search).get('tym');WEB.parentTeam=tid;const f=fbInit();if(!f)return render();
    f.db.ref('public/'+tid+'/live').on('value',s=>{const v=s.val();try{LIVE=v&&v.json?JSON.parse(v.json):null}catch(e){LIVE=null}WEB.parentName=v&&v.name||'';render()},()=>{WEB.msg='Odkaz není platný.';render()});return}
  const f=fbInit();if(!f)return render();
  if(ROLE==='login'){try{await signIn();const sd=(await f.db.ref('setupDone').once('value')).val();WEB.setupDone=!!sd}catch(e){WEB.setupDone=true}return render()}
  let a=null;try{a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){}
  if(a&&a.role){WEB.code=a.code;WEB.role=a.role;WEB.team=a.team;startSession(a.code,a)} /* hned pracuj z paměti telefonu */
  try{const p=await claim(a.code);if(p.role!==a.role||(p.team||null)!==(a.team||null))startSession(a.code,p)}
  catch(e){if(e&&e.code==='offline')return;if(String(e&&(e.code||e.message)).toLowerCase().includes('permission')||e.code==='bad'){logout('Kód už neplatí. Přihlas se znovu.')}}
})();

/* ---------- přihlášení ---------- */
function renderLogin(){document.getElementById('tabs').innerHTML='';document.getElementById('sub').textContent='přihlášení';
  const setup=WEB.setupDone===false;
  document.getElementById('view').innerHTML=`<div class="card form login">
  <div class="label">${setup?'První spuštění · nastav kód správce':'Přihlášení zapisovatele'}</div>
  ${setup?`<p class="next" style="margin:0">Databáze je zatím prázdná. Zvol si kód správce (8 až 16 znaků, písmena a číslice). Tímto kódem budeš spravovat týmy a zakládat kódy zapisovatelů. Ulož si ho bezpečně.</p>
  <label for="lg-new">Nový kód správce<input type="text" id="lg-new" autocomplete="off" autocapitalize="characters"></label>
  <label for="lg-new2">Zopakuj kód<input type="text" id="lg-new2" autocomplete="off" autocapitalize="characters"></label>
  <button class="solid" data-act="lgsetup" ${WEB.busy?'disabled':''}>Nastavit a přihlásit</button>`
  :`<p class="next" style="margin:0">Zadej kód, který ti dal správce týmu. Zapisovatel uvidí jen svůj tým.</p>
  <label for="lg-code">Kód<input type="text" id="lg-code" autocomplete="off" autocapitalize="characters" placeholder="např. K4PX-7QMR"></label>
  <button class="solid" data-act="lgin" ${WEB.busy?'disabled':''}>Přihlásit</button>`}
  ${WEB.msg?`<div class="msg">${esc(WEB.msg)}</div>`:''}
  </div><p class="next" style="margin:0">Jsi rodič? Skóre sleduješ na odkazu, který ti pošle trenér.</p>`}
async function doLogin(){const f=document.getElementById('lg-code'),code=normCode(f&&f.value);if(code.length<9){WEB.msg='Zadej celý kód.';return render()}
  WEB.busy=true;WEB.msg='';render();
  try{const p=await claim(code);WEB.busy=false;WEB.msg='';startSession(code,p)}
  catch(e){WEB.busy=false;WEB.msg=e&&e.code==='offline'?'Bez internetu se nejde přihlásit. Připoj se a zkus to znovu.':'Neplatný kód. Zkontroluj ho a zkus to znovu.';render()}}
async function doSetup(){const a=normCode(document.getElementById('lg-new').value),b=normCode(document.getElementById('lg-new2').value);
  const n=a.replace('-','').length;if(n<8||n>16){WEB.msg='Kód musí mít 8 až 16 znaků (písmena a číslice).';return render()}if(a!==b){WEB.msg='Kódy se neshodují.';return render()}
  WEB.busy=true;WEB.msg='';render();
  try{await signIn();await FBX.db.ref().update({['pinmap/'+a]:{role:'admin'},setupDone:true});const p=await claim(a);WEB.busy=false;startSession(a,p);
    ui.tab='team';ui.tMsg='Jsi přihlášený jako správce. Níže založ týmy a pošli zapisovatelům jejich kódy.';render()}
  catch(e){WEB.busy=false;WEB.msg='Nastavení se nepovedlo. Možná už správce existuje, zkus se přihlásit.';WEB.setupDone=true;render()}}
function logout(msg){try{if(FBX&&WEB.uid)FBX.db.ref('claims/'+WEB.uid).remove()}catch(e){}
  try{localStorage.removeItem(AUTH_KEY)}catch(e){}WEB.role=null;WEB.team=null;WEB.code=null;WEB.msg=msg||'';ROLE='login';SYNC.st='off';
  FS.subs.forEach(off=>{try{off()}catch(e){}});FS.subs=[];render();
  (async()=>{try{const sd=(await FBX.db.ref('setupDone').once('value')).val();WEB.setupDone=!!sd}catch(e){WEB.setupDone=true}render()})()}

/* ---------- synchronizace ---------- */
function syncNote(k){if(!WEB||!WEB.role||FS.applying)return;let slot;
  if(k===TEAMS_KEY){if(WEB.role!=='admin')return;slot='teams'}
  else if(k===OKEY)slot='opp';
  else{const [base,tid='t1']=k.split(':'),kind=KIND_OF[base];if(!kind)return;slot=kind+'|'+tid}
  if(!slot.startsWith('games|')&&slot!=='teams'&&slot!=='opp'){FS.meta[slot]=Date.now();metaSave()}
  FS.dirty.add(slot);flushSoon()}
function flushSoon(){clearTimeout(FS.t);FS.t=setTimeout(flush,1500)}
function flush(){if(!FBX||!WEB.role||!FS.dirty.size||!WEB.online)return FS.chain;const slots=[...FS.dirty];FS.dirty.clear();SYNC.st='saving';
  FS.chain=FS.chain.then(async()=>{for(const sl of slots){try{await pushSlot(sl)}catch(e){if(!/permission/i.test(String(e&&(e.code||e.message))))throw e}}SYNC.st='ok';SYNC.last=Date.now();SYNC.err=''})
    .catch(e=>{slots.forEach(x=>FS.dirty.add(x));SYNC.st='error';SYNC.err='Ukládání online se nepovedlo, zkusí se to znovu.';clearTimeout(FS.t);FS.t=setTimeout(flush,15000)})
    .then(()=>{if(ui.tab==='set')render()});return FS.chain}
const J=v=>JSON.stringify(v);
async function pushSlot(slot){const db=FBX.db;
  if(slot==='opp')return pushOpp();
  if(slot==='teams'){const o={};TEAMS.list.forEach(t=>{o[t.id]={name:teamName(t)}});return db.ref('teamlist').set(o)}
  const [kind,tid]=slot.split('|');
  if(kind==='games')return pushGames(tid);
  if(!canWrite(tid))return;
  const cur=tid===TEAMS.cur,val=cur&&kind==='state'?S:cur&&kind==='team'?R:store.get(keyFor(BASE[kind],tid),null);if(val==null)return;
  const ts=FS.meta[slot]||Date.now();FS.meta[slot]=ts;metaSave();
  await db.ref('teams/'+tid+'/'+NODE[kind]).set({ts,dev:DEV,json:J(val)})}
async function pushGames(tid){const H=loadHFor(tid),cur={};H.forEach(g=>{cur[g.gameId]=g.savedAt||''});const own=canWrite(tid);
  for(const id in cur){const p=FS.pushed[id];if(p&&p.s===cur[id])continue;const g=H.find(x=>x.gameId===id);if(!own&&!g.mirrorOf)continue;
    await FBX.db.ref('teams/'+tid+'/history/'+id).set({savedAt:cur[id],mirror:g.mirrorOf?true:null,json:J(g)});FS.pushed[id]={s:cur[id],t:tid}}
  if(own)for(const id in FS.pushed){const p=FS.pushed[id];if(p.t===tid&&!(id in cur)){await FBX.db.ref('teams/'+tid+'/history/'+id).remove();delete FS.pushed[id]}}}
function listenTeamlist(){if(!FBX)return;const ref=FBX.db.ref('teamlist');let first=true;
  const cb=ref.on('value',snap=>{const v=snap.val()||{};const remote=Object.keys(v).map(id=>({id,name:v[id]&&v[id].name||''}));
    if(first&&WEB.role==='admin'&&!remote.length){FS.dirty.add('teams');flushSoon()}
    else if(remote.length){const local=TEAMS.list;let list=remote;
      if(first&&WEB.role==='admin'){const have=new Set(remote.map(t=>t.id)),add=local.filter(t=>!have.has(t.id));if(add.length){list=[...remote,...add];FS.dirty.add('teams');flushSoon()}}
      if(WEB.role==='scorer'&&!list.some(t=>t.id===WEB.team))list=[...list,{id:WEB.team,name:''}];
      TEAMS.list=list;quiet(()=>store.set(TEAMS_KEY,{list,ts:Date.now()}));
      if(!list.some(t=>t.id===TEAMS.cur))loadTeam(WEB.role==='scorer'?WEB.team:list[0].id)}
    first=false;subscribeTeams();render()},()=>{});
  FS.subs.push(()=>ref.off('value',cb))}
function subscribeTeams(){const want=WEB.role==='admin'?TEAMS.list.map(t=>t.id):[WEB.team];
  want.forEach(tid=>{if(FS.seen[tid]!==undefined)return;FS.seen[tid]=false;const ref=FBX.db.ref('teams/'+tid);
    const cb=ref.on('value',snap=>{applyTeam(tid,snap.val()||{},!FS.seen[tid]);FS.seen[tid]=true},e=>{SYNC.st='error';SYNC.err='K týmu nemáš přístup.';render()});
    FS.subs.push(()=>ref.off('value',cb))});
  if(WEB.role==='scorer')TEAMS.list.filter(t=>t.id!==WEB.team).forEach(t=>{const k='r:'+t.id;if(FS.seen[k]!==undefined)return;FS.seen[k]=true;
    FBX.db.ref('teams/'+t.id+'/roster').once('value').then(s=>{const v=s.val();if(v&&v.json)quiet(()=>store.set(keyFor(RKEY,t.id),JSON.parse(v.json)))}).catch(()=>{})})}
function applyTeam(tid,v,initial){const cur=tid===TEAMS.cur;let changed=false;
  ['state','team','schedule'].forEach(kind=>{const slot=kind+'|'+tid,node=v[NODE[kind]],lt=FS.meta[slot]||0;
    if(!node||!node.json){if(initial&&canWrite(tid))FS.dirty.add(slot);return}
    if(node.dev===DEV&&node.ts<=lt)return;
    if(!(node.ts>lt)){if(initial&&lt>node.ts&&canWrite(tid))FS.dirty.add(slot);return}
    let val;try{val=JSON.parse(node.json)}catch(e){return}
    if(kind==='state'){if(!val||!val.teams)return;
      if(cur){if(S.pas.length&&S.gameId!==val.gameId)archiveGame();quiet(()=>{S=val;save()});hist=[];ui.panel=null;ui.endC=false}
      else{const old=store.get(keyFor(KEY,tid),null);if(old&&old.pas&&old.pas.length&&old.gameId!==val.gameId)storeGameLocal(tid,{...old,savedAt:new Date().toISOString()});quiet(()=>store.set(keyFor(KEY,tid),val))}}
    else if(kind==='team'){if(!val||!Array.isArray(val.players))return;let next=val;
      if(initial&&lt===0){const local=cur?R:store.get(keyFor(RKEY,tid),null),have=new Set(val.players.map(p=>p.num)),add=(local&&local.players||[]).filter(p=>!have.has(p.num));if(add.length){next={...val,players:[...val.players,...add]};FS.dirty.add(slot)}}
      quiet(()=>{if(cur){R=next;saveR()}else store.set(keyFor(RKEY,tid),next)})}
    else{if(!Array.isArray(val))return;quiet(()=>store.set(keyFor(BASE[kind],tid),val))}
    FS.meta[slot]=FS.dirty.has(slot)?Date.now():node.ts;metaSave();changed=true});
  /* historie */
  const rh=v.history||{},H=loadHFor(tid);let hc=false;
  Object.keys(rh).forEach(gid=>{const e=rh[gid];FS.pushed[gid]={s:e.savedAt||'',t:tid};const i=H.findIndex(x=>x.gameId===gid);
    if(i>=0&&String(H[i].savedAt||'')>=String(e.savedAt||''))return;let g;try{g=JSON.parse(e.json)}catch(x){return}if(i>=0)H[i]=g;else H.push(g);hc=true});
  if(initial){if(H.some(g=>!rh[g.gameId]))FS.dirty.add('games|'+tid)}
  else{const gone=H.filter(g=>!rh[g.gameId]&&FS.pushed[g.gameId]&&FS.pushed[g.gameId].t===tid);if(gone.length){gone.forEach(g=>delete FS.pushed[g.gameId]);const keep=H.filter(g=>!gone.includes(g));H.length=0;H.push(...keep);hc=true}}
  if(hc){H.sort((a,b)=>String(b.meta&&b.meta.date).localeCompare(String(a.meta&&a.meta.date)));quiet(()=>store.set(keyFor(HKEY,tid),H));changed=true}
  if(initial){SYNC.st=WEB.online?'ok':'offline';SYNC.last=Date.now();flushSoon()}
  if(changed&&cur&&ROLE==='scorer')render()}
function storeGameLocal(tid,g){const H=loadHFor(tid),i=H.findIndex(x=>x.gameId===g.gameId);if(i>=0)H[i]=g;else H.push(g);quiet(()=>store.set(keyFor(HKEY,tid),H))}
function syncDropTeam(tid){if(!FBX||WEB.role!=='admin')return;const db=FBX.db;
  db.ref('teams/'+tid).remove().catch(()=>{});db.ref('public/'+tid).remove().catch(()=>{});
  db.ref('pinmap').once('value').then(s=>{const v=s.val()||{},u={};Object.keys(v).forEach(c=>{if(v[c]&&v[c].team===tid)u[c]=null});if(Object.keys(u).length)return db.ref('pinmap').update(u)}).then(loadPins).catch(()=>{});
  for(const id in FS.pushed)if(FS.pushed[id].t===tid)delete FS.pushed[id];delete FS.seen[tid];FS.dirty.add('teams');flushSoon()}

/* ---------- živé skóre pro rodiče ---------- */
async function publishLive(final){if(!liveOn()){ui.pubMsg='Bez internetu. Skóre se odešle po připojení.';return render()}
  ui.pubBusy=true;render();const L=liveData(final);S.settings.pubOn=true;S.pubLast=L.updated;save();
  try{await FBX.db.ref('public/'+TEAMS.cur+'/live').set({ts:Date.now(),name:R.name||S.teams[ours()].name,json:J(L)});ui.pubMsg=(final?'Konec zápasu odeslán v ':'Skóre odesláno v ')+fmtTime(L.updated)+'.'}
  catch(e){ui.pubMsg='Skóre se nepodařilo odeslat. Zkus to znovu.'}
  ui.pubBusy=false;render()}
function autoPub(){if(!(S.settings.pubOn&&S.settings.autoPub!==false))return;clearTimeout(PUB_T);
  PUB_T=setTimeout(function fire(){if(ui.panel||ui.pubBusy){PUB_T=setTimeout(fire,3000);return}PUB_T=null;publishLive(false)},3000)}
function scoreView(){const on=!!S.settings.pubOn,auto=S.settings.autoPub!==false,url=parentUrl(TEAMS.cur);
  return `<div class="card form"><div class="label">Živé skóre pro rodiče · ${esc(R.name||S.teams[ours()].name)}</div>
  <p class="next" style="margin:0">Rodiče na odkazu svého týmu uvidí tabuli se skóre a pořadí pálkařů. Jména dětí se nezveřejňují, jen čísla dresů.</p>
  <label class="radio"><input type="checkbox" id="pub-auto" ${auto?'checked':''}> Odeslat automaticky po každém pálkaři${on?'':' (po prvním odeslání)'}</label>
  <div class="row"><button class="solid" data-act="pubnow" ${ui.pubBusy?'disabled':''}>Odeslat skóre teď</button><button class="ghost" data-act="pubfinal" ${ui.pubBusy?'disabled':''}>Konec zápasu</button></div>
  ${ui.pubMsg?`<div class="next">${esc(ui.pubMsg)}</div>`:S.pubLast?`<div class="next">Naposledy odesláno v ${fmtTime(S.pubLast)}.</div>`:''}
  ${WEB.online?'':'<div class="msg">Teď jsi bez internetu. Zápis běží dál a skóre se odešle po připojení.</div>'}</div>
  <div class="card form"><div class="label">Odkaz pro rodiče</div><div class="linkbox" id="plink">${esc(url)}</div>
  <div class="row"><button class="ghost" data-act="copylink" data-v="${esc(url)}">Kopírovat odkaz</button></div>${ui.linkMsg?`<div class="next">${esc(ui.linkMsg)}</div>`:''}
  <p class="next" style="margin:0">Pošli ho rodičům do skupiny týmu. Odkaz je stálý, platí pro všechny zápasy tohoto týmu.</p></div>
  <div class="label">Takhle to uvidí rodiče</div>${board(liveData(false))}`}
function renderParent(){document.getElementById('tabs').innerHTML='';document.getElementById('sub').textContent=WEB.parentName?WEB.parentName+' · živé skóre':'živé skóre';
  document.getElementById('view').innerHTML=WEB.msg?`<div class="card msg">${esc(WEB.msg)}</div>`:(LIVE?board(LIVE)+'<p class="next" style="margin:0">Stránka se obnovuje sama, jakmile trenér zapíše další akci.</p>'+liveSheet(LIVE):'<div class="card">Skóre zatím nebylo zveřejněno. Stránka se obnoví sama, až zápas začne.</div>')}

/* ---------- přístup, správa týmů a kódů ---------- */
function syncCard(){const st=SYNC.st,msg={off:'Nepřipojeno.',connecting:'Připojuji…',saving:'Ukládám…',ok:'Uloženo online'+(SYNC.last?' · '+fmtTime(new Date(SYNC.last).toISOString()):''),offline:'Bez internetu. Zápis se ukládá v telefonu a odešle se po připojení.',error:SYNC.err||'Chyba ukládání.'}[st]||'';
  return `<div class="card form"><div class="label">Ukládání online</div><div class="sync ${st==='offline'?'saving':st}"><span class="sdot"></span>${esc(msg)}</div>
  <p class="next" style="margin:0">${WEB.role==='admin'?'Jako správce vidíš a ukládáš všechny týmy.':'Ukládá se tvůj tým. Na jiném telefonu se stačí přihlásit stejným kódem.'} Zapisuj zápas vždy jen na jednom zařízení.</p>
  ${st==='ok'||st==='error'?'<button class="ghost" data-act="syncnow" style="align-self:flex-start">Uložit teď</button>':''}</div>`}
function accessCard(){const t=TEAMS.list.find(x=>x.id===TEAMS.cur);
  return `<div class="card form"><div class="label">Přístup</div><div><b>${WEB.role==='admin'?'Správce':'Zapisovatel týmu '+esc(t?teamName(t):'')}</b> <span class="next">· kód ${esc(WEB.code||'')}</span></div>
  <div class="row"><button class="ghost" data-act="logout">Odhlásit</button></div></div>`}
function teamSwitch(){if(WEB.role!=='admin'||TEAMS.list.length<2)return'';
  return `<label class="tsw" for="teamsel"><span class="vh">Tým</span><select id="teamsel" class="sel">${TEAMS.list.map(t=>`<option value="${esc(t.id)}" ${t.id===TEAMS.cur?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>`}
async function loadPins(){if(!FBX||WEB.role!=='admin')return;try{WEB.pins=(await FBX.db.ref('pinmap').once('value')).val()||{}}catch(e){WEB.pins={}}if(ui.tab==='team')render()}
function adminCard(){if(WEB.pins===null){loadPins();WEB.pins=undefined}const P=WEB.pins||{};
  const codesOf=tid=>Object.keys(P).filter(c=>P[c]&&P[c].role==='scorer'&&P[c].team===tid);
  return `<div class="card form"><div class="label">Kódy a odkazy týmů</div>
  ${TEAMS.list.map(t=>{const cs=codesOf(t.id);return `<div class="acard"><b>${esc(teamName(t))}</b>
    <div class="arow"><span class="next">Kód zapisovatele</span>${cs.length?cs.map(c=>`<code class="code">${esc(c)}</code>`).join(' '):'<span class="next">zatím žádný</span>'}
      <button class="mini-btn" data-act="pinnew" data-v="${esc(t.id)}">${cs.length?'Vyměnit kód':'Vytvořit kód'}</button></div>
    <div class="arow"><span class="next">Odkaz pro rodiče</span><span class="linkbox sm">${esc(parentUrl(t.id))}</span><button class="mini-btn" data-act="copylink" data-v="${esc(parentUrl(t.id))}">Kopírovat</button></div></div>`}).join('')}
  <div class="arow"><span class="next">Odkaz pro zapisovatele</span><span class="linkbox sm">${esc(baseUrl())}</span><button class="mini-btn" data-act="copylink" data-v="${esc(baseUrl())}">Kopírovat</button></div>
  ${ui.linkMsg?`<div class="next">${esc(ui.linkMsg)}</div>`:''}
  <p class="next" style="margin:0">Zapisovateli pošli odkaz pro zapisovatele a jeho kód. „Vyměnit kód“ zruší starý kód, kdo s ním byl přihlášený, bude se muset přihlásit novým.</p></div>`}
async function newPin(tid){if(!FBX||WEB.role!=='admin')return;const P=WEB.pins||{},u={};Object.keys(P).forEach(c=>{if(P[c]&&P[c].role==='scorer'&&P[c].team===tid)u[c]=null});
  const code=genCode();u[code]={role:'scorer',team:tid};try{await FBX.db.ref('pinmap').update(u);ui.linkMsg='Nový kód pro '+teamName(TEAMS.list.find(t=>t.id===tid)||{id:tid})+': '+code}catch(e){ui.linkMsg='Kód se nepodařilo vytvořit.'}loadPins()}
function addTeam(){const f=document.getElementById('tnew'),name=(f&&f.value||'').trim();if(!name){ui.tMsg='Napiš název nového týmu.';return render()}
  if(TEAMS.list.length>=6){ui.tMsg='Víc než 6 týmů zápisník nezvládne.';return render()}
  save();saveR();const id='t'+newId();TEAMS.list.push({id,name});
  const keep=S.settings;loadTeam(id);S.settings={...keep};R.name=name;S.teams[ours()].name=name;
  saveR();save();saveTeams();subscribeTeams();newPin(id);ui.tMsg='Tým „'+name+'“ je vytvořený a vybraný. Kód pro jeho zapisovatele najdeš níže.';ui.tab='team';render()}
async function copyText(t){try{await navigator.clipboard.writeText(t);ui.linkMsg='Zkopírováno.'}catch(e){ui.linkMsg='Zkopíruj ručně: '+t}render()}
Object.assign(ACT,{lgin:()=>doLogin(),lgsetup:()=>doSetup(),logout:()=>logout(''),pinnew:v=>newPin(v),copylink:v=>copyText(v),
  syncnow:()=>{if(!WEB.role)return;['state','team','schedule','games'].forEach(k=>TEAMS.list.forEach(t=>{if(canWrite(t.id))FS.dirty.add(k+'|'+t.id)}));if(WEB.role==='admin')FS.dirty.add('teams');FS.dirty.add('opp');flush();render()}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target.id==='lg-code'||e.target.id==='lg-new2')){e.preventDefault();e.target.id==='lg-code'?doLogin():doSetup()}});

/* =========== soupisky soupeřů (uložené u každého týmu, synchronizují se) =========== */
const loadOpp=()=>{const x=store.get(OKEY,[]);return Array.isArray(x)?x:[]};
const oppSig=o=>JSON.stringify({n:o.name,p:sortPl(o.players),c:(o.comps||[]).slice().sort()});
const oppComps=o=>(o&&o.comps||[]).filter(c=>COMPS.includes(c));
function saveOpp(L){const old={};loadOpp().forEach(o=>{old[o.id]=o});L.forEach(o=>{const p=old[o.id];if(!p||oppSig(p)!==oppSig(o)||!o.ts)o.ts=Date.now()});return store.set(OKEY,L)}
function mergeOpp(list){const L=loadOpp();list.forEach(o=>{if(!o||!o.name)return;const same=L.find(x=>x.id===o.id)||L.find(x=>x.name.toLowerCase()===o.name.toLowerCase());
  if(!same)L.push({...o,players:o.players||[]});else{const have=new Set(same.players.map(p=>p.num));(o.players||[]).forEach(p=>{if(!have.has(p.num))same.players.push(p)})}});saveOpp(L)}
/* dřívější uložení po týmech -> společný seznam */
{const extra=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(OKEY+':'))extra.push(k)}}catch(e){}
 extra.forEach(k=>{const l=store.get(k,[]);if(Array.isArray(l)&&l.length)mergeOpp(l);try{localStorage.removeItem(k)}catch(e){}})}
const oppById=id=>id?loadOpp().find(o=>o.id===id)||null:null;
const oppLineup=o=>{const ps=sortPl(o.players);return ps.length?ps.map(p=>p.num):range(9).map(i=>'?'+i)};
function oppCard(){const L=loadOpp().slice().sort((a,b)=>a.name.localeCompare(b.name,'cs'));
  let h=`<div class="card form"><div class="label">Soupisky soupeřů · společné pro všechny týmy · ${L.length}</div>`;
  if(!L.length)h+='<p class="next" style="margin:0">Zatím žádné. Ulož si soupeře, se kterými hrajete častěji. Soupisky jsou společné pro všechny tvoje týmy. Při zápase pak stačí soupisku vybrat a máš rovnou čísla, případně i jména.</p>';
  else h+=`<div class="hist">${L.map(o=>{const ed=ui.oppEdit===o.id;
    return `<div class="hrow opprow"><span class="res rR">${o.players.length}</span><div class="hmain"><b>${esc(o.name)}</b>${oppComps(o).length?`<span class="ochips">${oppComps(o).map(c=>`<span class="ochip">${esc(c)}</span>`).join('')}</span>`:''}<span class="next">${o.players.length?sortPl(o.players).map(p=>'#'+esc(p.num)+(p.name?' '+esc(p.name):'')).join(', '):'zatím bez hráčů'}</span></div>
    <div class="hbtns">${ui.oppDel===o.id?`<button class="mini-btn out" data-act="opdelyes" data-v="${esc(o.id)}">Smazat</button><button class="mini-btn" data-act="opdelno">Ne</button>`:`<button class="mini-btn" data-act="${ed?'opdone':'opedit'}" data-v="${esc(o.id)}">${ed?'Hotovo':'Upravit'}</button><button class="mini-btn out" data-act="opdel" data-v="${esc(o.id)}" aria-label="Smazat soupeře">×</button>`}</div></div>
    ${ed?oppEditor(o):''}`}).join('')}</div>`;
  return h+`<div class="addrow"><input type="text" id="op-new" placeholder="Název soupeře, např. Draci Praha" aria-label="Název soupeře"><button class="solid" data-act="opadd">+ Přidat soupeře</button></div>${ui.oppMsg?`<div class="next">${esc(ui.oppMsg)}</div>`:''}</div>`}
function oppEditor(o){const oc=oppComps(o);return `<div class="subp oppedit"><label for="op-name">Název<input type="text" id="op-name" value="${esc(o.name)}"></label>
  <div class="label">Hrajeme spolu v soutěži</div><div class="ocomp">${COMPS.map((c,i)=>`<label class="radio" for="opc-${i}"><input type="checkbox" id="opc-${i}" ${oc.includes(c)?'checked':''}> ${esc(c)}</label>`).join('')}</div>
  <div class="plist">${sortPl(o.players).map(p=>`<span class="pchip"><b>#${esc(p.num)}</b>${p.name?' '+esc(p.name):''}<button class="pbtn x" aria-label="Odebrat hráče" data-act="oppdel" data-v="${esc(p.num)}">×</button></span>`).join('')||'<span class="next">Přidej hráče níže.</span>'}</div>
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="op-num" placeholder="Č." aria-label="Číslo dresu" style="max-width:76px"><input type="text" id="op-pname" placeholder="Jméno (nepovinné)" aria-label="Jméno hráče"><button class="solid" data-act="oppadd">Přidat</button></div>
  <p class="next" style="margin:0">Stačí čísla dresů. Soupisku vidí a může upravit správce i zapisovatelé všech tvých týmů. Rodiče jména soupeřů neuvidí.</p></div>`}
function oppPick(t){const L=loadOpp(),started=S.pas.some(r=>r.t===t),cur=S.oppId&&!S.vsTid?oppById(S.oppId):null;
  return `<div class="opppick">${L.length&&!started?`<label for="opsel">Načíst uloženou soupisku soupeře<select id="opsel" class="sel"><option value="">–</option>${L.slice().sort((a,b)=>a.name.localeCompare(b.name,'cs')).map(o=>`<option value="${esc(o.id)}" ${S.oppId===o.id&&!S.vsTid?'selected':''}>${esc(o.name)}${oppComps(o).length?' · '+esc(oppComps(o).join(', ')):''} (${o.players.length})</option>`).join('')}</select></label>`:''}
  ${S.vsTid?'':`<button class="ghost" data-act="opsave" data-t="${t}" style="align-self:flex-start">${cur?'Uložit změny do soupisky „'+esc(cur.name)+'“':'Uložit jako soupisku soupeře'}</button>`}</div>`}
function applyOpp(id){const t=1-ours();if(S.pas.some(r=>r.t===t))return;const o=oppById(id);snap();delete S.vsTid;
  if(o){S.oppId=o.id;S.teams[t]={name:o.name,lineup:oppLineup(o)}}else{delete S.oppId;S.teams[t]={name:t?'Domácí':'Hosté',lineup:range(9).map(i=>'?'+i)}}
  S.bat[t]=0;S.subs=(S.subs||[]).filter(x=>x.t!==t);S.example=false;save();render()}
function oppFromGame(t){const L=loadOpp(),nums=[...new Set([...S.teams[t].lineup,...(S.subs||[]).filter(x=>x.t===t).map(x=>x.out)])].filter(n=>!anon(n));
  if(!nums.length){ui.msg[t]='Nejdřív zadej čísla dresů soupeře (✎ u míst v pořadí nebo „Přidat“).';return render()}
  let o=S.oppId&&oppById(S.oppId);const name=S.teams[t].name||'Soupeř';
  if(!o){o=L.find(x=>x.name.toLowerCase()===name.toLowerCase())||null}
  if(o){const have=new Set(o.players.map(p=>p.num));nums.forEach(n=>{if(!have.has(n))o.players.push({num:n,name:''})});const i=L.findIndex(x=>x.id===o.id);L[i]=o;ui.msg[t]='Soupiska „'+o.name+'“ je aktualizovaná.'}
  else{o={id:'o'+newId(),name,players:nums.map(n=>({num:n,name:''}))};L.push(o);ui.msg[t]='Soupiska „'+name+'“ je uložená. Upravíš ji v záložce Zápasy.'}
  saveOpp(L);S.oppId=o.id;save();render()}
function oppSchedSelect(){const L=loadOpp();if(!L.length)return'';
  return `<label for="sch-p">…nebo uložený soupeř<select id="sch-p" class="sel"><option value="">–</option>${L.slice().sort((a,b)=>a.name.localeCompare(b.name,'cs')).map(o=>`<option value="${esc(o.id)}">${esc(o.name)}${oppComps(o).length?' · '+esc(oppComps(o).join(', ')):''}</option>`).join('')}</select></label>`}
const oppUpd=(id,fn)=>{const L=loadOpp(),i=L.findIndex(o=>o.id===id);if(i<0)return;fn(L[i]);saveOpp(L);render()};
Object.assign(ACT,{
  opadd:()=>{const f=document.getElementById('op-new'),name=(f&&f.value||'').trim();if(!name){ui.oppMsg='Napiš název soupeře.';return render()}const L=loadOpp();
    if(L.some(o=>o.name.toLowerCase()===name.toLowerCase())){ui.oppMsg='Soupeř „'+name+'“ už uložený je.';return render()}const o={id:'o'+newId(),name,players:[]};L.push(o);saveOpp(L);ui.oppEdit=o.id;ui.oppMsg='';render()},
  opedit:v=>{ui.oppEdit=v;ui.oppDel=null;render()},opdone:()=>{ui.oppEdit=null;render()},
  opdel:v=>{ui.oppDel=v;render()},opdelno:()=>{ui.oppDel=null;render()},
  opdelyes:v=>{saveOpp(loadOpp().filter(o=>o.id!==v));ui.oppDel=null;if(ui.oppEdit===v)ui.oppEdit=null;ui.oppMsg='Soupeř smazán. Odehrané zápasy zůstávají.';render()},
  oppadd:()=>{const num=jersey(document.getElementById('op-num').value),name=(document.getElementById('op-pname').value||'').trim();if(!num){ui.oppMsg='Zadej číslo dresu.';return render()}
    ui.oppMsg='';oppUpd(ui.oppEdit,o=>{const p=o.players.find(x=>x.num===num);if(p)p.name=name||p.name;else o.players.push({num,name})});const f=document.getElementById('op-num');if(f)f.focus()},
  oppdel:v=>oppUpd(ui.oppEdit,o=>{o.players=o.players.filter(p=>p.num!==v)}),
  opsave:(v,t)=>oppFromGame(t),
});
CHG.opsel=v=>applyOpp(v);
CHG['op-name']=v=>{const n=v.trim();if(n)oppUpd(ui.oppEdit,o=>{o.name=n})};
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='op-new'){e.preventDefault();ACT.opadd()}else if(e.target.id==='op-num'){e.preventDefault();const f=document.getElementById('op-pname');if(f)f.focus()}else if(e.target.id==='op-pname'){e.preventDefault();ACT.oppadd()}});
/* ----- online: opponents/<id> = {ts, json}, společné pro všechny týmy ----- */
function pushOpp(){const L=loadOpp(),db=FBX.db,ids=new Set(L.map(o=>o.id));FS.oppPushed=FS.oppPushed||{};const jobs=[];
  L.forEach(o=>{if(FS.oppPushed[o.id]!==o.ts){jobs.push(db.ref('opponents/'+o.id).set({ts:o.ts||Date.now(),json:J(o)}).then(()=>{FS.oppPushed[o.id]=o.ts}))}});
  Object.keys(FS.oppPushed).forEach(id=>{if(!ids.has(id))jobs.push(db.ref('opponents/'+id).remove().then(()=>{delete FS.oppPushed[id]}))});return Promise.all(jobs)}
function listenOpp(){if(!FBX||FS.oppOn)return;FS.oppOn=true;FS.oppPushed=FS.oppPushed||{};let first=true;const ref=FBX.db.ref('opponents');
  const cb=ref.on('value',snap=>{const v=snap.val()||{},L=loadOpp();let ch=false,needPush=false;
    Object.keys(v).forEach(id=>{const r=v[id];let o;try{o=JSON.parse(r.json)}catch(e){return}o.ts=r.ts;FS.oppPushed[id]=r.ts;const i=L.findIndex(x=>x.id===id);
      if(i<0){const dup=L.findIndex(x=>x.name.toLowerCase()===o.name.toLowerCase()&&!v[x.id]);if(dup>=0){const have=new Set(o.players.map(p=>p.num));L[dup].players.forEach(p=>{if(!have.has(p.num))o.players.push(p)});L.splice(dup,1);needPush=true}L.push(o);ch=true}
      else if((L[i].ts||0)<r.ts){L[i]=o;ch=true}else if((L[i].ts||0)>r.ts)needPush=true});
    for(let i=L.length-1;i>=0;i--){const o=L[i];if(v[o.id])continue;if(!first&&FS.oppPushed[o.id]!==undefined){delete FS.oppPushed[o.id];L.splice(i,1);ch=true}else needPush=true}
    if(ch)quiet(()=>store.set(OKEY,L));if(needPush){FS.dirty.add('opp');flushSoon()}first=false;if(ch&&ROLE==='scorer')render()},()=>{FS.oppOn=false});
  FS.subs.push(()=>{ref.off('value',cb);FS.oppOn=false})}
COMPS.forEach((c,i)=>{CHG['opc-'+i]=(v,el)=>oppUpd(ui.oppEdit,o=>{const set=new Set(oppComps(o));if(el.checked)set.add(c);else set.delete(c);o.comps=COMPS.filter(x=>set.has(x))})});
render();
