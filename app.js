/* Baseball Scorekeeper · webová verze (GitHub Pages + Firebase) */
var WEB={role:null,team:null,code:null,uid:null,online:false,setupDone:null,msg:'',busy:false,pins:null,parentTeam:null,parentName:''};
var SYNC={st:'off',last:0,err:''};
var FBX=null; /* {db,auth} */
const APP_VERSION='1.2',APP_DATE='2026-10-20';
const setSub=t=>{const el=document.getElementById('sub');if(el)el.innerHTML=(t?esc(t):'')+'<span class="hver">'+verTxt()+'</span>'};
const verTxt=()=>'verze '+APP_VERSION;
const KEY='tball-zapisnik-v2';
const POS=['','nadhazovač','catcher','1B','2B','3B','SS','levý zadák','střední zadák','pravý zadák'];
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
const save=()=>{teeFix();store.set(tkey(KEY),S);dugSoon()};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const bt=()=>S.top?0:1;
const RKEY='tball-tym-v1';
let R=store.get(tkey(RKEY),null);if(!R||!Array.isArray(R.players))R={name:'',players:[]};
const saveR=()=>{store.set(tkey(RKEY),R);dugSoon()};
const ours=()=>S.ours??1;
/* zobrazované jméno hráče: přezdívka, když je vyplněná, jinak jméno */
const dn=p=>p?(String(p.nick||'').trim()||p.name||''):'';
const rname=num=>{const p=R.players.find(p=>p.num===num);return p?dn(p):''};
const anon=num=>String(num)[0]==='?';
const noNum=num=>String(num)[0]==='~';
const numTxt=num=>noNum(num)?'bez č.':'#'+num;
const short=num=>anon(num)?'P'+String(num).slice(1):noNum(num)?'–':'#'+num;
const numKey=p=>noNum(p.num)?[1,(p.name||'').toLowerCase()]:[0,+p.num];
const byNum=(a,b)=>{const x=numKey(a),y=numKey(b);return x[0]-y[0]||(x[0]?x[1].localeCompare(y[1],'cs'):x[1]-y[1])};
const lbl=(t,num)=>{const n=t===ours()?rname(num):S.vsTid?nameIn(vsRoster(),num):S.oppId?nameIn(oppById(S.oppId),num):'';if(noNum(num))return (n||'Hráč')+' (bez č.)';return (anon(num)?'Pálkař '+String(num).slice(1):'#'+num)+(n?' '+n:'')};
const pname=(t,num)=>t===ours()?rname(num):S.vsTid?nameIn(vsRoster(),num):S.oppId?nameIn(oppById(S.oppId),num):'';
const initials=n=>{const w=String(n||'').trim().split(/\s+/).filter(Boolean);return (w.length>1?[w[0],w[w.length-1]]:w).map(x=>x[0].toUpperCase()).join('')};
/* běžec na diamantu: „#7 AN“, bez čísla jen „AN“, bez jména jen číslo */
const diaLbl=r=>{if(anon(r.num))return short(r.num);const ini=initials(pname(r.t,r.num));return noNum(r.num)?(ini||'–'):'#'+r.num+(ini?' '+ini:'')};
const nm=(t,p)=>{const v=S.teams[t].lineup[p];return v!=null?lbl(t,v):'—'};
const pn=r=>lbl(r.t,r.num);
const sortedRoster=()=>R.players.slice().sort(byNum);
const jersey=raw=>{const v=String(raw||'').trim().replace(/^0+(?=\d)/,'');return /^\d{1,3}$/.test(v)?v:null};
const halfLbl=()=>S.inning+'. '+(S.top?'▲':'▼');
const started=()=>S.pas.length>0;
function snap(){hist.push(JSON.stringify(S));if(hist.length>300)hist.shift()}
function commit(){save();render()}
function undo(){if(!hist.length)return;S=JSON.parse(hist.pop());ui.panel=null;ui.seq=[];commit()}
function log(t){S.log.unshift(halfLbl()+' · '+t);if(S.log.length>300)S.log.pop()}

function startPA(code){const t=bt();const r={id:S.pas.length,t,num:S.teams[t].lineup[S.bat[t]],inn:S.inning,code,reach:0,scored:false,outNo:null,sw:code==='K'?(S.swings||0):(S.swings||0)+1,...(pmode()!=='tee'&&code!=='K'?{dl:dlv()}:{})};S.pas.push(r);return r}
const lim=()=>S.settings.runLimit??5;
/* nadhoz: tee | coach (coachball) | cbtee (N nadhozů trenéra, pak tee) */
const PRESETS=[['tee0','Tee – do odpalu',{pitch:'tee',swingLimit:0}],['tee5','Tee – 5 švihů',{pitch:'tee',swingLimit:5}],['cb3tee','Coachball + tee',{pitch:'cbtee',coachN:3,swingLimit:5}],['cb','Coachball',{pitch:'coach',swingLimit:5}]];
const pmode=st=>(st||S.settings).pitch||'tee',cbN=st=>(st||S.settings).coachN??3;
const swTot=st=>{st=st||S.settings;const l=st.swingLimit??5;return l>0?l:0};
const dlv=()=>pmode()==='coach'||(pmode()==='cbtee'&&(S.swings||0)<cbN())?'c':'t';
const pitchTxt=st=>{st=st||S.settings;const m=pmode(st),l=st.swingLimit??5;return m==='tee'?'tee'+(l?', max. '+l+' švihů':' do odpalu'):m==='coach'?'coachball'+(l?', max. '+l+' švihů':''):'coachball '+cbN(st)+(l?' + tee '+Math.max(0,l-cbN(st)):', pak tee do odpalu')};
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
  if(code==='hit'){r=startPA(['1B','2B','3B','HR'][arg-1]);S.hits[t]++;log(pn(r)+': '+LABEL[r.code]+(r.dl==='c'?' z nadhozu':r.dl==='t'?' z tee':''));moveRunners(arg);if(arg===4)score(r);else setBase(arg-1,r.id)}
  else if(code==='hitx'){const {n,plan}=arg;r=startPA(HITS[n-1]);S.hits[t]++;log(pn(r)+': '+LABEL[r.code]+(r.dl==='c'?' z nadhozu':r.dl==='t'?' z tee':''));const old=S.bases.slice();S.bases=[null,null,null];
    [2,1,0].forEach(b=>{const id=old[b];if(id==null)return;const to=plan['r'+b];if(to==='H')score(S.pas[id]);else if(to==='O')runnerOut(id);else setBase(+to,id)});
    const tb=plan.b;if(tb==='H')score(r);else if(tb==='O'){S.outs++;r.outNo=S.outs}else setBase(+tb,r.id)}
  else if(code==='K'){r=startPA('K');S.outs++;r.outNo=S.outs;log(pn(r)+': aut po '+swTot()+' švizích')}
  else if(code==='FC'){r=startPA('FC');log(pn(r)+': volba polaře');if(S.bases[0]!=null){const id=S.bases[0];S.bases[0]=null;runnerOut(id)}setBase(0,r.id)}
  else if(code==='out'){r=startPA(arg.code);S.outs++;r.outNo=S.outs;log(pn(r)+': aut '+arg.code);if(arg.sac&&S.outs<3)moveRunners(1)}
  else if(code==='E'){r=startPA('E'+arg);S.errs[f]++;log(pn(r)+': na metě po chybě ('+POS[arg]+')');forceChain();setBase(0,r.id)}
  endPA()}

function act(code,arg){if(S.final)return;snap();S.example=false;S.lastLbl=actLabel(code,arg);clockAutoStart();
  switch(code){
    case 'adv':{const id=S.bases[arg];S.bases[arg]=null;const r=S.pas[id];if(arg===2)score(r);else{setBase(arg+1,id);log(pn(r)+' postoupil na '+(arg+2)+'. metu')}checkHalf();break}
    case 'rout':{const id=S.bases[arg];S.bases[arg]=null;runnerOut(id);checkHalf();break}
    case 'endhalf':switchHalf();break;
    case 'swing':S.swings=(S.swings||0)+1;if(swTot()>0&&S.swings>=swTot())doPA('K');break;
    default:doPA(code,arg)}
  const half=HALF_ENDED;ui.panel=null;ui.seq=[];commit();buzz(half?[40,70,40]:code==='swing'?15:35);actToast(half?'Konec poloviny směny':S.lastLbl?'Zapsáno: '+S.lastLbl:'');
  if(HALF_ENDED||PA_ENDED){HALF_ENDED=false;PA_ENDED=false;autoPub()}else if(PUB_T)autoPub()}
/* odezva po zápisu: krátká vibrace a lišta „Zapsáno … · Vrátit“ */
function buzz(p){try{if(PREF.buzz!==false&&navigator.vibrate)navigator.vibrate(p)}catch(e){}}
let TOAST_T=null;
function actToast(txt){if(!txt||!document.body||!document.createElement)return;let el=document.getElementById('atoast');
  if(!el){el=document.createElement('div');el.id='atoast';el.className='atoast';el.setAttribute('role','status');document.body.appendChild(el)}
  if(!el.classList)return;el.innerHTML=`<span>✓ ${esc(txt)}</span><button data-act="undo" class="atbtn">Vrátit</button>`;el.classList.add('on');clearTimeout(TOAST_T);TOAST_T=setTimeout(()=>el.classList.remove('on'),4000)}

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
    if(id!=null)s+=`<text x="${x}" y="${y+36}" text-anchor="middle" class="rn">${esc(diaLbl(S.pas[id]))}</text>`});
  s+='<polygon points="111,175 129,175 129,184 120,193 111,184" class="home"/></svg>';return s}
function runners(){let h='';for(let b=2;b>=0;b--){const id=S.bases[b];if(id==null)continue;const r=S.pas[id];const blocked=b<2&&S.bases[b+1]!=null;
  h+=`<div class="runner"><span class="label">${b+1}. meta</span><b title="${esc(pn(r))}">${esc(diaLbl(r))}</b><button class="mini-btn" data-act="adv" data-v="${b}" ${blocked?'disabled':''}>${b===2?'Domů':'P+1'}</button><button class="mini-btn out" data-act="rout" data-v="${b}">Aut</button></div>`}
  return h?`<div class="runners">${h}</div>`:'<div class="empty-bases">Mety jsou prázdné.</div>'}

function panel(){const err=ui.panel==='err';
  let h=`<div class="card panel"><div class="label">${err?'Kdo udělal chybu?':'Kdo se podílel na autu? Ťukej v pořadí'}</div>`;
  if(!err)h+=`<div class="seq">${ui.seq.length?ui.seq.join('-'):'–'}</div>`;
  h+='<div class="grid g3" style="margin-top:8px">';
  for(let i=1;i<=9;i++)h+=`<button class="big chip" data-act="chip" data-v="${i}"><b>${i}</b><small>${POS[i]}</small></button>`;
  h+='</div><div class="row" style="margin-top:10px">';
  if(!err){const dis=ui.seq.length?'':'disabled';const last=ui.seq[ui.seq.length-1];
    h+=`<button class="solid" data-act="ground" ${dis}>GO${dis?'':' '+esc(ui.seq.join('-'))}</button>
        <button class="solid" data-act="fly" ${dis}>FO${dis?'':' '+last}</button>
        <button class="solid" data-act="sac" ${dis}>SAC</button>`}
  return h+'<button class="ghost" data-act="cancel">Zrušit</button></div></div>'}

function gameView(){const t=bt(),p=S.bat[t],len=S.teams[t].lineup.length,sw=S.swings||0,tot=swTot(),last=tot>0&&sw+1>=tot,dv=dlv(),pm=pmode();
  const RES=[['1B','na metu','pálkař doběhl na 1. metu'],['2B','dvoumetový','pálkař doběhl na 2. metu'],['3B','třímetový','pálkař doběhl na 3. metu'],['HR','homerun','pálkař oběhl všechny mety']];
  const d=(short,long)=>`<small><span class="ds">${short}</span><span class="dl">${long}</span></small>`;
  /* poskládané díly; na telefonu se řadí podle čísla (o1…o9), aby tlačítka zápisu byla hned pod diamantem */
  const g=(o,h)=>h?`<div class="gp o${o}">${h}</div>`:'',tot0=t=>gTot(S,t);
  const notes=(S.example?'<div class="note">Ukázková čísla hráčů. Svoji sestavu zadáš v Nastavení.</div>':'')+(S.inning>S.settings.innings?`<div class="note">Odehráno ${S.settings.innings} směn. Můžeš pokračovat, nebo zápas ukončit.</div>`:'');
  const stat=`<div class="card status"><div class="inn">${S.inning}. ${S.top?'▲':'▼'}<span>${S.top?'horní':'dolní'} polovina</span></div>
    <div class="counts"><span class="cnt">Švihy ${tot>0?dots(sw,tot,'s'):sw}</span><span class="cnt">Auty ${dots(S.outs,3,'o')}</span><span class="cnt">Body ${lim()>0?dots(halfRuns(),lim(),'b'):halfRuns()}</span></div>
    <div class="stline"><span class="stscore"><span class="stn">${esc(S.teams[0].name)}</span><b>${tot0(0)} : ${tot0(1)}</b><span class="stn">${esc(S.teams[1].name)}</span></span>${clockCard()}</div></div>`;
  const field=`<div class="card field">${diamond()}${runners()}</div>`;
  const bat=`<div class="card batter"><div><div class="label">Na pálce · ${esc(S.teams[t].name)}${S.teams[t].name.trim().toLowerCase()===(t?'domácí':'hosté')?'':' ('+(t?'domácí':'hosté')+')'}</div><div class="who"><i>${p+1}.</i>${esc(nm(t,p))}</div></div><div class="next">Další: ${esc(nm(t,(p+1)%len))}</div></div>`;
  let act='',endb='';
  if(S.final)act=finalCard();
  else if(ui.endC)act=endConfirm();
  else if(ui.adv)act=advPanel();
  else if(ui.panel)act=panel();
  else{act=`<div class="acts"><button class="big bad swingbtn" data-act="swing"><b>Švih ${sw+1}${tot>0?' / '+tot:''}</b>${pm!=='tee'?`<span class="pitchtag ${dv==='c'?'c':''}">${dv==='c'?'coachball'+(pm==='cbtee'?' '+(sw+1)+'/'+cbN():''):'tee'+(pm==='cbtee'&&tot>cbN()?' '+(sw+1-cbN())+'/'+(tot-cbN()):'')}</span>`:''}${d(last?'poslední švih = aut':'nezasáhl nebo faul',last?'Poslední povolený švih. Když netrefí, je pálkař aut.':'Pálkař netrefil míček nebo ho odpálil do autu (faul).')}</button>
    <div class="label">Výsledek odpalu ${dv==='c'?'z nadhozu trenéra':'z tee'}</div>
    <div class="grid" style="grid-template-columns:repeat(${maxB()},minmax(0,1fr))">${RES.slice(0,maxB()).map(([c,sh,lo],i)=>`<button class="big hit" data-act="hit" data-v="${i+1}"><b>${c}</b>${d(sh,lo)}</button>`).join('')}</div>
    ${maxB()<4?`<div class="next">Pálkař smí po odpalu postoupit nejvýš o ${maxB()} ${maxB()===1?'metu':'mety'}.</div>`:''}
    <div class="grid g3"><button class="big bad" data-act="openout"><b>Aut ›</b>${d('zem / chycený','míček chycen ve vzduchu nebo hozen na metu')}</button><button class="big err" data-act="openerr"><b>Chyba ›</b>${d('E + pozice','polař chyboval, pálkař je na metě')}</button><button class="big" data-act="FC"><b>FC</b>${d('volba polaře','polař vyautoval jiného běžce')}</button></div>
    <div class="row"><button class="ghost" data-act="undo" ${hist.length?'':'disabled'}>↶ Vrátit${S.lastLbl&&hist.length?': '+esc(S.lastLbl):' krok'}</button><button class="ghost" data-act="endhalf">Ukončit polovinu směny</button></div></div>`;
    endb=`<button class="ghost danger endbtn" data-act="endask">🏁 Konec zápasu</button>`+(PUB_T?'<div class="next">Skóre pro rodiče se za chvíli odešle.</div>':'')}
  if(RO()&&!S.final){act=roCard();endb=''}
  const logc=S.log.length?`<div class="card"><div class="label">Průběh</div><ul class="log">${S.log.slice(0,20).map((l,i)=>`<li class="${i>=8?'wide-li':''}">${esc(l)}</li>`).join('')}</ul></div>`:'';
  const swapc=!started()&&!RO()?`<div class="card swap"><span>Hosté pálí první (▲), domácí druzí (▼).</span><button class="ghost" data-act="swap">⇄ Prohodit domácí a hosty</button></div>`:'';
  const a=g(0,otherCard())+g(0,!started()&&!S.prepped&&!S.final&&!RO()?nextCard():'')+g(7,lineScore())+g(1,notes)+g(2,stat)+g(3,field)+g(4,bat)+`<div class="wide">${orderCard(t)}</div>`;
  const b=g(5,act)+g(6,endb)+g(8,logc)+g(9,swapc);
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
  const sideR=rosterSide(t),pick=sideR&&sideR.players.length?`<div class="label">Přidat ze soupisky${t===ours()?'':' · '+esc(S.teams[t].name)}</div><div class="plist">${sortPl(sideR.players).filter(p=>!L.includes(p.num)).map(p=>`<button class="pchip pick" data-act="radd" data-t="${t}" data-v="${esc(p.num)}"><b>${esc(numTxt(p.num))}</b> ${esc(dn(p))}</button>`).join('')||'<span class="next">Všichni ze soupisky už jsou v sestavě.</span>'}</div>`:'';
  return `<div class="form"><div class="label">${t?'Domácí · pálí ve spodní polovině ▼':'Hosté · pálí v horní polovině ▲'}${t===ours()?' · náš tým':''}</div>
   <label for="n${t}">Název týmu<input type="text" id="n${t}" value="${esc(S.teams[t].name)}"></label>
   <div class="label">Pálkařské pořadí · ${L.length} hráčů</div>
   <div class="olist" data-t="${t}">${L.map((v,i)=>`<div class="orow ${ui.sub&&ui.sub.t===t&&ui.sub.i===i?'subbing':''}" data-i="${i}"><span class="grip" aria-hidden="true">⠿</span><span class="ord">${i+1}.</span><b class="onm">${esc(lbl(t,v))}</b><span class="obtns">${anon(v)?`<button class="pbtn" aria-label="Doplnit číslo" title="Doplnit číslo dresu" data-act="pren" data-t="${t}" data-v="${i}">✎</button>`:''}<button class="pbtn" aria-label="Posunout nahoru" title="Nahoru" data-act="pup" data-t="${t}" data-v="${i}" ${i>0?'':'disabled'}>▲</button><button class="pbtn" aria-label="Posunout dolů" title="Dolů" data-act="pdn" data-t="${t}" data-v="${i}" ${i<L.length-1?'':'disabled'}>▼</button><button class="pbtn" aria-label="Vystřídat" title="Vystřídat na tomto místě" data-act="psub" data-t="${t}" data-v="${i}">⇄</button><button class="pbtn x" aria-label="Odebrat" data-act="prem" data-t="${t}" data-v="${i}">×</button></span></div>`).join('')}</div>
   <p class="next" style="margin:0">Pořadí změníš šipkami, nebo podrž jméno a přetáhni ho nahoru či dolů.</p>

   <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="add${t}" placeholder="Číslo dresu" aria-label="Číslo hráče"><button class="solid" data-act="padd" data-t="${t}">Přidat</button></div>
   ${ui.ren&&ui.ren.t===t?renPanel(t):ui.sub&&ui.sub.t===t?subPanel(t):pick}${t!==ours()?oppPick(t)+anonRow(t):''}
   ${ui.msg[t]?`<div class="msg">${esc(ui.msg[t])}</div>`:''}</div>`}
function teamView(){const ps=sortedRoster();
  return `<div class="card form">
  <label for="tn">Název našeho týmu<input type="text" id="tn" value="${esc(R.name||S.teams[ours()].name)}"></label>${oldNames()?`<button class="ghost" data-act="renhist" style="align-self:flex-start">Sjednotit název v historii (${oldNames()} ${oldNames()===1?'zápas':'zápasů'} se starým názvem)</button>`:''}
  <div class="label">Soupiska · ${ps.length} hráčů</div>
  ${ps.length?`<div class="roster">${ps.map(p=>`<div class="rrow ${noNum(p.num)?'nonum':''}"><b>${noNum(p.num)?'–':'#'+esc(p.num)}</b><span>${plLink(p.num,dn(p)||'Hráč')}${p.nick&&String(p.nick).trim()?' <span class="ochip">'+esc(p.name)+'</span>':''}${noNum(p.num)?' <span class="ochip">bez čísla</span>':''}</span><span class="rbtns">${noNum(p.num)?`<button class="mini-btn" data-act="rassign" data-v="${esc(p.num)}">Přidělit číslo</button>`:''}${WEB.role==='admin'&&TEAMS.list.length>1?`<button class="pbtn" aria-label="Přesunout do jiného týmu" title="Přesunout do jiného týmu" data-act="rmove" data-v="${esc(p.num)}">⇄</button>`:''}<button class="pbtn x" aria-label="Odebrat ze soupisky" data-act="rdel" data-v="${esc(p.num)}">×</button></span></div>${ui.assign===p.num?assignRow(p):ui.rmove===p.num?moveRow(p):''}`).join('')}</div>`:'<div class="next">Soupiska je zatím prázdná. Přidej první hráče.</div>'}
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="rnum" placeholder="Č." aria-label="Číslo dresu" style="max-width:76px" ${ui.rNoNum?'disabled':''}><input type="text" id="rname" placeholder="Jméno" aria-label="Jméno hráče"><button class="solid" data-act="rnew">Přidat</button></div>
  <label class="radio" for="rnonum"><input type="checkbox" id="rnonum" ${ui.rNoNum?'checked':''}> zatím bez čísla (číslo přidělíš později)</label>
  ${ui.rmsg?`<div class="msg">${esc(ui.rmsg)}</div>`:''}
  <div class="next">Zadáním stejného čísla změníš jméno. Soupiska zůstává uložená i po novém zápasu.</div></div>
  ${ps.length?`<div class="card form"><div class="label">Sestava pro zápas</div><p class="next" style="margin:0">Hráče do pálkařského pořadí vybíráš v menu Lineup a obrana u týmu „${esc(S.teams[ours()].name)}“.</p><div class="row"><button class="solid" data-act="tab" data-v="lineup">Vybrat sestavu</button><button class="ghost" data-act="rall">Celá soupiska podle čísel</button><button class="ghost" data-act="prep">▶ Připravit zápas</button></div></div>`:''}`}
function addRoster(){const name=(document.getElementById('rname').value||'').trim();
  if(ui.rNoNum){if(!name){ui.rmsg='Hráče bez čísla zadej aspoň jménem.';return render()}if(R.players.some(p=>noNum(p.num)&&p.name.toLowerCase()===name.toLowerCase())){ui.rmsg=name+' už na soupisce je.';return render()}
    R.players.push({num:'~'+newId().slice(-6),name});saveR();ui.rmsg='';render();const f=document.getElementById('rname');if(f)f.focus();return}
  const num=jersey(document.getElementById('rnum').value);
  if(!num){ui.rmsg='Zadej číslo dresu, nebo zaškrtni „zatím bez čísla“.';render();return}
  const ex=R.players.find(p=>p.num===num);if(ex)ex.name=name;else R.players.push({num,name});
  saveR();ui.rmsg=ex?'Jméno u #'+num+' změněno.':'';render();const f=document.getElementById('rnum');if(f)f.focus()}
const presetOf=st=>st.preset||(PRESETS.find(([,,v])=>Object.entries(v).every(([a,b])=>(a==='pitch'?pmode(st):a==='coachN'?cbN(st):st.swingLimit??5)===b))||[''])[0];
function rulesHtml(st,p){const m=pmode(st),l=st.swingLimit??5,ma=st.maxAdvance??4,cur=presetOf(st);
  return `<div class="cols2"><label for="${p}pmode">Nadhoz<select id="${p}pmode" class="sel">${cur?'':'<option value="">vlastní nastavení</option>'}${PRESETS.map(([k,t])=>`<option value="${k}" ${cur===k?'selected':''}>${t}</option>`).join('')}</select></label>
  ${m==='cbtee'?`<label for="${p}cbn">Z toho nadhozů trenéra (zbytek z tee)<input type="number" id="${p}cbn" min="1" max="10" inputmode="numeric" value="${cbN(st)}"></label>`:''}
  <label for="${p}swl">${m==='cbtee'?'Celkem švihů, pak aut (0 = do odpalu)':'Maximum švihů na pálkaře, pak aut (0 = do odpalu)'}<input type="number" id="${p}swl" min="0" max="20" inputmode="numeric" value="${l}"></label>
  <label for="${p}inn">Počet směn<input type="number" id="${p}inn" min="1" max="12" value="${st.innings}"></label>
  <label for="${p}maxa">Nejvýš met po odpalu<select id="${p}maxa" class="sel">${[[1,'1 meta (jen 1B)'],[2,'2 mety (do 2B)'],[3,'3 mety (do 3B)'],[4,'bez omezení (i homerun)']].map(([v,t])=>`<option value="${v}" ${ma===v?'selected':''}>${t}</option>`).join('')}</select></label>
  <label for="${p}lim">Bodů na polovinu směny (0 = bez limitu)<input type="number" id="${p}lim" min="0" max="30" inputmode="numeric" value="${st.runLimit??5}"></label>
  <label for="${p}tlim">Časový limit v minutách (0 = bez limitu)<input type="number" id="${p}tlim" min="0" max="180" inputmode="numeric" value="${st.timeLimit||0}"></label></div>
  <label class="radio" for="${p}advp"><input type="checkbox" id="${p}advp" ${st.advPanel!==false?'checked':''}> Po odpalu se ptát, kam doběhli běžci</label>
  <p class="next" style="margin:0">Polovina směny končí po 3 autech, nebo po limitu bodů. Teď: ${esc(pitchTxt(st))}.</p>`}
/* nastaví pravidla do st podle id pole (bez předpony) */
function ruleSet(st,k,v){const n=(x,lo,hi)=>num(x,lo,hi);
  if(k==='advp'){st.advPanel=!!v;return}
  if(k==='pmode'){const pr=PRESETS.find(x=>x[0]===v);if(pr){Object.assign(st,pr[2]);st.preset=v}return true}
  if(k==='cbn'){const x=n(v,1,10);if(x){st.coachN=x;delete st.preset}return}
  if(k==='swl'){const x=n(v,0,20);if(x!=null){st.swingLimit=x;delete st.preset}return}
  if(k==='inn'){const x=n(v,1,12);if(x)st.innings=x;return}
  if(k==='maxa'){st.maxAdvance=+v;return}
  if(k==='lim'){const x=n(v,0,30);if(x!=null)st.runLimit=x;return}
  if(k==='tlim'){const x=n(v,0,180);if(x!=null)st.timeLimit=x;return}}
const luT=()=>ui.luSide==='t'?1-ours():ours();
const lineupCard=()=>`<div class="card form"><div class="tabs" style="align-self:flex-start">${[['o','Náš tým'],['t','Soupeř']].map(([k,l])=>`<button class="${(ui.luSide||'o')===k?'on':''}" data-act="luside" data-v="${k}">${l}</button>`).join('')}</div>
  ${ui.luSide==='t'?'':preCheck()}${lineupEditor(luT())}</div>`;
/* kontrola před zápasem: pořadí, obrana 1. směny, čísla dresů */
function preCheck(){const o=ours(),L=S.teams[o].lineup;if(!L.length)return'';const D=((S.def||{})[Math.max(1,S.inning)]||{}),need=Math.min(L.length,noCatch()?8:9),
    filled=new Set(L.map(n=>D[n]).filter(p=>p&&p!=='B'&&p!=='10'&&!(p==='2'&&noCatch()))).size,nn=L.filter(n=>anon(n)||noNum(n)).length,inn=Math.max(1,S.inning);
  const c=(ok,txt,act)=>`<${act?'button':'span'} class="pck ${ok?'ok':'warn'}"${act?` data-act="dsub" data-v="${act}"`:''}>${ok?'✓':'⚠'} ${txt}</${act?'button':'span'}>`;
  return `<div class="pcheck">${c(L.length>=5,L.length+' v pořadí')}${c(filled>=need,'obrana '+inn+'. směny '+filled+'/'+need,'def')}${nn?c(false,nn+' bez čísla dresu'):''}</div>`}
const teamSetup=()=>`<div class="card form"><div class="label">Týmy</div>
  ${vsSelect()}<label for="ours">Náš tým (jména ze soupisky)<select id="ours" class="sel">${[0,1].map(t=>{const r=t?'Domácí':'Hosté',n=S.teams[t].name;return `<option value="${t}" ${ours()===t?'selected':''}>${r}${n&&n.trim().toLowerCase()!==r.toLowerCase()?' · '+esc(n):''}</option>`}).join('')}</select></label>
  <button class="ghost" data-act="swap" ${started()?'disabled':''}>⇄ Prohodit domácí a hosty</button>
  ${started()?'<p class="next" style="margin:0">Prohodit jde jen před prvním odpalem.</p>':''}</div>`;
function setView(){
  return `<div class="card form">
  ${rulesHtml(S.settings,'')}
  <button class="solid" data-act="tab" data-v="game">Hotovo, k zápasu</button></div>
  <div class="card form"><div class="label">Nový zápas</div><p style="margin:0" class="next">Smaže všechny zapsané akce. Sestavy a nastavení zůstanou.</p>
  ${ui.confirm?'<div class="row"><button class="solid" style="background:var(--pencil)" data-act="reset">Ano, smazat zápis</button><button class="ghost" data-act="noreset">Zpět</button></div>':'<button class="ghost danger" data-act="askreset">Začít nový zápas</button>'}</div>
  <p class="next" style="margin:0">${SYNC&&SYNC.st==='ok'?'Zápis se ukládá v telefonu a online pro tvůj tým.':'Zápis se ukládá v tomto prohlížeči na tomto zařízení.'} Připojení, zálohu a vzhled najdeš v menu Účet a zálohy.</p>`}

function render(){applyTheme();if(document.body&&document.body.classList)document.body.classList.toggle('in',ROLE==='scorer');if(ROLE==='login'){renderLogin();return}if(ROLE!=='scorer'){renderParent();return}setSub('');
  document.getElementById('tabs').innerHTML=navHtml();document.getElementById('view').innerHTML=(VIEWS[ui.tab]||VIEWS.game)();if(RO())roMark();menuFit();wakeSync()}
/* trenér „jen sleduje“: vidí vše, mění jen obranu, pořadí na pálce a střídání (+ prohlížení, exporty, odhlášení) */
const RO_ACT=new Set(('tab menu dsub luside pdn dpos dput sheet lsheet definn defside defrot deffill defclear deffair padd rall radd prem pup psub psubno psubpick psubgo anon pren renno rengo '+
  'attlineup attdef sum sumclose sumcopy csvgame csvseason pdf spdf plpdf dippdf waimg waclose wasave washare stteam stall tsel logout copylink syncnow otherok sun pl plback cancel').split(' '));
const RO_ID=new Set(['ft','fc','teamsel','pf-theme','pf-wake','pf-buzz','add0','add1','subnum','rennum','sumtext']),roOk=id=>RO_ID.has(id)||id.startsWith('dp-')||id.startsWith('att-');
function roMark(){if(!document.querySelectorAll)return;document.querySelectorAll('#view [data-act]').forEach(b=>{if(!RO_ACT.has(b.dataset.act)){b.disabled=true;b.classList.add('rodis')}});
  document.querySelectorAll('#view input,#view select,#view textarea').forEach(x=>{if(!roOk(x.id||''))x.disabled=true})}
const roCard=()=>`<div class="card rocard"><b>👀 Sleduješ zápas</b><p class="next" style="margin:4px 0 0">Zápis vede zapisovatel a obrazovka se ti obnovuje sama. Můžeš upravit obranu, pořadí na pálce a střídání. Zapisovat ti může povolit správce.</p></div>`;
/* menu vždy celé na obrazovce */
function menuFit(){if(!ui.menu||!document.querySelector)return;const m=document.querySelector('.menu-list');if(!m)return;m.style.left='0px';const r=m.getBoundingClientRect(),W=document.documentElement.clientWidth;let d=0;if(r.right>W-8)d=W-8-r.right;if(r.left+d<8)d=8-r.left;m.style.left=d+'px'}
/* Lineup a obrana: přepínání Lineup · Obrana · Nastavení */
const DSUB=[['lu','Lineup'],['def','Obrana'],['set','Nastavení']];
const defSubNav=()=>`<div class="qnav" role="tablist">${DSUB.map(([k,l])=>`<button role="tab" class="${(ui.defSub||'lu')===k?'on':''}" aria-selected="${(ui.defSub||'lu')===k}" data-act="dsub" data-v="${k}">${l}</button>`).join('')}</div>`;
const KEEP_TABS=['game','sheet','def','score','games','team','stats','opp','set','admin'];

function addPlayer(t){const inp=document.getElementById('add'+t);const v=jersey(inp.value);
  if(!v){ui.msg[t]='Zadej číslo dresu (0–999).';render();return}
  if(S.teams[t].lineup.includes(v)){ui.msg[t]='Číslo #'+v+' už v sestavě je.';render();return}
  snap();S.teams[t].lineup.push(v);S.example=false;ui.msg=['',''];commit();const ni=document.getElementById('add'+t);if(ni)ni.focus()}


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
  L.forEach((num,p)=>{const y=top+rh*(p+1);g.textAlign='left';g.fillStyle=INK;g.font=`700 ${Math.min(40,rh*.45)}px ${D}`;const was=slotNums(t,p).filter(x=>x!==num);g.fillText(`${p+1}. ${lbl(t,num)}${was.length?' (dříve '+was.map(x=>short(x)).join(', ')+')':''}`,M+16,y+rh/2,nameW-24);
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
function metaCard(){const m=meta();return `<div class="card form meta"><div class="cols2"><label for="md">Datum<input type="date" id="md" value="${esc(m.date)}"></label><label for="mf">Hřiště<input type="text" id="mf" value="${esc(m.field||'')}" placeholder="např. hřiště Sokol"></label>${metaSel('my','Typ zápasu',GTYPES,m.type)}${metaSel('mc','Soutěž',COMPS,m.comp)}</div><label class="radio" for="mns"><input type="checkbox" id="mns" ${S.noStats?'':'checked'}> Započítat zápas do statistik hráčů</label></div>`}
const metaSel=(id,label,list,cur)=>`<label for="${id}">${label}<select id="${id}" class="sel"><option value="">–</option>${list.map(v=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;

/* =========== extras: timer, defense, playing time, history, season, recap, backup =========== */
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
if(!S.gameId){S.gameId=newId();save()}
const range=n=>Array.from({length:n},(_,i)=>i+1);
const innCount=()=>Math.max(S.settings.innings,S.inning);
const HITS=['1B','2B','3B','HR'];

function actLabel(code,arg){const t=bt(),who=nm(t,S.bat[t]);
  switch(code){case 'hit':return who+' '+HITS[arg-1];case 'hitx':return who+' '+HITS[arg.n-1];case 'swing':return who+' švih';case 'out':return who+' aut '+arg.code;case 'E':return who+' E'+arg;case 'FC':return who+' FC';
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
  const btn=!c?'<button class="mini-btn" data-act="clkstart">▶ Čas</button>':ui.clkC?'<button class="mini-btn out" data-act="clkyes">Vynulovat?</button><button class="mini-btn" data-act="clkno">Ne</button>':'<button class="mini-btn" data-act="clkreset" aria-label="Vynulovat čas">↺</button>';
  return `<span class="clock ${st}"><span aria-hidden="true">⏱</span><b id="clk">${c?c.txt:'0:00'}</b>${L?`<span class="next">/ ${L} min</span>`:''}${btn}</span>${msg?`<div class="clkmsg ${st}">${msg}</div>`:''}`}
let CLK_ST=null;
setInterval(()=>{const el=document.getElementById('clk');if(!el)return;const c=clockNow();if(c)el.textContent=c.txt;const st=clockState();if(CLK_ST!==null&&st!==CLK_ST&&ROLE==='scorer'&&ui.tab==='game'&&!ui.panel)render();CLK_ST=st},1000);

/* ----- defense ----- */
const POSN={...POS,10:'další zadák',B:'lavička'};
const POS_ORDER=['1','2','3','4','5','6','7','8','9','10','B'];
/* odpal jen z tee: catcher není, místo něj hraje další zadák */
function noCatch(){return !!(S&&S.settings)&&pmode()==='tee'}
function posOrder(){return noCatch()?POS_ORDER.filter(p=>p!=='2'):POS_ORDER}
function teeFix(){try{if(!noCatch())return;['def','def2'].forEach(k=>Object.values(S[k]||{}).forEach(d=>{if(d)Object.keys(d).forEach(n=>{if(d[n]==='2')d[n]='10'})}))}catch(e){}}
const posTxt=p=>p==='B'?'Lavička':p==='10'?'Další zadák':p+' · '+POSN[p];
const posShort=p=>p==='B'?'L':p==='10'?'Z+':p;
const hasDef2=()=>!!(S.vsTid&&TEAMS.list.some(t=>t.id===S.vsTid)),DEFK=()=>ui.defSide==='t'&&hasDef2()?'def2':'def',defTeam=()=>DEFK()==='def2'?1-ours():ours();
const defL=()=>S.teams[defTeam()].lineup;
const onSide=(side,fn)=>{const k=ui.defSide;ui.defSide=side;try{return fn()}finally{ui.defSide=k}};
function defOf(i){const k=DEFK();if(!S[k])S[k]={};if(!S[k][i])S[k][i]={};return S[k][i]}
function defFill(i){const d=defOf(i),F=['1','2','3','4','5','6','7','8','9'].filter(p=>p!=='2'||!noCatch());defL().forEach((n,k)=>{d[n]=F[k]||'10'})}
function defRotate(i){const L=defL(),p=defOf(i-1),d=defOf(i);const pos=L.map(n=>p[n]||'B');L.forEach((n,k)=>{d[n]=pos[(k-1+L.length)%L.length]})}
function defWarn(d){const cnt={};Object.values(d).forEach(p=>{if(p&&p!=='B'&&p!=='10')cnt[p]=(cnt[p]||0)+1});
  const dup=Object.keys(cnt).filter(p=>cnt[p]>1);const miss=range(9).map(String).filter(p=>!cnt[p]&&!(p==='2'&&noCatch()));const w=[];
  if(dup.length)w.push('Dvakrát obsazeno: '+dup.map(p=>POSN[p]).join(', ')+'.');
  if(miss.length&&miss.length<9&&defL().length>=(noCatch()?8:9))w.push('Neobsazeno: '+miss.map(p=>POSN[p]).join(', ')+'.');
  return w.length?`<div class="msg">${w.join(' ')}</div>`:''}
function defView(){const L=defL(),n=innCount();let i=ui.defInn||Math.min(S.inning,n);if(i>n)i=n;ui.defInn=i;const d=defOf(i);
  let h=`<div class="card form"><div class="label">Obrana · ${esc(S.teams[defTeam()].name)}</div>${hasDef2()?`<div class="tabs" style="align-self:flex-start">${[['o',ours()],['t',1-ours()]].map(([k,t])=>`<button class="${DEFK()===(k==='t'?'def2':'def')?'on':''}" data-act="defside" data-v="${k}">${esc(S.teams[t].name)}</button>`).join('')}</div>`:''}
  <div class="tabs innt">${range(n).map(k=>`<button class="${k===i?'on':''}" data-act="definn" data-v="${k}">${k}. směna</button>`).join('')}</div>
  <div class="row"><button class="solid" data-act="deffair">Férově od ${i}. směny</button>${i>1?`<button class="ghost" data-act="defrot">Rotovat z ${i-1}. směny</button>`:''}<button class="ghost" data-act="deffill">Podle pořadí</button><button class="ghost" data-act="defclear">Vymazat</button></div>
  ${defField(d,L)}
  <details class="dlist"><summary>Upravit seznamem</summary><div class="defl">${L.map(num=>`<div class="defrow"><label for="dp-${esc(num)}"><b>${esc(lbl(defTeam(),num))}</b></label><select id="dp-${esc(num)}" class="sel" data-num="${esc(num)}"><option value="">–</option>${posOrder().map(p=>`<option value="${p}" ${d[num]===p?'selected':''}>${posTxt(p)}</option>`).join('')}</select></div>`).join('')}</div></details>
  ${defWarn(d)}<p class="next" style="margin:0">„Férově“ rozdělí pozice na tuto a všechny další směny: nikdo nehraje stejné místo dvakrát po sobě, každý se vystřídá ve vnitřním i vnějším poli a bere se ohled na celou sezónu. Rotace posune každého na pozici hráče před ním v pořadí.</p></div>`;
  return h+playTimeCard()}

/* ----- obrana klepáním na hřiště: klepni na pozici, pak na dítě ----- */
const DFXY={1:[50,49],2:[50,79],3:[83,53],4:[67,31],5:[17,53],6:[33,31],7:[20,10],8:[50,2],9:[80,10]},DFL={1:'P',2:'C',3:'1B',4:'2B',5:'3B',6:'SS',7:'LF',8:'CF',9:'RF'};
function defNm(num){const t=defTeam(),n=t===ours()?rname(num):'';const f=String(n||'').trim().split(/\s+/)[0];return anon(num)?'P'+String(num).slice(1):noNum(num)?(f||'–'):'#'+num+(f?' '+f:'')}
function defField(d,L){const at={},ex=[],bn=[];L.forEach(n=>{const p=d[n];if(p&&DFL[p])at[p]=n;else if(p==='10')ex.push(n);else bn.push(n)});
  const pos=Object.keys(DFL).filter(p=>p!=='2'||!noCatch());
  let h=`<div class="dfield"><svg viewBox="0 0 400 336" preserveAspectRatio="none" aria-hidden="true"><path d="M200 300 L40 150 A226 226 0 0 1 360 150 Z" class="dfan"/><polygon points="200,290 290,205 200,120 110,205" class="din"/></svg>
    ${pos.map(p=>`<button class="dpos ${ui.dpos===p?'on':''} ${at[p]?'':'empty'}" style="left:${DFXY[p][0]}%;top:${DFXY[p][1]}%" data-act="dpos" data-v="${p}"><b>${DFL[p]}</b><span>${at[p]?esc(defNm(at[p])):'–'}</span></button>`).join('')}</div>
    <div class="dmore"><button class="dchip ${ui.dpos==='10'?'on':''}" data-act="dpos" data-v="10"><b>Další zadák</b> ${ex.length?esc(ex.map(defNm).join(', ')):'–'}</button><button class="dchip ${ui.dpos==='B'?'on':''}" data-act="dpos" data-v="B"><b>Lavička / bez pozice</b> ${bn.length?esc(bn.map(defNm).join(', ')):'–'}</button></div>`;
  if(ui.dpos)h+=`<div class="dpick"><div class="label">Kdo bude ${ui.dpos==='B'?'na lavičce':ui.dpos==='10'?'další zadák':'na pozici '+DFL[ui.dpos]}?</div><div class="plist">${L.map(n=>`<button class="pchip pick ${d[n]===ui.dpos?'cur':''}" data-act="dput" data-v="${esc(n)}"><b>${esc(defNm(n))}</b>${d[n]?' <small>'+esc(d[n]==='B'?'lavička':d[n]==='10'?'další zadák':DFL[d[n]]||'')+'</small>':''}</button>`).join('')}${DFL[ui.dpos]&&at[ui.dpos]?`<button class="pchip pick" data-act="dput" data-v="">nikdo</button>`:''}<button class="ghost" data-act="dpos" data-v="">Zavřít</button></div></div>`;
  else h+='<p class="next" style="margin:0">Klepni na pozici na hřišti a pak vyber dítě. Kdo na ní byl, dostane místo vybraného dítěte.</p>';
  return h}
function defPut(num){const p=ui.dpos,d=defOf(ui.defInn);if(!p)return;snap();
  if(!num){Object.keys(d).forEach(k=>{if(d[k]===p)delete d[k]})}
  else{const old=d[num];if(DFL[p])Object.keys(d).forEach(k=>{if(k!==num&&d[k]===p){if(old&&old!==p)d[k]=old;else delete d[k]}});if(p==='B')d[num]='B';else d[num]=p}
  ui.dpos=null;S.example=false;commit()}
/* ----- fair playing time ----- */
function playTimeCard(){const o=defTeam(),L=defL(),n=innCount(),D=S[DEFK()];if(!L.length)return'';
  const rows=[...new Set([...L,...(S.subs||[]).filter(x=>x.t===o).map(x=>x.out)])].map(num=>{const pa=S.pas.filter(r=>r.t===o&&r.num===num);let inf=0,outf=0,bench=0;const pos=[];
    for(let i=1;i<=n;i++){const p=D&&D[i]&&D[i][num];pos.push(p?posShort(p):'·');if(!p)continue;if(p==='B')bench++;else if(+p>=7)outf++;else inf++}
    return{num,pa:pa.length,on:pa.filter(r=>HITS.includes(r.code)||r.code==='FC'||r.code[0]==='E').length,runs:pa.filter(r=>r.scored).length,inf,outf,bench,pos}});
  const minPa=Math.min(...rows.map(r=>r.pa)),maxPa=Math.max(...rows.map(r=>r.pa)),minB=Math.min(...rows.map(r=>r.bench));
  return `<div class="card"><div class="label">Herní čas · ${esc(S.teams[o].name)}</div><div class="ls-wrap"><table class="pt">
  <thead><tr><th>Hráč</th><th>Pálil</th><th>Met</th><th>Body</th><th>Vnitř.</th><th>Vnější</th><th>Lav.</th><th>Pozice po směnách</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td class="nm">${o===ours()?plLink(r.num,lbl(o,r.num)):esc(lbl(o,r.num))}</td><td class="${maxPa-minPa>=2&&r.pa===minPa?'low':''}">${r.pa}</td><td>${r.on}</td><td>${r.runs}</td><td>${r.inf}</td><td>${r.outf}</td><td class="${r.bench>minB+1?'low':''}">${r.bench}</td><td class="posl">${r.pos.join(' ')}</td></tr>`).join('')}
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
const typeOk=g=>{const t=g.meta&&g.meta.type,f=ui.fType;return !f||(f==='@comp'?COMP_TYPES.includes(t):f==='@friendly'?FRIEND_TYPES.includes(t):t===f)};
const inFilter=g=>!!g.final&&!g.noStats&&typeOk(g)&&(!ui.fComp||(g.meta&&g.meta.comp)===ui.fComp);
const fTypeTxt=()=>ui.fType==='@comp'?'soutěžní zápasy':ui.fType==='@friendly'?'přátelské zápasy':ui.fType;
const fTypeSel=()=>`<label for="ft">Zápasy<select id="ft" class="sel"><option value="">všechny</option><option value="@comp" ${ui.fType==='@comp'?'selected':''}>jen soutěžní (přebor, turnaj, pohár)</option><option value="@friendly" ${ui.fType==='@friendly'?'selected':''}>jen přátelské (friendly, scrimmage)</option><optgroup label="podle typu">${GTYPES.map(v=>`<option ${v===ui.fType?'selected':''}>${esc(v)}</option>`).join('')}</optgroup></select></label>`;
const allTeams=()=>ui.allTeams&&TEAMS.list.length>1;
function seasonData(){const H=loadH();let games=[];
  const teams=allTeams()?TEAMS.list.map(t=>t.id):[TEAMS.cur];
  teams.forEach(tid=>{const h=tid===TEAMS.cur?H:loadHFor(tid),cur=tid===TEAMS.cur?S:store.get(keyFor(KEY,tid),null),ros=tid===TEAMS.cur?R:store.get(keyFor(RKEY,tid),{players:[]})||{players:[]};
    const nameOf=n=>((ros.players||[]).find(p=>p.num===n)||{}).name||'';
    h.forEach(g=>games.push({g,tid,nameOf}));if(cur&&cur.pas&&cur.pas.length&&!h.some(g=>g.gameId===cur.gameId))games.push({g:cur,tid,nameOf})});
  games=games.filter(x=>inFilter(x.g));const st={};
  games.forEach(({g,tid,nameOf})=>{const o=g.ours??1;const seen=new Set();(g.pas||[]).filter(r=>r.t===o&&!anon(r.num)).forEach(r=>{const nm=nameOf(r.num),key=allTeams()?(nm?r.num+'|'+nm:tid+'|'+r.num):r.num;
    const s=st[key]||(st[key]={num:r.num,label:noNum(r.num)?(nm||'Hráč')+' (bez č.)':'#'+r.num+(nm?' '+nm:''),g:0,pa:0,h:0,xb:0,r:0,ob:0,k:0});
    if(!seen.has(key)){seen.add(key);s.g++}s.pa++;if(HITS.includes(r.code))s.h++;if(HITS.slice(1).includes(r.code))s.xb++;if(r.scored)s.r++;if(HITS.includes(r.code)||r.code==='FC'||r.code[0]==='E')s.ob++;if(r.code==='K')s.k++})});
  return{H,games:games.map(x=>x.g),rows:Object.values(st).sort((a,b)=>(+a.num)-(+b.num))}}
function seasonView(){const {games,rows}=seasonData();
  const all=loadH().length+(S.pas.length&&!loadH().some(g=>g.gameId===S.gameId)?1:0);
  let h=`<div class="card"><div class="label">Sezóna · statistiky hráčů</div>${TEAMS.list.length>1?`<div class="row filt"><button class="ghost ${allTeams()?'':'on-btn'}" data-act="stteam">Jen tento tým</button><button class="ghost ${allTeams()?'on-btn':''}" data-act="stall">Všechny týmy</button></div>`:''}${all?`<div class="cols2 filt">${fTypeSel()}${metaSel('fc','Soutěž',COMPS,ui.fComp).replace('<option value="">–</option>','<option value="">všechny</option>')}</div>`:''}`;
  if(!rows.length)h+=`<p class="next" style="margin:6px 0 0">${all?'Žádný zápas neodpovídá zvolenému filtru.':'Statistiky se objeví po prvním ukončeném zápase (🏁 Konec zápasu).'}</p>`;
  else h+=`<div class="ls-wrap"><table class="pt"><thead><tr><th>Hráč</th><th>Záp.</th><th>Pálil</th><th>Odpaly</th><th>Na metě</th><th>Body</th><th>K</th><th>Úspěš.</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td class="nm">${allTeams()?esc(r.label):plLink(r.num,r.label)}</td><td>${r.g}</td><td>${r.pa}</td><td>${r.h}${r.xb?` <small>(${r.xb} dlouhé)</small>`:''}</td><td>${r.ob}</td><td>${r.r}</td><td>${r.k}</td><td>${r.pa?avg(r.ob,r.pa):'–'}</td></tr>`).join('')}
    </tbody></table></div><p class="next" style="margin:6px 0 0">${games.length} ${games.length===1?'zápas':games.length<5?'zápasy':'zápasů'}. Úspěšnost = jak často se hráč po svém odpalu dostal na metu.${S.pas.length&&!S.final?' Rozehraný zápas se započítá po ukončení.':''}</p>`;
  h+=(rows.length?`<div class="row" style="margin-top:8px"><button class="ghost" data-act="csvseason">Export statistik (CSV)</button></div>`:'')+(ui.hMsg?`<div class="next">${esc(ui.hMsg)}</div>`:'')+`</div>`+achCard();
  return h}
function historyCard(){const H=loadH();let h=`<div class="card"><div class="label">Historie zápasů</div>`;
  if(!H.length)h+='<p class="next" style="margin:6px 0 0">Zatím nic. Zápas se uloží tlačítkem v Zápisu, při „Konec zápasu“ nebo při založení nového zápasu.</p>';
  else h+=`<div class="hist">${H.map(g=>{const go=g.ours??1,a=gTot(g,go),b=gTot(g,1-go),res=a>b?'V':a<b?'P':'R';
    return `<div class="hrow"><span class="res r${res}">${res}</span><div class="hmain"><b>${esc(g.teams[go].name)} ${a} : ${b} ${esc(g.teams[1-go].name)}</b><span class="next">${esc(gDate(g))}${g.meta&&g.meta.field?' · '+esc(g.meta.field):''}${kindTxt(g.meta)?' · '+esc(kindTxt(g.meta)):''}${!g.final?' · nedokončený, nepočítá se':g.noStats?' · mimo statistiky':''}${g.gameId===S.gameId?' · právě otevřený':''}${g.stars&&g.stars.length?' · ⭐ '+g.stars.map(x=>esc(short(x))).join(' '):''}</span></div>
    <div class="hbtns">${ui.hdel===g.gameId?`<button class="mini-btn out" data-act="hdelyes" data-v="${esc(g.gameId)}">Smazat</button><button class="mini-btn" data-act="hdelno">Ne</button>`:`${g.gameId===S.gameId?'':`<button class="mini-btn" data-act="hopen" data-v="${esc(g.gameId)}">Otevřít</button>`}<button class="mini-btn out" data-act="hdel" data-v="${esc(g.gameId)}" aria-label="Smazat zápas">×</button>`}</div></div>`}).join('')}</div>
    <p class="next" style="margin:6px 0 0">Otevřený zápas najdeš v Zápisu, odkud ho můžeš uložit i jako PDF. Rozehraný zápas se před otevřením uloží do historie.</p>`;
  return h+(ui.hMsg?`<div class="next">${esc(ui.hMsg)}</div>`:'')+'</div>'}

/* ----- recap text ----- */
function summaryText(){const o=ours(),st={};S.pas.filter(r=>r.t===o).forEach(r=>{const x=st[r.num]||(st[r.num]={h:0,r:0});if(HITS.includes(r.code))x.h++;if(r.scored)x.r++});
  const list=(k)=>Object.entries(st).filter(([,x])=>x[k]>0).sort((a,b)=>b[1][k]-a[1][k]).map(([n,x])=>lbl(o,n)+(x[k]>1?' ('+x[k]+')':'')).join(', ');
  let s=`${S.teams[0].name} ${gTot(S,0)} : ${gTot(S,1)} ${S.teams[1].name}\n${metaLine()}`;
  const hl=list('h'),rl=list('r');if(hl)s+=`\nOdpaly: ${hl}`;if(rl)s+=`\nBody: ${rl}`;
  s+=recapExtra();const pi=Math.max(1,S.top?S.inning-1:S.inning);const hh=S.hits[o];s+=`\n${S.teams[o].name}: ${hh} ${hh===1?'odpal':hh>=2&&hh<=4?'odpaly':'odpalů'} za ${pi} ${pi===1?'směnu':pi<5?'směny':'směn'}. Díky všem za skvělý zápas!`;return s}
function gameTools(){let h=`<div class="card form"><div class="label">Po zápase</div>${starsBlock()}${achNow()}
  <div class="row"><button class="ghost" data-act="sum">Shrnutí pro rodiče</button><button class="ghost" data-act="hsave">Uložit do historie</button><button class="ghost" data-act="csvgame">Export zápisu (CSV)</button><button class="ghost" data-act="waimg" ${ui.waBusy?'disabled':''}>📷 Obrázek pro WhatsApp</button></div>`;
  if(ui.waImg)h+=`<img src="${ui.waImg}" alt="Obrázek s výsledkem zápasu" class="waimg"><div class="row">${WA.share?'<button class="solid" data-act="washare">Sdílet</button>':''}<button class="${WA.share?'ghost':'solid'}" data-act="wasave">Stáhnout obrázek</button><button class="ghost" data-act="waclose">Zavřít</button></div>`;
  if(ui.sum)h+=`<textarea readonly id="sumtext" class="bktext">${esc(summaryText())}</textarea><div class="row"><button class="solid" data-act="sumcopy">Kopírovat text</button><button class="ghost" data-act="sumclose">Zavřít</button></div>`;
  return h+(ui.gMsg?`<div class="next">${esc(ui.gMsg)}</div>`:'')+'</div>'}

/* ----- backup ----- */
function backupData(){save();saveR();const data={};TEAMS.list.forEach(t=>{data[t.id]={S:store.get(keyFor(KEY,t.id),null),R:store.get(keyFor(RKEY,t.id),null),H:loadHFor(t.id),Sch:store.get(keyFor(SKEY,t.id),[])}});
  return{app:'tball-scorekeeper',v:2,when:new Date().toISOString(),S,R,H:loadH(),teams:{list:TEAMS.list,data},opponents:loadOpp()}}
function settingsExtra(){return `<div class="card form"><div class="label">Záloha</div><p class="next" style="margin:0">Uloží soupisku, rozehraný zápas i historii do jednoho souboru. Na jiném telefonu ho pak obnovíš.</p>
  <div class="row"><button class="solid" data-act="bkup">Zálohovat do souboru</button><label class="ghost filebtn" for="bkfile">Obnovit ze souboru<input type="file" id="bkfile" accept=".json,application/json" class="vh"></label></div>
  ${ui.bkPending?`<div class="msg">Obnovit zálohu z ${esc(new Date(ui.bkPending.when).toLocaleString('cs-CZ'))}? ${ui.bkPending.teams&&ui.bkPending.teams.list?' Obsahuje '+ui.bkPending.teams.list.length+' '+(ui.bkPending.teams.list.length===1?'tým':'týmy')+'.':''} Přepíše soupisky, zápasy i historii v tomto telefonu.</div><div class="row"><button class="solid" data-act="bkapply">Ano, obnovit</button><button class="ghost" data-act="bkcancel">Zrušit</button></div>`:''}
  ${ui.bkMsg?`<div class="next">${esc(ui.bkMsg)}</div>`:''}</div>`}
async function copyFrom(id,okMsg){const el=document.getElementById(id);const txt=el?el.value:'';try{await navigator.clipboard.writeText(txt);return okMsg}catch(e){if(el){el.focus();el.select()}return'Text je označený, zkopíruj ho ručně.'}}

/* =========== one dispatcher for every tap and every field change =========== */
const num=(x,lo,hi)=>{const n=parseInt(x,10);return n>=lo?Math.min(n,hi):null};
async function copyAct(id,key,ok){const r=await copyFrom(id,ok);ui[key]=r;render();if(r!==ok)selectText(id)}
function selectText(id){const t=document.getElementById(id);if(t){t.focus();t.select()}}
const ACT={
  tab:v=>{ui.menu=false;if(v==='set'){v='def';ui.defSub='set'}if(v==='lineup'){v='def';ui.defSub='lu';ui.luSide='o'}ui.tab=v;ui.confirm=false;ui.msg=['',''];if(v==='admin'&&typeof CO!=='undefined'){CO.staff=null;CO.msg=''}if(KEEP_TABS.includes(v))prefSet('tab',v);render();window.scrollTo&&window.scrollTo(0,0)},
  menu:()=>{ui.menu=!ui.menu;render()},
  sheet:v=>{ui.sheet=+v;render()},
  /* scoring */
  hit:v=>{if(+v>=1&&+v<=maxB()){if(S.bases.some(b=>b!=null)&&S.settings.advPanel!==false)advOpen(+v);else act('hit',+v)}},adv:v=>{if(S.bases[+v]!=null)act('adv',+v)},rout:v=>{if(S.bases[+v]!=null)act('rout',+v)},
  swing:()=>act('swing'),FC:()=>act('FC'),endhalf:()=>act('endhalf'),undo:()=>{const el=document.getElementById&&document.getElementById('atoast');if(el&&el.classList)el.classList.remove('on');undo()},swap:()=>swapTeams(),
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
  pup:(v,t)=>{const i=+v;if(i<1)return;snap();lineSwap(t,i);S.example=false;commit()},pdn:(v,t)=>{const i=+v+1;if(i>=S.teams[t].lineup.length)return;snap();lineSwap(t,i);S.example=false;commit()},
  /* new game */
  askreset:()=>{ui.confirm=true;render()},noreset:()=>{ui.confirm=false;render()},
  reset:()=>{archiveGame();const k={settings:S.settings,teams:S.teams,ours:S.ours};S=fresh();Object.assign(S,k);S.example=false;hist=[];ui.confirm=false;ui.tab='game';commit()},
  /* pdf & live score */
  pdf:()=>makePdf(),pubnow:()=>publishLive(false),pubfinal:()=>endGame(true),
  /* clock */
  clkstart:()=>{S.clock={start:Date.now()};commit()},clkreset:()=>{ui.clkC=true;render()},clkno:()=>{ui.clkC=false;render()},
  clkyes:()=>{ui.clkC=false;S.clock={start:null};commit()},
  /* defense */
  definn:v=>{ui.defInn=+v;render()},
  defrot:()=>{snap();defRotate(ui.defInn);commit()},deffill:()=>{snap();defFill(ui.defInn);commit()},defclear:()=>{snap();defOf(ui.defInn);S[DEFK()][ui.defInn]={};commit()},defside:v=>{ui.defSide=v;render()},
  /* history */
  hsave:()=>{ui.gMsg=archiveGame()?'Uloženo do historie. Najdeš ji v menu Rozpis a výsledky.':S.pas.length?'Uložení se nepovedlo.':'Zatím není co ukládat.';render()},
  hopen:v=>{const g=loadH().find(x=>x.gameId===v);if(!g)return;archiveGame();S=JSON.parse(JSON.stringify(g));delete S.savedAt;hist=[];ui.tab='sheet';ui.hMsg='';commit()},
  hdel:v=>{ui.hdel=v;render()},hdelno:()=>{ui.hdel=null;render()},
  hdelyes:v=>deleteGame(v),
  /* recap */
  sum:()=>{ui.sum=true;ui.gMsg='';render()},sumclose:()=>{ui.sum=false;render()},
  sumcopy:()=>copyAct('sumtext','gMsg','Zkopírováno. Vlož text do skupiny rodičů.'),
  /* backup */
  bkup:async()=>{try{await DL.save({filename:'tball-zaloha-'+todayISO()+'.json',data:JSON.stringify(backupData())});ui.bkMsg='Záloha uložena.'}catch(err){ui.bkMsg=err&&err.code==='declined'?'Ukládání zrušeno.':'Zálohu se nepodařilo uložit.'}render()},
  bkcancel:()=>{ui.bkPending=null;render()},
  bkapply:()=>{const b=ui.bkPending;if(!b||!b.S||!b.S.teams)return;if(b.teams&&Array.isArray(b.teams.list)&&b.teams.list.length&&b.teams.data)return restoreAllTeams(b);S=b.S;if(b.R&&Array.isArray(b.R.players))R=b.R;saveR();saveH(Array.isArray(b.H)?b.H:[]);hist=[];ui.bkPending=null;ui.bkMsg='Záloha obnovena.';commit()},
};
const CHG={
  ...Object.fromEntries(['pmode','cbn','swl','inn','maxa','lim','tlim','advp'].map(k=>[k,(v,el)=>{if(ruleSet(S.settings,k,k==='advp'?!!(el&&el.checked):v))render()}])),
  n0:v=>{if(v.trim())S.teams[0].name=v.trim()},n1:v=>{if(v.trim())S.teams[1].name=v.trim()},
  tn:v=>{const old=R.name||S.teams[ours()].name;R.name=v.trim();saveR();if(R.name)S.teams[ours()].name=R.name;saveTeams();if(R.name&&old&&old!==R.name){const n=renameInHistory(old,R.name);ui.rmsg=n?'Název změněn i u '+n+' '+(n===1?'zápasu':'zápasů')+' v historii.':'';render()}},
  ours:v=>{S.ours=+v;render()},
  md:v=>{meta().date=v||todayISO()},mns:(v,el)=>{if(el.checked)delete S.noStats;else S.noStats=true;if(loadH().some(g=>g.gameId===S.gameId))archiveGame()},mf:v=>{meta().field=v.trim()},my:v=>{meta().type=v},mc:v=>{meta().comp=v},ft:v=>{ui.fType=v;render()},fc:v=>{ui.fComp=v;render()},
  'pub-auto':(v,el)=>{S.settings.autoPub=el.checked},
  bkfile:(v,el)=>{const f=el.files&&el.files[0];if(!f)return;readJson(f,b=>{if(b.kind==='team'){ui.tmPending=b;ui.tab='admin';return}if(!b.S||!b.S.teams)throw 0;ui.bkPending=b;ui.bkMsg=''},m=>ui.bkMsg=m)},
  tmfile:(v,el)=>{const f=el.files&&el.files[0];if(f)readJson(f,b=>{if(b.kind==='team')ui.tmPending=b;else if(b.R&&Array.isArray(b.R.players))ui.tmPending=teamFromBackup(b);else throw 0;ui.tmMsg=''},m=>ui.tmMsg=m)},
};
document.addEventListener('click',e=>{
  if(ui.menu&&!e.target.closest('.menu')){ui.menu=false;render();return}
  const el=e.target.closest('[data-act]');if(!el||el.disabled)return;if(RO()&&!RO_ACT.has(el.dataset.act))return;const f=ACT[el.dataset.act];if(f)f(el.dataset.v,+el.dataset.t)});
document.addEventListener('change',e=>{const el=e.target,id=el.id||'';if(RO()&&!roOk(id))return render();
  if(id.startsWith('dp-')){const d=defOf(ui.defInn);if(el.value)d[el.dataset.num]=el.value;else delete d[el.dataset.num];save();return render()}
  if(id.startsWith('wz-'))return wizChg(id.slice(3),el);
  if(id.startsWith('cor-')){const cid=id.slice(4),r=CO.roles[cid]||{teams:{}};return coSave(cid,{w:el.value==='w',teams:{...(r.teams||{})}})}
  if(id.startsWith('cot-')){const rest=id.slice(4),i=rest.indexOf('-'),cid=rest.slice(0,i),tid=rest.slice(i+1),r=CO.roles[cid]||{w:false,teams:{}},tm={...(r.teams||{})};if(el.checked)tm[tid]=true;else delete tm[tid];return coSave(cid,{w:!!r.w,teams:tm})}
  if(id.startsWith('wb-')){const w=ui.wiz,n=id.slice(3);if(w&&w.att2){w.att2=el.checked?[...new Set([...w.att2,n])]:w.att2.filter(x=>x!==n)}return render()}
  if(id.startsWith('wa-')){const w=ui.wiz,n=id.slice(3);if(w)w.att=el.checked?[...new Set([...w.att,n])]:w.att.filter(x=>x!==n);return render()}
  if(id.startsWith('att-')){const n=id.slice(4),a=attList();S.att=el.checked?[...new Set([...a,n])]:a.filter(x=>x!==n);save();return render()}
  const f=CHG[id];if(f){f(el.value,el);save()}});

/* ----- substitution on the same batting slot (ČBA § 9.5.7: libovolné střídání, ale jen na místě vystřídaného) ----- */
function slotNums(t,i){const cur=S.teams[t].lineup[i],h=[];(S.subs||[]).forEach(x=>{if(x.t===t&&x.slot===i){h.push(x.out,x.in)}});h.push(cur);return[...new Set(h)]}
function subPanel(t){const {i}=ui.sub,L=S.teams[t].lineup,out=L[i];
  const sr=rosterSide(t),picks=sr?sortPl(sr.players).filter(p=>!L.includes(p.num)):[];
  return `<div class="subp"><div class="label">Střídání na ${i+1}. místě v pořadí · za ${esc(lbl(t,out))}</div>
  ${picks.length?`<div class="plist">${picks.map(p=>`<button class="pchip pick" data-act="psubpick" data-v="${esc(p.num)}"><b>${esc(numTxt(p.num))}</b> ${esc(dn(p))}</button>`).join('')}</div>`:''}
  <div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="subnum" placeholder="Číslo náhradníka" aria-label="Číslo náhradníka"><button class="solid" data-act="psubgo">Vystřídat</button><button class="ghost" data-act="psubno">Zrušit</button></div>
  ${ui.subMsg?`<div class="msg">${esc(ui.subMsg)}</div>`:''}
  <p class="next" style="margin:0">Náhradník bude pálit na tomto místě. Vystřídaný hráč se může později vrátit, ale zase jen na toto místo.</p></div>`}
function doSub(raw){if(!ui.sub)return;const {t,i}=ui.sub,L=S.teams[t].lineup,num=jersey(raw);
  if(!num){ui.subMsg='Zadej číslo dresu náhradníka.';return render()}
  if(L.includes(num)){ui.subMsg='#'+num+' už v pořadí je. Hráč smí pálit jen na jednom místě.';return render()}
  const elsewhere=(S.subs||[]).find(x=>x.t===t&&x.slot!==i&&(x.out===num||x.in===num));
  if(elsewhere){ui.subMsg='#'+num+' už pálil na '+(elsewhere.slot+1)+'. místě. Může se vrátit jen tam.';return render()}
  snap();const out=L[i];L[i]=num;(S.subs=S.subs||[]).push({t,slot:i,out,in:num,inn:S.inning});
  {const dk=t===ours()?'def':hasDef2()?'def2':null,d=dk&&S[dk]&&S[dk][S.inning];if(d&&d[out]&&!d[num]){d[num]=d[out];delete d[out]}}
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
/* smazání zápasu z historie: zmizí i ze statistik, z otevřeného zápisu a ze zrcadla u mého druhého týmu */
function deleteGame(id){const H=loadH(),g=H.find(x=>x.gameId===id);saveH(H.filter(x=>x.gameId!==id));let extra='';
  if(g&&g.vsTid&&TEAMS.list.some(t=>t.id===g.vsTid)){const vs=g.vsTid,h=loadHFor(vs),keep=h.filter(x=>!(x.gameId===g.mirrorOf||x.mirrorOf===id||x.gameId===id+'v'));
    if(keep.length!==h.length&&(typeof canWrite!=='function'||canWrite(vs))){store.set(keyFor(HKEY,vs),keep);extra=' i z historie týmu '+teamName(TEAMS.list.find(t=>t.id===vs))}}
  if(S.gameId===id){const nx=fresh();nx.settings=S.settings;nx.teams=S.teams.map(x=>({name:x.name,lineup:x.lineup.slice()}));nx.ours=S.ours;nx.example=false;S=nx;hist=[];save()}
  ui.hdel=null;ui.hMsg='Zápas smazán z historie'+extra+'. Ze statistik zmizel taky.';render()}
function gamesChrono(){const g=loadH().filter(x=>x.gameId!==S.gameId&&x.final);if(S.final&&S.pas.length)g.push(S);const k=x=>String(x.meta&&x.meta.date)+'|'+String(x.gameId).padStart(14,'0');return g.sort((a,b)=>k(a).localeCompare(k(b)))}
/* who caught a fly out: position from the code (F8 = střední zadák), player from that inning's defense */
function catcherOf(g,r){const m=/^F(\d)$/.exec(r.code||''),d=g.def&&g.def[r.inn];if(!m||!d)return null;return Object.keys(d).find(n=>d[n]===m[1])||null}
function achievements(){const seen={},out=[];gamesChrono().forEach(g=>{const o=g.ours??1,add=(num,k,label)=>{const key=num+'|'+k;if(!seen[key]){seen[key]=1;out.push({num,label,gameId:g.gameId,date:g.meta&&g.meta.date})}};
  (g.pas||[]).forEach(r=>{if(r.t===o){if(!anon(r.num))ACH.forEach(([k,label,f])=>{if(f(r))add(r.num,k,label)})}else{const c=catcherOf(g,r);if(c&&!anon(c))add(c,'fo','první chycený aut ze vzduchu')}})});return out}
function flyouts(g){const o=g.ours??1,by={};let unknown=0;(g.pas||[]).filter(r=>r.t!==o&&/^F\d$/.test(r.code)).forEach(r=>{const c=catcherOf(g,r);if(c)by[c]=(by[c]||0)+1;else unknown++});return{by,unknown}}
const achThisGame=()=>achievements().filter(a=>a.gameId===S.gameId);
function achNow(){const a=achThisGame();return a.length?`<div class="ach"><div class="label">Poprvé v sezóně</div>${a.map(x=>`<span class="achip">🎉 ${esc(lbl(ours(),x.num))} · ${esc(x.label)}</span>`).join('')}</div>`:''}
function achCard(){const a=achievements();if(!a.length)return'';const by={};a.forEach(x=>(by[x.num]=by[x.num]||[]).push(x));
  return `<div class="card"><div class="label">Úspěchy v sezóně</div><div class="achl">${Object.keys(by).sort((a,b)=>(+a)-(+b)).map(n=>`<div class="achr"><b>${plLink(n,lbl(ours(),n))}</b><span>${by[n].map(x=>`🎉 ${esc(x.label)} <small>${esc(x.date?gDate({meta:{date:x.date}}):'')}</small>`).join('<br>')}</span></div>`).join('')}</div></div>`}

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
  <div class="attl">${ps.map(p=>`<label class="radio att" for="att-${esc(p.num)}"><input type="checkbox" id="att-${esc(p.num)}" ${a.includes(p.num)?'checked':''}> <b>${esc(numTxt(p.num))}</b> ${esc(dn(p))}</label>`).join('')}</div>
  <div class="row"><button class="solid" data-act="attlineup">Sestavit pořadí z přítomných</button><button class="ghost" data-act="attdef">…a vyplnit obranu</button></div>
  <p class="next" style="margin:0">V U7 hraje 5–9 dětí, víc jen po dohodě trenérů.</p>${ui.attMsg?`<div class="next">${esc(ui.attMsg)}</div>`:''}</div>`}
function attLineup(withDef){if(S.pas.some(r=>r.t===ours())){ui.attMsg='Pořadí z přítomných jde sestavit jen před prvním odpalem našeho týmu. Během zápasu použij střídání (⇄ v Nastavení).';return render()}const a=attList(),L=sortedRoster().map(p=>p.num).filter(n=>a.includes(n));if(!L.length){ui.attMsg='Nikdo není zaškrtnutý.';return render()}
  const o=ours();snap();S.teams[o].lineup=L;S.bat[o]=0;S.subs=(S.subs||[]).filter(x=>x.t!==o);if(withDef)defFill(1);S.example=false;
  ui.attMsg='Pořadí: '+L.map(n=>'#'+n).join(', ')+(withDef?'. Obrana 1. směny je vyplněná.':'.');commit()}

/* ----- rozpis zápasů ----- */
const SKEY='tball-schedule-v1',OKEY='tball-opp-v1';
const GTYPES=['Scrimmage','Friendly','Přebor','Turnaj','Pohár'],COMP_TYPES=['Přebor','Turnaj','Pohár'],FRIEND_TYPES=['Scrimmage','Friendly'],COMPS=['Baseball U9','Softball U10'];
const kindTxt=m=>[m&&m.type,m&&m.comp].filter(Boolean).join(' · ');
const optList=(id,label,list)=>`<label for="${id}">${label}<select id="${id}" class="sel">${list.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`;
const loadSch=()=>{const x=store.get(tkey(SKEY),[]);return Array.isArray(x)?x:[]};
const saveSch=x=>store.set(tkey(SKEY),x);
function scheduleCard(){const list=loadSch().filter(x=>!x.played).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  return `<div class="card form"><div class="label">Rozpis zápasů</div>
  ${list.length?`<div class="hist">${list.map(x=>`<div class="hrow"><span class="res rR">${x.home?'D':'H'}</span><div class="hmain"><b>${esc(R.name||S.teams[ours()].name)} – ${esc(x.opp)}</b><span class="next">${esc(gDate({meta:{date:x.date}}))}${x.time?' · '+esc(x.time):''}${x.field?' · '+esc(x.field):''} · ${x.home?'doma':'venku'}${kindTxt(x)?'<br>'+esc(kindTxt(x)):''}</span></div><div class="hbtns"><button class="mini-btn" data-act="schstart" data-v="${esc(x.id)}">▶ Začít</button><button class="mini-btn out" data-act="schdel" data-v="${esc(x.id)}" aria-label="Smazat z rozpisu">×</button></div></div>`).join('')}</div>`:'<p class="next" style="margin:0">Zatím žádné naplánované zápasy.</p>'}
  <div class="cols2"><label for="sch-d">Datum<input type="date" id="sch-d" value="${todayISO()}"></label><label for="sch-t">Čas<input type="time" id="sch-t"></label>
  <label for="sch-o">Soupeř<input type="text" id="sch-o" placeholder="název týmu"></label>${oppSchedSelect()}${TEAMS.list.length>1?`<label for="sch-v">…nebo můj tým<select id="sch-v" class="sel"><option value="">ne, cizí tým</option>${TEAMS.list.filter(t=>t.id!==TEAMS.cur).map(t=>`<option value="${esc(t.id)}">${esc(teamName(t))}</option>`).join('')}</select></label>`:''}<label for="sch-f">Hřiště<input type="text" id="sch-f" placeholder="kde se hraje"></label>
  <label for="sch-h">Hrajeme<select id="sch-h" class="sel"><option value="1">doma (pálíme druzí)</option><option value="0">venku (pálíme první)</option></select></label>
  ${optList('sch-y','Typ zápasu',GTYPES)}${optList('sch-c','Soutěž',COMPS)}</div>
  <button class="ghost" data-act="schadd" style="align-self:flex-start">Přidat do rozpisu</button>${ui.schMsg?`<div class="next">${esc(ui.schMsg)}</div>`:''}
  <p class="next" style="margin:0">„Začít“ otevře přípravu zápasu: kdo přišel, pořadí a obrana. Rozehraný zápas se uloží do historie. Rozpis a výsledky vidí i rodiče na svém odkazu.</p></div>`}
function schAdd(){const g=id=>(document.getElementById(id)||{}).value||'';const vs=TEAMS.list.find(t=>t.id===g('sch-v')&&t.id!==TEAMS.cur),so=!vs&&oppById(g('sch-p'));const opp=vs?teamName(vs):so?so.name:g('sch-o').trim();if(!opp){ui.schMsg='Doplň soupeře.';return render()}
  const x={id:newId(),date:g('sch-d')||todayISO(),time:g('sch-t'),opp,field:g('sch-f').trim(),home:g('sch-h')!=='0',type:g('sch-y')||GTYPES[0],comp:g('sch-c')||COMPS[0]};if(vs)x.vsTid=vs.id;else if(so){x.oppId=so.id;const oc=oppComps(so);if(oc.length===1&&!oc.includes(x.comp))x.comp=oc[0]}const l=loadSch();l.push(x);saveSch(l);if(vs)twinSchedule(x);ui.schMsg='Přidáno: '+opp+(vs?'. Zápas je i v rozpisu týmu '+opp+'.':'.');render()}

/* ----- CSV export ----- */
const csvCell=v=>{v=String(v??'');return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const csv=rows=>'\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
function csvGame(){const rows=[['Směna','Polovina','Tým','Hráč','Výsledek','Kam se dostal','Bod','Aut','Švihy']];
  S.pas.forEach(r=>rows.push([r.inn,r.t?'dolní':'horní',S.teams[r.t].name,lbl(r.t,r.num),r.code,['–','1. meta','2. meta','3. meta','domů'][r.scored?4:r.reach],r.scored?'ano':'',r.outNo||'',r.sw||'']));return csv(rows)}
function csvSeason(){const {rows}=seasonData();return csv([['Hráč','Zápasy','Pálil','Odpaly','Dlouhé odpaly','Na metě','Body','K','Úspěšnost']].concat(rows.map(r=>[r.label,r.g,r.pa,r.h,r.xb,r.ob,r.r,r.k,r.pa?avg(r.ob,r.pa):''])))}
async function saveCsv(name,text){try{await DL.save({filename:name,data:text});ui.gMsg=ui.hMsg='Soubor uložen.'}catch(e){ui.gMsg=ui.hMsg=e&&e.code==='declined'?'Ukládání zrušeno.':'Soubor se nepodařilo uložit.'}render()}

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
  schadd:()=>schAdd(),schdel:v=>{saveSch(loadSch().filter(x=>x.id!==v));render()},
  csvgame:()=>saveCsv('zapis-'+(S.teams[0].name+'-'+S.teams[1].name+'-'+meta().date).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.csv',csvGame()),
  csvseason:()=>saveCsv('statistiky-sezona-'+[fTypeTxt(),ui.fComp].filter(Boolean).map(x=>x.replace(/\s+/g,'-')+'-').join('')+todayISO()+'.csv',csvSeason()),
  lsheet:()=>{ui.lsheet=!ui.lsheet;render()},
});
/* ----- konec zápasu ----- */
const resultTxt=()=>`${esc(S.teams[0].name)} ${gTot(S,0)} : ${gTot(S,1)} ${esc(S.teams[1].name)}`;
function endConfirm(){const live=liveOn()&&S.settings.pubOn;
  return `<div class="card form panel"><div class="label">Ukončit zápas?</div><div class="fin-score">${resultTxt()}</div>
  <p class="next" style="margin:0">Zápis se uzamkne, zastaví se čas a zápas se uloží do historie.${live?' Rodičům se pošle konečné skóre.':''} Kdyby to bylo omylem, zápis jde znovu otevřít.</p>
  <div class="row"><button class="solid" data-act="endyes">Ano, ukončit zápas</button><button class="ghost" data-act="endno">Zpět k zápisu</button></div></div>`}
function finalCard(){const o=ours(),a=gTot(S,o),b=gTot(S,1-o),res=a>b?'Vyhráli jsme':a<b?'Dnes jsme nevyhráli':'Remíza';
  return `<div class="card form fin"><div class="label">🏁 Zápas skončil · ${res}</div><div class="fin-score">${resultTxt()}</div>
  ${achNow()}
  ${saveBox()}
  <div class="row"><button class="solid" data-act="tab" data-v="sheet">Shrnutí a hvězdy</button><button class="ghost" data-act="waimg">📷 Obrázek pro WhatsApp</button><button class="ghost" data-act="endundo">Znovu otevřít zápis</button></div></div>`+nextCard()}

/* ----- obrázek s výsledkem pro WhatsApp (1080×1080 PNG) ----- */
const WA={blob:null,share:false};
async function resultImage(){const o=ours(),a=gTot(S,o),b=gTot(S,1-o),W=1080,c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d'),
    FD='"Barlow Condensed","Arial Narrow",sans-serif',FB='"Atkinson Hyperlegible",Arial,sans-serif',Y='#ffd54a',G='#b9d4c4';
  try{await document.fonts.load('700 40px "Barlow Condensed"')}catch(e){}
  const fit=(t,font,size,max)=>{let f=size;do{x.font=font.replace('#',f+'px')}while(x.measureText(t).width>max&&(f-=2)>12);return f},
    txt=(t,font,size,cx,y,max,col,al)=>{fit(t,font,size,max);x.fillStyle=col;x.textAlign=al||'center';x.fillText(t,cx,y)};
  x.fillStyle='#173a2a';x.fillRect(0,0,W,W);x.fillStyle='#1f4a36';x.fillRect(0,0,W,190);
  try{const lg=await loadImg('icon-192.png');x.drawImage(lg,50,40,110,110)}catch(e){}
  txt(R.name||S.teams[o].name,'700 # '+FD,64,190,105,840,'#fff','left');
  txt([gDate(S),kindTxt(S.meta),S.meta&&S.meta.field].filter(Boolean).join(' · ')||'Výsledek zápasu','700 # '+FB,32,190,155,840,G,'left');
  txt((a>b?'Vyhráli jsme!':a<b?'Dnes jsme nevyhráli':'Remíza').toUpperCase(),'700 # '+FD,76,W/2,300,960,Y);
  txt(S.teams[o].name,'700 # '+FD,52,280,390,440,'#fff');txt(S.teams[1-o].name,'700 # '+FD,52,800,390,440,'#fff');
  txt(String(a),'700 # '+FD,260,280,610,440,Y);txt(String(b),'700 # '+FD,260,800,610,440,Y);txt(':','700 # '+FD,200,W/2,590,100,Y);
  /* tabulka směn */
  const n=Math.max(S.settings.innings||0,...S.runs.map(r=>r.length),1),cw=Math.min(80,560/(n+1)),x0=W/2-((n+1)*cw+300)/2,top=690,rh=62;
  x.strokeStyle='#2f5a44';x.lineWidth=2;
  for(let i=0;i<=n;i++)txt(i<n?String(i+1):'R','700 # '+FB,26,x0+300+i*cw+cw/2,top,cw,G);
  [o,1-o].forEach((t,k)=>{const y=top+20+k*rh;x.strokeRect(x0,y,300+(n+1)*cw,rh);txt(S.teams[t].name,'700 # '+FB,30,x0+14,y+42,280,'#fff','left');
    for(let i=0;i<=n;i++){const v=i<n?(S.runs[t]||[])[i]:gTot(S,t);txt(v==null?'':String(v||0),'700 # '+FB,34,x0+300+i*cw+cw/2,y+44,cw,i<n?'#fff':Y)}});
  /* hvězdy zápasu */
  if(S.stars&&S.stars.length){const sn=n=>{const p=R.players.find(q=>q.num===n),nm=p?(String(p.nick||'').trim()||String(p.name||'').split(' ')[0]):'';return (noNum(n)||anon(n)?'':'#'+n+' ')+nm};
    txt(S.stars.length>1?'HVĚZDY ZÁPASU':'HVĚZDA ZÁPASU','700 # '+FB,26,W/2,905,600,G);txt('⭐ '+S.stars.map(sn).join(' · ')+' ⭐','700 # '+FB,44,W/2,965,980,'#fff')}
  txt('Baseball Scorekeeper','700 # '+FB,24,W/2,1045,600,G);
  return c}
async function waMake(){ui.waBusy=true;ui.gMsg='';render();try{const c=await resultImage();ui.waImg=c.toDataURL('image/png');
    WA.blob=await new Promise(ok=>c.toBlob(ok,'image/png'));const f=new File([WA.blob],'vysledek.png',{type:'image/png'});WA.share=!!(navigator.canShare&&navigator.canShare({files:[f]}))}
  catch(e){ui.gMsg='Obrázek se nepodařilo vytvořit.'}ui.waBusy=false;render()}
Object.assign(ACT,{waimg:()=>{if(ui.tab!=='sheet'){ui.tab='sheet'}waMake()},waclose:()=>{ui.waImg=null;render()},
  wasave:async()=>{if(WA.blob)await DL.save({filename:'vysledek-'+(S.meta&&S.meta.date||'zapasu')+'.png',data:WA.blob})},
  washare:async()=>{if(!WA.blob)return;try{await navigator.share({files:[new File([WA.blob],'vysledek.png',{type:'image/png'})],text:S.teams[0].name+' '+gTot(S,0)+' : '+gTot(S,1)+' '+S.teams[1].name})}catch(e){}}});
function saveBox(){  return `<div class="savebox"><div class="label">Uložit na Google Disk</div>
  <div class="row"><button class="ghost" data-act="pdf" ${ui.pdfBusy?'disabled':''}>📄 Uložit PDF zápis</button><button class="ghost" data-act="bkup">💾 Uložit zálohu</button></div>
  ${ui.pdfMsg?`<div class="next">PDF: ${esc(ui.pdfMsg)}</div>`:''}${ui.bkMsg?`<div class="next">Záloha: ${esc(ui.bkMsg)}</div>`:''}
  <p class="next" style="margin:0">Soubor se uloží do telefonu. Pak ho otevři ve Stažených souborech a přes <b>Sdílet → Disk</b> ho pošli na Google Disk. Záloha obsahuje soupisku i všechny zápasy, dá se z ní všechno obnovit v Nastavení.</p></div>`}
function endGame(force){if(!S.pas.length&&!force){ui.endC=false;return render()}
  snap();S.final=true;ui.endC=false;ui.panel=null;if(S.clock&&S.clock.start&&!S.clock.end)S.clock.end=Date.now();
  clearTimeout(PUB_T);PUB_T=null;log('konec zápasu · '+gTot(S,0)+' : '+gTot(S,1));save();archiveGame();if(typeof FBX!=='undefined'&&FBX&&WEB.role)setTimeout(()=>autoBackup(TEAMS.cur),5000);
  if(liveOn()&&(S.settings.pubOn||force))publishLive(true);else render()}
Object.assign(ACT,{
  endask:()=>{ui.endC=true;ui.panel=null;render()},endno:()=>{ui.endC=false;render()},endyes:()=>endGame(false),
  endundo:()=>{snap();S.final=false;if(S.clock)delete S.clock.end;log('zápis znovu otevřen');commit()},
});
/* ----- přenos týmu (soupiska + nastavení) na jiné zařízení ----- */
const TEAM_SETTINGS=['innings','runLimit','swingLimit','maxAdvance','timeLimit','pitch','coachN','preset','advPanel'];
function teamData(){const st={};TEAM_SETTINGS.forEach(k=>{if(S.settings[k]!=null)st[k]=S.settings[k]});
  return{app:'tball-scorekeeper',kind:'team',v:1,when:new Date().toISOString(),R:{name:R.name||S.teams[ours()].name,players:R.players},settings:st,lineup:S.teams[ours()].lineup.filter(n=>!anon(n))}}
const teamFromBackup=b=>({app:b.app,kind:'team',v:1,when:b.when,R:b.R,settings:(b.S&&b.S.settings)||{},lineup:[]});
function readJson(f,ok,bad){const rd=new FileReader();rd.onload=()=>{try{const b=JSON.parse(rd.result);if(!b||b.app!=='tball-scorekeeper')throw 0;ok(b)}catch(e){bad('Tohle není soubor z této aplikace.')}render()};rd.readAsText(f)}
function teamTransferCard(){const p=ui.tmPending;
  return `<div class="card form"><div class="label">Přenos týmu na jiné zařízení</div>
  <p class="next" style="margin:0">Uloží soupisku (čísla a jména), název týmu a pravidla zápasu do malého souboru. Pošli ho na Google Disk (Sdílet → Disk) a na druhém telefonu ho tady načti. Zápasy a historie se nemění.</p>
  <div class="row"><button class="solid" data-act="tmsave">Uložit tým do souboru</button><label class="ghost filebtn" for="tmfile">Načíst tým ze souboru<input type="file" id="tmfile" accept=".json,application/json" class="vh"></label></div>
  ${p?`<div class="msg">Načíst tým „${esc(p.R&&p.R.name||'bez názvu')}“ (${(p.R&&p.R.players||[]).length} hráčů)${p.when?' uložený '+esc(new Date(p.when).toLocaleString('cs-CZ')):''}? Nahradí soupisku a pravidla v tomto telefonu.</div><div class="row"><button class="solid" data-act="tmapply">Ano, načíst</button><button class="ghost" data-act="tmcancel">Zrušit</button></div>`:''}
  ${ui.tmMsg?`<div class="next">${esc(ui.tmMsg)}</div>`:''}</div>`}
function teamApply(){const b=ui.tmPending;if(!b||!b.R||!Array.isArray(b.R.players)){ui.tmPending=null;return render()}
  snap();R={name:b.R.name||'',players:b.R.players.filter(p=>p&&(jersey(p.num)||noNum(p.num))).map(p=>({...p,num:noNum(p.num)?p.num:jersey(p.num),name:String(p.name||'')}))};saveR();
  TEAM_SETTINGS.forEach(k=>{if(b.settings&&b.settings[k]!=null)S.settings[k]=b.settings[k]});
  const o=ours();if(R.name)S.teams[o].name=R.name;
  if(!S.pas.some(r=>r.t===o)&&Array.isArray(b.lineup)&&b.lineup.length){S.teams[o].lineup=b.lineup.filter(jersey);S.bat[o]=0;S.example=false}
  saveTeams();ui.tmPending=null;ui.tmMsg='Tým načten: '+R.players.length+' hráčů.';commit()}
Object.assign(ACT,{
  tmsave:async()=>{try{await DL.save({filename:('tym-'+(R.name||S.teams[ours()].name)+'-'+todayISO()).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.json',data:JSON.stringify(teamData())});ui.tmMsg='Uloženo. Teď ho pošli na Google Disk (Sdílet → Disk).'}catch(e){ui.tmMsg=e&&e.code==='declined'?'Ukládání zrušeno.':'Soubor se nepodařilo uložit.'}render()},
  tmapply:()=>teamApply(),tmcancel:()=>{ui.tmPending=null;render()},
});
/* =========== více týmů =========== */
const teamName=t=>t.id===TEAMS.cur?(R.name||S.teams[ours()].name||t.name||'Tým'):(t.name||((store.get(keyFor(RKEY,t.id),null)||{}).name)||'Tým');
function saveTeams(){TEAMS.list.forEach(t=>{if(t.id===TEAMS.cur)t.name=R.name||t.name});store.set(TEAMS_KEY,{list:TEAMS.list,ts:Date.now()});try{localStorage.setItem(TCUR_KEY,JSON.stringify(TEAMS.cur))}catch(e){}}
function loadTeam(tid){TEAMS.cur=tid;try{localStorage.setItem(TCUR_KEY,JSON.stringify(tid))}catch(e){}
  R=store.get(tkey(RKEY),null);if(!R||!Array.isArray(R.players))R={name:(TEAMS.list.find(t=>t.id===tid)||{}).name||'',players:[]};
  S=store.get(tkey(KEY),null);if(!S||!S.teams){S=fresh();if(R.name)S.teams[ours()].name=R.name;if(R.players.length){S.teams[ours()].lineup=sortedRoster().map(p=>p.num);S.example=false}}
  hist=[];clearTimeout(PUB_T);PUB_T=null;Object.assign(ui,{panel:null,seq:[],sheet:0,confirm:false,msg:['',''],edit:null,sub:null,ren:null,endC:false,tmPending:null,bkPending:null,sum:false,wiz:null,player:null,plNum:false,defSide:'o',rmove:null,assign:null,defInn:null,gMsg:'',hMsg:'',attMsg:'',schMsg:'',fType:'',fComp:''})}
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
const sortPl=ps=>(ps||[]).slice().sort(byNum);
const rosterOfTeam=tid=>tid===TEAMS.cur?R:(store.get(keyFor(RKEY,tid),null)||{players:[]});
function vsRoster(){return S.vsTid&&TEAMS.list.some(t=>t.id===S.vsTid)?rosterOfTeam(S.vsTid):null}
const rosterSide=t=>t===ours()?R:vsRoster();
const nameIn=(ros,num)=>{const p=ros&&(ros.players||[]).find(p=>p.num===num);return p?dn(p):''};
const sideLineup=tid=>{const ps=sortPl(rosterOfTeam(tid).players);return ps.length?ps.map(p=>p.num):range(9).map(i=>'?'+i)};
function vsSelect(){if(TEAMS.list.length<2)return'';const others=TEAMS.list.filter(t=>t.id!==TEAMS.cur),locked=S.pas.length>0;
  return `<label for="vstid">Soupeř je můj druhý tým<select id="vstid" class="sel" ${locked?'disabled':''}><option value="">ne, hrajeme proti cizímu týmu</option>${others.map(t=>`<option value="${esc(t.id)}" ${S.vsTid===t.id?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>
  ${S.vsTid?'<p class="next" style="margin:0">Soupeř dostal soupisku a jména svého týmu. Po skončení se zápas uloží do historie a statistik obou týmů.</p>':locked?'':'<p class="next" style="margin:0">Vyber před prvním odpalem. Soupeř pak dostane soupisku svého týmu.</p>'}`}
function setVs(tid){if(S.pas.length)return;const t=1-ours();snap();delete S.oppId;
  if(tid&&TEAMS.list.some(x=>x.id===tid&&x.id!==TEAMS.cur)){S.vsTid=tid;S.teams[t]={name:teamName(TEAMS.list.find(x=>x.id===tid)),lineup:sideLineup(tid)}}
  else{delete S.vsTid;S.teams[t]={name:t?'Domácí':'Hosté',lineup:range(9).map(i=>'?'+i)}}
  S.bat[t]=0;S.subs=(S.subs||[]).filter(x=>x.t!==t);save();render()}
function mirrorGame(g){const vs=g.vsTid;if(!vs||vs===TEAMS.cur||!TEAMS.list.some(t=>t.id===vs))return;
  const m=JSON.parse(JSON.stringify(g));m.gameId=g.mirrorOf||g.gameId+'v';m.mirrorOf=g.gameId;m.vsTid=TEAMS.cur;m.ours=1-(g.ours??1);m.stars=[];delete m.att;{const a=m.def,b=m.def2;if(b)m.def=b;else delete m.def;if(a)m.def2=a;else delete m.def2}
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
/* role: správce · zapisovatel (kód týmu) · trenér (osobní kód z tréninkové aplikace + přístup skroles/<id>) */
const isCoach=()=>WEB.role==='coach',RO=()=>isCoach()&&!WEB.cw,myTeam=tid=>WEB.role==='admin'||WEB.team===tid||(isCoach()&&(WEB.teams||[]).includes(tid));
const canWrite=tid=>WEB.role==='admin'||WEB.team===tid||(isCoach()&&!!WEB.cw&&(WEB.teams||[]).includes(tid));
const canState=tid=>canWrite(tid)||myTeam(tid); /* trenér „jen sleduje“ smí měnit obranu, pořadí a střídání = stav zápasu */
const liveOn=()=>!!(FBX&&WEB.role);
const baseUrl=()=>location.origin+location.pathname;
const parentUrl=tid=>baseUrl()+'?tym='+encodeURIComponent(tid);
const dugoutUrl=tid=>baseUrl().replace(/[^/]*$/,'')+'dugout.html?tym='+encodeURIComponent(tid);
/* veřejná data pro tablet v dugoutu (public/<tid>/dugout): skóre, naše sestava se jmény, dnešní odpaly, obrana */
var DUG_T=null,DUG_LAST='';
function dugoutData(){const o=ours(),fi=bt()===o&&o===1?S.inning+1:S.inning,D=S.def||{},nm={};
  S.teams[o].lineup.forEach(n=>{const p=R.players.find(q=>q.num===n),x=p?(String(p.nick||'').trim()||String(p.name||'').trim().split(/\s+/)[0]):'';if(x)nm[n]=x});Object.keys(D[fi]||{}).concat(Object.keys(D[S.inning]||{})).forEach(n=>{const p=R.players.find(q=>q.num===n),x=p?(String(p.nick||'').trim()||String(p.name||'').trim().split(/\s+/)[0]):'';if(x)nm[n]=x});
  return{v:1,us:R.name||S.teams[o].name,them:S.teams[1-o].name,ours:o,inning:S.inning,top:S.top,outs:S.outs,runs:S.runs.map(a=>Array.from(a,x=>x||0)),final:!!S.final,
    innings:S.settings.innings,bat:S.bat[o],lineup:S.teams[o].lineup.slice(),names:nm,pas:S.pas.filter(r=>r.t===o).map(r=>[r.num,r.code,r.scored?1:0]),
    defInn:fi,def:D[fi]||null,example:!!S.example,clock:S.clock&&S.clock.start?{s:S.clock.start,e:S.clock.end||null}:null,tl:tlim()}}
function dugSoon(){if(!FBX||!WEB.role||WEB.role==='parent'||!S||!canState(TEAMS.cur))return;clearTimeout(DUG_T);DUG_T=setTimeout(dugPub,120)}
function dugPub(){if(!FBX||!S)return;const j=J(dugoutData()),k=TEAMS.cur+j;if(k===DUG_LAST)return;DUG_LAST=k;
  FBX.db.ref('public/'+TEAMS.cur+'/dugout').set({ts:Date.now(),json:j}).catch(()=>{DUG_LAST=''})}
function genCode(){let c='';const r=crypto.getRandomValues(new Uint32Array(8));for(let i=0;i<8;i++)c+=CODE_ABC[r[i]%CODE_ABC.length];return c.slice(0,4)+'-'+c.slice(4)}
const normCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(.{4})(.+)$/,'$1-$2');

/* ---------- start ---------- */
function fbInit(){if(FBX)return FBX;if(typeof firebase==='undefined'){WEB.msg='Nepodařilo se načíst připojení. Zkontroluj internet a obnov stránku.';return null}
  try{firebase.initializeApp(FB_CONFIG);FBX={db:firebase.database(),auth:firebase.auth()};
    FBX.db.ref('.info/connected').on('value',s=>{WEB.online=!!s.val();netUpd();if(SYNC.st!=='off'){SYNC.st=WEB.online?(FS.dirty.size?'saving':'ok'):'offline';if(WEB.online)flushSoon()}if(WEB.online&&WEB.role&&WEB.role!=='parent'&&S.pubPend)return publishLive(S.pubPend==='final');if(ui.tab==='admin'||ui.tab==='score')render()})}
  catch(e){WEB.msg='Připojení se nepodařilo spustit.';FBX=null}return FBX}
async function signIn(){const f=fbInit();if(!f)throw{code:'offline'};if(f.auth.currentUser)return f.auth.currentUser.uid;
  const u=await new Promise(res=>{const off=f.auth.onAuthStateChanged(x=>{off();res(x)})});if(u)return u.uid;const c=await f.auth.signInAnonymously();return c.user.uid}
async function claim(code){const uid=await signIn();WEB.uid=uid;await FBX.db.ref('claims/'+uid).set(code);let p=(await FBX.db.ref('pinmap/'+code).once('value')).val();if(!p||!p.role)throw{code:'bad'};
  if(p.role==='coach'){if(!p.coach)throw{code:'coach'};const a=(await FBX.db.ref('skroles/'+p.coach).once('value')).val(),ts=skTeams(a);if(!ts.length)throw{code:'noaccess'};p={...p,teams:ts,cw:!!(a&&a.w)}}
  return p}
const skTeams=a=>a&&a.teams?Object.keys(a.teams).filter(t=>a.teams[t]===true):[];
async function startSession(code,p){WEB.code=code;WEB.role=p.role;WEB.team=p.team||null;WEB.coach=p.coach||null;WEB.teams=p.teams||[];WEB.cw=!!p.cw;
  try{localStorage.setItem(AUTH_KEY,JSON.stringify({code,role:p.role,team:p.team||null,coach:WEB.coach,teams:WEB.teams,cw:WEB.cw}))}catch(e){}
  ROLE='scorer';SYNC.st='connecting';
  if(WEB.role==='scorer'&&WEB.team){if(!TEAMS.list.some(t=>t.id===WEB.team)){TEAMS.list.push({id:WEB.team,name:''})}if(TEAMS.cur!==WEB.team){save();saveR();loadTeam(WEB.team)}}
  if(isCoach()){WEB.teams.forEach(t=>{if(!TEAMS.list.some(x=>x.id===t))TEAMS.list.push({id:t,name:''})});if(!WEB.teams.includes(TEAMS.cur)){save();saveR();loadTeam(WEB.teams[0])}listenRole()}
  listenTeamlist();listenOpp();render();dugSoon()}
/* trenér: změna role nebo týmů od správce se projeví hned */
function listenRole(){if(!FBX||!WEB.coach||FS.skOn)return;FS.skOn=true;const ref=FBX.db.ref('skroles/'+WEB.coach);
  const cb=ref.on('value',s=>{const a=s.val(),ts=skTeams(a);if(!ts.length)return logout('Správce ti odebral přístup do zápisníku.');
    const ch=J(ts)!==J(WEB.teams)||!!(a&&a.w)!==WEB.cw;WEB.teams=ts;WEB.cw=!!(a&&a.w);if(!ch)return;
    try{localStorage.setItem(AUTH_KEY,JSON.stringify({code:WEB.code,role:'coach',team:null,coach:WEB.coach,teams:ts,cw:WEB.cw}))}catch(e){}
    TEAMS.list=TEAMS.list.filter(t=>ts.includes(t.id));ts.forEach(t=>{if(!TEAMS.list.some(x=>x.id===t))TEAMS.list.push({id:t,name:''})});if(!ts.includes(TEAMS.cur))loadTeam(ts[0]);subscribeTeams();render()},()=>{FS.skOn=false});
  FS.subs.push(()=>{ref.off('value',cb);FS.skOn=false})}
(async()=>{await null;
  if(ROLE==='parent'){const tid=new URLSearchParams(location.search).get('tym');WEB.parentTeam=tid;const f=fbInit();if(!f)return render();
    f.db.ref('public/'+tid+'/live').on('value',s=>{const v=s.val();try{LIVE=v&&v.json?JSON.parse(v.json):null}catch(e){LIVE=null}WEB.parentName=v&&v.name||'';render()},()=>{WEB.msg='Odkaz není platný.';render()});
    f.db.ref('public/'+tid+'/info').on('value',s=>{const v=s.val();try{WEB.pinfo=v&&v.json?JSON.parse(v.json):null}catch(e){WEB.pinfo=null}render()},()=>{});return}
  const f=fbInit();if(!f)return render();
  if(ROLE==='login'){try{await signIn();const sd=(await f.db.ref('setupDone').once('value')).val();WEB.setupDone=!!sd}catch(e){WEB.setupDone=true}return render()}
  let a=null;try{a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch(e){}
  if(a&&a.role){WEB.code=a.code;WEB.role=a.role;WEB.team=a.team;startSession(a.code,a)} /* hned pracuj z paměti telefonu */
  try{const p=await claim(a.code);if(p.role!==a.role||(p.team||null)!==(a.team||null)||J(p.teams||[])!==J(a.teams||[])||!!p.cw!==!!a.cw)startSession(a.code,p);else{listenTeamlist();listenOpp();if(FS.tlOn)subscribeTeams()}}
  catch(e){if(e&&e.code==='offline')return;if(String(e&&(e.code||e.message)).toLowerCase().includes('permission')||e.code==='bad'||e.code==='coach'||e.code==='noaccess'){logout(e.code==='noaccess'?'Správce ti zatím nenastavil přístup do zápisníku.':'Kód už neplatí. Přihlas se znovu.')}}
})();

/* ---------- přihlášení ---------- */
function renderLogin(){document.getElementById('tabs').innerHTML='';setSub('přihlášení');
  const setup=WEB.setupDone===false;
  document.getElementById('view').innerHTML=`<div class="card form login">
  ${setup?'':`<div class="tabs lgrole">${[['s','Zapisovatel'],['c','Trenér']].map(([k,l])=>`<button class="${(ui.lgRole||'s')===k?'on':''}" data-act="lgrole" data-v="${k}">${l}</button>`).join('')}</div>`}
  <div class="label">${setup?'První spuštění · nastav kód správce':ui.lgRole==='c'?'Přihlášení trenéra':'Přihlášení zapisovatele'}</div>
  ${setup?`<p class="next" style="margin:0">Databáze je zatím prázdná. Zvol si kód správce (8 až 16 znaků, písmena a číslice). Tímto kódem budeš spravovat týmy a zakládat kódy zapisovatelů. Ulož si ho bezpečně.</p>
  <label for="lg-new">Nový kód správce<input type="text" id="lg-new" autocomplete="off" autocapitalize="characters"></label>
  <label for="lg-new2">Zopakuj kód<input type="text" id="lg-new2" autocomplete="off" autocapitalize="characters"></label>
  <button class="solid" data-act="lgsetup" ${WEB.busy?'disabled':''}>Nastavit a přihlásit</button>`
  :`<p class="next" style="margin:0">${ui.lgRole==='c'?'Zadej svůj osobní kód trenéra (stejný jako do tréninkové aplikace). Uvidíš zápasy svých týmů; zapisovat můžeš, jen pokud ti to správce povolí.':'Zadej kód, který ti dal správce týmu. Zapisovatel uvidí jen svůj tým.'}</p>
  <label for="lg-code">Kód<input type="text" id="lg-code" autocomplete="off" autocapitalize="characters" placeholder="např. K4PX-7QMR"></label>
  <button class="solid" data-act="lgin" ${WEB.busy?'disabled':''}>Přihlásit</button>`}
  ${WEB.msg?`<div class="msg">${esc(WEB.msg)}</div>`:''}
  </div><p class="next" style="margin:0">Jsi rodič? Skóre sleduješ na odkazu, který ti pošle trenér.</p>`}
async function doLogin(){const f=document.getElementById('lg-code'),code=normCode(f&&f.value);if(code.length<9){WEB.msg='Zadej celý kód.';return render()}
  WEB.busy=true;WEB.msg='';render();
  try{const p=await claim(code);WEB.busy=false;WEB.msg='';startSession(code,p)}
  catch(e){WEB.busy=false;WEB.msg=e&&e.code==='offline'?'Bez internetu se nejde přihlásit. Připoj se a zkus to znovu.':e&&e.code==='coach'?'Tohle je společný kód trenérů, platí jen v tréninkové aplikaci. Požádej správce o osobní kód.':e&&e.code==='noaccess'?'Kód je platný, ale správce ti zatím nenastavil přístup do zápisníku (Účet a zálohy → Trenéři).':'Neplatný kód. Zkontroluj ho a zkus to znovu.';render()}}
async function doSetup(){const a=normCode(document.getElementById('lg-new').value),b=normCode(document.getElementById('lg-new2').value);
  const n=a.replace('-','').length;if(n<8||n>16){WEB.msg='Kód musí mít 8 až 16 znaků (písmena a číslice).';return render()}if(a!==b){WEB.msg='Kódy se neshodují.';return render()}
  WEB.busy=true;WEB.msg='';render();
  try{await signIn();await FBX.db.ref().update({['pinmap/'+a]:{role:'admin'},setupDone:true});const p=await claim(a);WEB.busy=false;startSession(a,p);
    ui.tab='admin';ui.tMsg='Jsi přihlášený jako správce. Níže založ týmy a pošli zapisovatelům jejich kódy.';render()}
  catch(e){WEB.busy=false;WEB.msg='Nastavení se nepovedlo. Možná už správce existuje, zkus se přihlásit.';WEB.setupDone=true;render()}}
function logout(msg){try{if(FBX&&WEB.uid)FBX.db.ref('claims/'+WEB.uid).remove()}catch(e){}
  try{localStorage.removeItem(AUTH_KEY)}catch(e){}WEB.role=null;WEB.team=null;WEB.code=null;WEB.coach=null;WEB.teams=[];WEB.cw=false;WEB.msg=msg||'';ROLE='login';SYNC.st='off';
  FS.subs.forEach(off=>{try{off()}catch(e){}});FS.subs=[];FS.seen={};FS.tlOn=false;render();
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
    .then(()=>{netUpd();if(ui.tab==='admin')render()});return FS.chain}
const J=v=>JSON.stringify(v);
async function pushSlot(slot){const db=FBX.db;
  if(slot==='opp')return pushOpp();
  if(slot==='teams'){const o={};TEAMS.list.forEach(t=>{o[t.id]={name:teamName(t)}});return db.ref('teamlist').set(o)}
  const [kind,tid]=slot.split('|');
  if(kind==='games'){await pushGames(tid);return pushInfo(tid)}
  if(kind==='info')return pushInfo(tid);
  if(kind==='reset'){if(!canWrite(tid))return;return db.ref('teams/'+tid+'/reset').set({ts:FS.meta[slot]||Date.now(),dev:DEV})}
  if(!(kind==='state'?canState(tid):canWrite(tid)))return;
  const cur=tid===TEAMS.cur,val=cur&&kind==='state'?S:cur&&kind==='team'?R:store.get(keyFor(BASE[kind],tid),null);if(val==null)return;
  const ts=FS.meta[slot]||Date.now();FS.meta[slot]=ts;metaSave();
  await db.ref('teams/'+tid+'/'+NODE[kind]).set({ts,dev:DEV,json:J(val),...(isCoach()?{by:'coach'}:{})});if(kind==='schedule')await pushInfo(tid)}
async function pushGames(tid){const H=loadHFor(tid),cur={};H.forEach(g=>{cur[g.gameId]=g.savedAt||''});const own=canWrite(tid);
  for(const id in cur){const p=FS.pushed[id];if(p&&p.s===cur[id])continue;const g=H.find(x=>x.gameId===id);if(!own&&!g.mirrorOf)continue;
    await FBX.db.ref('teams/'+tid+'/history/'+id).set({savedAt:cur[id],mirror:g.mirrorOf?true:null,json:J(g)});FS.pushed[id]={s:cur[id],t:tid}}
  if(own)for(const id in FS.pushed){const p=FS.pushed[id];if(p.t===tid&&!(id in cur)){await FBX.db.ref('teams/'+tid+'/history/'+id).remove();delete FS.pushed[id]}}}
function listenTeamlist(){if(!FBX||FS.tlOn)return;FS.tlOn=true;const ref=FBX.db.ref('teamlist');let first=true;
  const cb=ref.on('value',snap=>{const v=snap.val()||{};const remote=Object.keys(v).map(id=>({id,name:v[id]&&v[id].name||''}));
    if(first&&WEB.role==='admin'&&!remote.length){FS.dirty.add('teams');flushSoon()}
    else if(remote.length){const local=TEAMS.list;let list=remote;
      if(first&&WEB.role==='admin'){const have=new Set(remote.map(t=>t.id)),add=local.filter(t=>!have.has(t.id));if(add.length){list=[...remote,...add];FS.dirty.add('teams');flushSoon()}}
      if(WEB.role==='scorer'&&!list.some(t=>t.id===WEB.team))list=[...list,{id:WEB.team,name:''}];
      if(isCoach())list=[...list.filter(t=>WEB.teams.includes(t.id)),...WEB.teams.filter(t=>!list.some(x=>x.id===t)).map(id=>({id,name:''}))];
      TEAMS.list=list;quiet(()=>store.set(TEAMS_KEY,{list,ts:Date.now()}));
      if(!list.some(t=>t.id===TEAMS.cur))loadTeam(WEB.role==='scorer'?WEB.team:list[0].id)}
    first=false;subscribeTeams();render()},()=>{FS.tlOn=false});
  FS.subs.push(()=>ref.off('value',cb))}
function subscribeTeams(){const want=WEB.role==='admin'?TEAMS.list.map(t=>t.id):isCoach()?WEB.teams.slice():[WEB.team];
  want.forEach(tid=>{if(FS.seen[tid]!==undefined)return;FS.seen[tid]=false;const ref=FBX.db.ref('teams/'+tid);
    const cb=ref.on('value',snap=>{applyTeam(tid,snap.val()||{},!FS.seen[tid]);FS.seen[tid]=true},e=>{delete FS.seen[tid];SYNC.st='error';SYNC.err='K týmu nemáš přístup.';render()});
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
      if(cur){if(!initial&&node.dev&&node.dev!==DEV&&node.by!=='coach'&&!isCoach()&&val.pas&&val.pas.length&&!val.final)FS.other={ts:node.ts,gid:val.gameId};if(S.pas.length&&S.gameId!==val.gameId)archiveGame();quiet(()=>{S=val;save()});hist=[];ui.panel=null;ui.endC=false}
      else{const old=store.get(keyFor(KEY,tid),null);if(old&&old.pas&&old.pas.length&&old.gameId!==val.gameId)storeGameLocal(tid,{...old,savedAt:new Date().toISOString()});quiet(()=>store.set(keyFor(KEY,tid),val))}}
    else if(kind==='team'){if(!val||!Array.isArray(val.players))return;let next=val;
      const ren=next.players.filter(p=>p&&p.was);if(ren.length){next={...next,players:next.players.map(p=>{if(!p||!p.was)return p;const q={...p};delete q.was;return q})};ren.forEach(p=>renumAll(tid,p.was,p.num));if(canWrite(tid))FS.dirty.add(slot)}
      if(initial&&lt===0){const local=cur?R:store.get(keyFor(RKEY,tid),null),have=new Set(val.players.map(p=>p.num)),add=(local&&local.players||[]).filter(p=>!have.has(p.num));if(add.length){next={...val,players:[...val.players,...add]};FS.dirty.add(slot)}}
      quiet(()=>{if(cur){R=next;saveR()}else store.set(keyFor(RKEY,tid),next)})}
    else{if(!Array.isArray(val))return;quiet(()=>store.set(keyFor(BASE[kind],tid),val))}
    FS.meta[slot]=FS.dirty.has(slot)?Date.now():node.ts;metaSave();changed=true});
  /* vymazané statistiky na jiném zařízení: zahodit místní zápasy starší než výmaz, ať se nevrátí */
  {const rs=v.reset&&v.reset.ts||0,lr=FS.meta['reset|'+tid]||0;if(rs>lr){const cut=new Date(rs).toISOString(),H0=loadHFor(tid),keep=H0.filter(g=>String(g.savedAt||'')>cut);
    if(keep.length!==H0.length){H0.forEach(g=>{if(!keep.includes(g))delete FS.pushed[g.gameId]});quiet(()=>store.set(keyFor(HKEY,tid),keep));changed=true}FS.meta['reset|'+tid]=rs;metaSave()}}
  /* historie */
  const rh=v.history||{},H=loadHFor(tid);let hc=false;
  Object.keys(rh).forEach(gid=>{const e=rh[gid];FS.pushed[gid]={s:e.savedAt||'',t:tid};const i=H.findIndex(x=>x.gameId===gid);
    if(i>=0&&String(H[i].savedAt||'')>=String(e.savedAt||''))return;let g;try{g=JSON.parse(e.json)}catch(x){return}if(i>=0)H[i]=g;else H.push(g);hc=true});
  if(initial){if(H.some(g=>!rh[g.gameId]))FS.dirty.add('games|'+tid)}
  else{const gone=H.filter(g=>!rh[g.gameId]&&FS.pushed[g.gameId]&&FS.pushed[g.gameId].t===tid);if(gone.length){gone.forEach(g=>delete FS.pushed[g.gameId]);const keep=H.filter(g=>!gone.includes(g));H.length=0;H.push(...keep);hc=true}}
  if(hc){H.sort((a,b)=>String(b.meta&&b.meta.date).localeCompare(String(a.meta&&a.meta.date)));quiet(()=>store.set(keyFor(HKEY,tid),H));changed=true}
  if(initial){if(canWrite(tid)){FS.dirty.add('info|'+tid);setTimeout(()=>autoBackup(tid),8000)}SYNC.st=WEB.online?'ok':'offline';SYNC.last=Date.now();flushSoon()}
  if(changed&&cur&&ROLE==='scorer')render()}
/* číslo přidělené jinde (Tréninkový plánovač pošle hráče s „was“ = staré číslo): přepsat i v zápase a historii, jako assignNumber */
function renumAll(tid,old,neu){if(!old||old===neu)return;const stamp=()=>new Date().toISOString();
  const st=tid===TEAMS.cur?S:store.get(keyFor(KEY,tid),null);
  if(st&&st.teams){const b=J(st);swapNumIn(st,st.ours??1,old,neu);if(J(st)!==b){quiet(()=>{if(tid===TEAMS.cur)save();else store.set(keyFor(KEY,tid),st)});if(canWrite(tid)){FS.meta['state|'+tid]=Date.now();metaSave();FS.dirty.add('state|'+tid)}}}
  const H=loadHFor(tid);let ch=false;H.forEach(g=>{const b=J(g);swapNumIn(g,g.ours??1,old,neu);if(J(g)!==b){g.savedAt=stamp();ch=true}});
  if(ch){quiet(()=>store.set(keyFor(HKEY,tid),H));FS.dirty.add('games|'+tid)}
  TEAMS.list.filter(t=>t.id!==tid).forEach(t=>{const h=loadHFor(t.id);let c2=false;h.forEach(g=>{if(g.vsTid!==tid)return;const b=J(g);swapNumIn(g,1-(g.ours??1),old,neu);if(J(g)!==b){g.savedAt=stamp();c2=true}});
    if(c2){quiet(()=>store.set(keyFor(HKEY,t.id),h));FS.dirty.add('games|'+t.id)}});
  flushSoon()}
function storeGameLocal(tid,g){const H=loadHFor(tid),i=H.findIndex(x=>x.gameId===g.gameId);if(i>=0)H[i]=g;else H.push(g);quiet(()=>store.set(keyFor(HKEY,tid),H))}
function syncDropTeam(tid){if(!FBX||WEB.role!=='admin')return;const db=FBX.db;
  db.ref('teams/'+tid).remove().catch(()=>{});db.ref('public/'+tid).remove().catch(()=>{});
  db.ref('pinmap').once('value').then(s=>{const v=s.val()||{},u={};Object.keys(v).forEach(c=>{if(v[c]&&v[c].team===tid)u[c]=null});if(Object.keys(u).length)return db.ref('pinmap').update(u)}).then(loadPins).catch(()=>{});
  for(const id in FS.pushed)if(FS.pushed[id].t===tid)delete FS.pushed[id];delete FS.seen[tid];FS.dirty.add('teams');flushSoon()}

/* ---------- živé skóre pro rodiče ---------- */
async function publishLive(final){if(!liveOn())return render();if(!WEB.online){S.pubPend=final?'final':(S.pubPend||'live');S.settings.pubOn=true;save();ui.pubMsg='Bez internetu. Skóre se odešle po připojení.';return render()}delete S.pubPend;
  ui.pubBusy=true;render();const L=liveData(final);S.settings.pubOn=true;S.pubLast=L.updated;save();
  try{await FBX.db.ref('public/'+TEAMS.cur+'/live').set({ts:Date.now(),name:R.name||S.teams[ours()].name,json:J(L)});ui.pubMsg=(final?'Konec zápasu odeslán v ':'Skóre odesláno v ')+fmtTime(L.updated)+'.'}
  catch(e){ui.pubMsg='Skóre se nepodařilo odeslat. Zkus to znovu.'}
  ui.pubBusy=false;render()}
function autoPub(){if(!(S.settings.pubOn&&S.settings.autoPub!==false))return;clearTimeout(PUB_T);
  PUB_T=setTimeout(function fire(){if(ui.panel||ui.pubBusy){PUB_T=setTimeout(fire,3000);return}PUB_T=null;publishLive(false)},3000)}
function scoreView(){const on=!!S.settings.pubOn,auto=S.settings.autoPub!==false,url=parentUrl(TEAMS.cur);
  return `<div class="card form"><div class="label">Živé skóre pro rodiče · ${esc(R.name||S.teams[ours()].name)}</div>
  <p class="next" style="margin:0">Rodiče na odkazu svého týmu uvidí tabuli se skóre a pořadí pálkařů. Na tomto odkazu jsou jen čísla dresů, jména dětí ne.</p>
  <label class="radio"><input type="checkbox" id="pub-auto" ${auto?'checked':''}> Odeslat automaticky po každém pálkaři${on?'':' (po prvním odeslání)'}</label>
  <div class="row"><button class="solid" data-act="pubnow" ${ui.pubBusy?'disabled':''}>Odeslat skóre teď</button><button class="ghost" data-act="pubfinal" ${ui.pubBusy?'disabled':''}>Konec zápasu</button></div>
  ${ui.pubMsg?`<div class="next">${esc(ui.pubMsg)}</div>`:S.pubLast?`<div class="next">Naposledy odesláno v ${fmtTime(S.pubLast)}.</div>`:''}
  ${WEB.online?'':'<div class="msg">Teď jsi bez internetu. Zápis běží dál a skóre se odešle po připojení.</div>'}</div>
  <div class="card form"><div class="label">Odkaz pro rodiče</div><div class="linkbox" id="plink">${esc(url)}</div>
  <div class="row"><button class="ghost" data-act="copylink" data-v="${esc(url)}">Kopírovat odkaz</button></div>${ui.linkMsg?`<div class="next">${esc(ui.linkMsg)}</div>`:''}
  <p class="next" style="margin:0">Pošli ho rodičům do skupiny týmu. Odkaz je stálý, platí pro všechny zápasy tohoto týmu.</p></div>
  <div class="card form"><div class="label">Tablet do dugoutu</div><div class="linkbox">${esc(dugoutUrl(TEAMS.cur))}</div>
  <div class="row"><button class="ghost" data-act="copylink" data-v="${esc(dugoutUrl(TEAMS.cur))}">Kopírovat odkaz</button></div>
  <p class="next" style="margin:0">Velké skóre, pořadí pálkařů s křestními jmény a kdo je na řadě, obrana na hřišti. Funguje i na starých tabletech (Android 4.1 s Chrome nebo Firefoxem), bez přihlášení. Odesílá se samo, když je zapisovatel přihlášený online.</p>
  <p class="next" style="margin:0">Pozor: tento odkaz ukazuje křestní jména dětí (bez příjmení). Kdo ho má, uvidí je, proto ho dávej jen na tablet, ne do skupin.</p></div>
  <div class="label">Takhle to uvidí rodiče</div>${board(liveData(false))}${infoHtml(infoData(TEAMS.cur))}`}
function renderParent(){document.getElementById('tabs').innerHTML='';setSub(WEB.parentName?WEB.parentName+' · živé skóre':'živé skóre');
  document.getElementById('view').innerHTML=WEB.msg?`<div class="card msg">${esc(WEB.msg)}</div>`:(LIVE?board(LIVE)+'<p class="next" style="margin:0">Stránka se obnovuje sama, jakmile trenér zapíše další akci.</p>'+liveSheet(LIVE):'<div class="card">Skóre zatím nebylo zveřejněno. Stránka se obnoví sama, až zápas začne.</div>')+infoHtml(WEB.pinfo)}

/* ---------- přístup, správa týmů a kódů ---------- */
function syncCard(){const st=SYNC.st,msg={off:'Nepřipojeno.',connecting:'Připojuji…',saving:'Ukládám…',ok:'Uloženo online'+(SYNC.last?' · '+fmtTime(new Date(SYNC.last).toISOString()):''),offline:'Bez internetu. Zápis se ukládá v telefonu a odešle se po připojení.',error:SYNC.err||'Chyba ukládání.'}[st]||'';
  return `<div class="card form"><div class="label">Ukládání online</div><div class="sync ${st==='offline'?'saving':st}"><span class="sdot"></span>${esc(msg)}</div>
  <p class="next" style="margin:0">${WEB.role==='admin'?'Jako správce vidíš a ukládáš všechny týmy.':'Ukládá se tvůj tým. Na jiném telefonu se stačí přihlásit stejným kódem.'} Zapisuj zápas vždy jen na jednom zařízení.</p>
  ${st==='ok'||st==='error'?'<button class="ghost" data-act="syncnow" style="align-self:flex-start">Uložit teď</button>':''}</div>`}
function accessCard(){const t=TEAMS.list.find(x=>x.id===TEAMS.cur);
  return `<div class="card form"><div class="label">Přístup</div><div><b>${WEB.role==='admin'?'Správce':isCoach()?'Trenér · '+(WEB.cw?'zapisuje':'jen sleduje'):'Zapisovatel týmu '+esc(t?teamName(t):'')}</b> <span class="next">· kód ${esc(WEB.code||'')}</span></div>
  <div class="row"><button class="ghost" data-act="logout">Odhlásit</button></div></div>`}
function teamSwitch(){if(!(WEB.role==='admin'||isCoach())||TEAMS.list.length<2){const n=R.name||teamName(TEAMS.list.find(t=>t.id===TEAMS.cur)||{id:TEAMS.cur});return n?`<span class="tchip" title="Tým">${esc(n)}</span>`:''}
  return `<label class="tsw" for="teamsel"><span class="vh">Tým</span><select id="teamsel" class="sel">${TEAMS.list.map(t=>`<option value="${esc(t.id)}" ${t.id===TEAMS.cur?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>`}
/* ----- trenéři: osobní kódy (společné s tréninkovou aplikací) a role v zápisníku (skroles/<id>) ----- */
const CO={staff:null,roles:null,msg:''};
async function loadCoaches(){if(!FBX||WEB.role!=='admin')return;try{const [a,b]=await Promise.all([FBX.db.ref('training/staff').once('value'),FBX.db.ref('skroles').once('value')]);
    let st=null;try{const v=a.val();st=v&&typeof v.json==='string'?JSON.parse(v.json):null}catch(e){}CO.staff=Array.isArray(st)?st.filter(c=>c&&c.id&&c.name):[];CO.roles=b.val()||{};
    /* trenér s osobním kódem a bez nastavení: jen sleduje, týmy z tréninkové aplikace */
    const P=WEB.pins||{},u={};CO.staff.forEach(c=>{if(CO.roles[c.id]||!Object.values(P).some(x=>x&&x.role==='coach'&&x.coach===c.id))return;const tm={};(c.teams||[]).forEach(t=>{tm[t]=true});if(Object.keys(tm).length){CO.roles[c.id]={w:false,teams:tm};u[c.id]=CO.roles[c.id]}});
    if(Object.keys(u).length)await FBX.db.ref('skroles').update(u)}
  catch(e){CO.staff=CO.staff||[];CO.roles=CO.roles||{};CO.msg='Trenéry se nepodařilo načíst. Zkontroluj, že jsou ve Firebase nová pravidla (README).'}render()}
const coCode=id=>{const P=WEB.pins||{};return Object.keys(P).find(k=>P[k]&&P[k].role==='coach'&&P[k].coach===id)};
function coachesCard(){if(WEB.pins===null){loadPins();WEB.pins=undefined}if(CO.staff===null&&WEB.pins){CO.staff=undefined;loadCoaches()}
  let h=`<div class="card form"><div class="label">Trenéři</div><p class="next" style="margin:0">Trenér se přihlašuje osobním kódem, stejným jako do tréninkové aplikace. „Jen sleduje“ = vidí zápas a smí upravit obranu, pořadí na pálce a střídání. „Zapisuje“ = stejná práva jako zapisovatel. Trenéry přidáváš v tréninkové aplikaci.</p>`;
  if(!CO.staff)return h+'<div class="next">Načítám…</div></div>';
  if(!CO.staff.length)return h+'<div class="next">Zatím tu nejsou žádní trenéři. Přidej je v tréninkové aplikaci (Nastavení → Trenéři).</div></div>';
  h+=CO.staff.map(c=>{const k=coCode(c.id),r=CO.roles[c.id]||{w:false,teams:{}};return `<div class="corow"><div class="row"><b>${esc(c.name)}</b>${k?`<span class="linkbox sm">${esc(k)}</span><button class="mini-btn" data-act="copylink" data-v="${esc(k)}">Kopírovat</button>`:'<span class="next">bez kódu</span>'}<button class="mini-btn" data-act="cocode" data-v="${esc(c.id)}">${k?'Nový kód':'Vytvořit kód'}</button></div>
    <div class="row"><label for="cor-${esc(c.id)}" class="corole">Role <select id="cor-${esc(c.id)}" class="sel"><option value="v" ${r.w?'':'selected'}>Jen sleduje</option><option value="w" ${r.w?'selected':''}>Zapisuje</option></select></label>
    ${TEAMS.list.map(t=>`<label class="radio"><input type="checkbox" id="cot-${esc(c.id)}-${esc(t.id)}" ${r.teams&&r.teams[t.id]?'checked':''}> ${esc(teamName(t))}</label>`).join('')}</div></div>`}).join('');
  return h+(CO.msg?`<div class="next">${esc(CO.msg)}</div>`:'')+'</div>'}
async function coSave(id,r){CO.roles[id]=r;CO.msg='';render();try{await FBX.db.ref('skroles/'+id).set(Object.keys(r.teams||{}).length?r:null);CO.msg='Uloženo.'}catch(e){CO.msg='Uložení se nepovedlo. Zkontroluj, že jsou ve Firebase nová pravidla (README).'}render()}
ACT.cocode=async id=>{if(!FBX||WEB.role!=='admin')return;const c=(CO.staff||[]).find(x=>x.id===id);if(!c)return;const P=WEB.pins||{},u={};Object.keys(P).forEach(k=>{if(P[k]&&P[k].role==='coach'&&P[k].coach===id)u['pinmap/'+k]=null});
  const code=genCode();u['pinmap/'+code]={role:'coach',coach:id};if(!CO.roles[id]){const tm={};(c.teams||[]).forEach(t=>{tm[t]=true});if(Object.keys(tm).length){CO.roles[id]={w:false,teams:tm};u['skroles/'+id]=CO.roles[id]}}
  try{await FBX.db.ref().update(u);Object.keys(u).forEach(k=>{if(k.startsWith('pinmap/')){const x=k.slice(7);if(u[k])P[x]=u[k];else delete P[x]}});WEB.pins=P;CO.msg='Nový kód pro '+c.name+': '+code+(Object.keys(u).length>2?'. Starý kód přestal platit.':'.')}
  catch(e){CO.msg='Kód se nepodařilo vytvořit.'}render()};
async function loadPins(){if(!FBX||WEB.role!=='admin')return;try{WEB.pins=(await FBX.db.ref('pinmap').once('value')).val()||{}}catch(e){WEB.pins={}}if(ui.tab==='admin')render()}
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
  saveR();save();saveTeams();subscribeTeams();newPin(id);ui.tMsg='Tým „'+name+'“ je vytvořený a vybraný. Kód pro jeho zapisovatele najdeš níže, hráče přidáš v menu Soupiska.';ui.tab='admin';render()}
async function copyText(t){try{await navigator.clipboard.writeText(t);ui.linkMsg='Zkopírováno.'}catch(e){ui.linkMsg='Zkopíruj ručně: '+t}render()}
Object.assign(ACT,{lgrole:v=>{ui.lgRole=v;WEB.msg='';render()},lgin:()=>doLogin(),lgsetup:()=>doSetup(),logout:()=>logout(''),pinnew:v=>newPin(v),copylink:v=>copyText(v),
  syncnow:()=>{if(!WEB.role)return;['state','team','schedule','games','info'].forEach(k=>TEAMS.list.forEach(t=>{if(canWrite(t.id))FS.dirty.add(k+'|'+t.id)}));if(WEB.role==='admin')FS.dirty.add('teams');FS.dirty.add('opp');flush();render()}});

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
  else{o={id:'o'+newId(),name,players:nums.map(n=>({num:n,name:''}))};L.push(o);ui.msg[t]='Soupiska „'+name+'“ je uložená. Upravíš ji v menu Soupeři.'}
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
/* ----- hráč bez čísla -> přidělení čísla později (přepíše se v soupisce, rozehraném zápase i historii) ----- */
function assignRow(p){return `<div class="addrow assign"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="rassnum" placeholder="Číslo pro ${esc(dn(p))}" aria-label="Číslo dresu"><button class="solid" data-act="rassgo">Uložit</button><button class="ghost" data-act="rassno">Zrušit</button></div>`}
function swapNumIn(g,side,old,neu){if(!g||!g.teams||!g.teams[side])return;const T=g.teams[side];T.lineup=T.lineup.map(n=>n===old?neu:n);
  (g.pas||[]).forEach(r=>{if(r.t===side&&r.num===old)r.num=neu});(g.subs||[]).forEach(x=>{if(x.t===side){if(x.in===old)x.in=neu;if(x.out===old)x.out=neu}});
  {const D=g[side===(g.ours??1)?'def':'def2'];if(D)Object.values(D).forEach(d=>{if(d&&d[old]!==undefined){d[neu]=d[old];delete d[old]}})}
  if(Array.isArray(g.att))g.att=g.att.map(n=>n===old?neu:n);if(Array.isArray(g.stars))g.stars=g.stars.map(n=>n===old?neu:n)}
function assignNumber(old,raw){const num=jersey(raw),p=R.players.find(x=>x.num===old);if(!p)return;
  if(!num){ui.rmsg='Zadej číslo dresu.';return render()}if(R.players.some(x=>x.num===num)){ui.rmsg='Číslo #'+num+' už má někdo jiný.';return render()}
  snap();p.num=num;saveR();swapNumIn(S,ours(),old,num);save();
  const H=loadH();H.forEach(g=>swapNumIn(g,g.ours??1,old,num));saveH(H);
  TEAMS.list.filter(t=>t.id!==TEAMS.cur).forEach(t=>{const h=loadHFor(t.id);let ch=false;h.forEach(g=>{if(g.vsTid===TEAMS.cur){swapNumIn(g,1-(g.ours??1),old,num);ch=true}});if(ch)store.set(keyFor(HKEY,t.id),h)});
  ui.assign=null;ui.rmsg=dn(p)+' má teď číslo #'+num+'. Změna se propsala i do zápasů.';render()}
Object.assign(ACT,{rassign:v=>{ui.assign=v;ui.rmsg='';render();const f=document.getElementById('rassnum');if(f)f.focus()},rassno:()=>{ui.assign=null;render()},
  rassgo:()=>{const f=document.getElementById('rassnum');assignNumber(ui.assign,f&&f.value)}});
CHG.rnonum=(v,el)=>{ui.rNoNum=el.checked;render();const f=document.getElementById(el.checked?'rname':'rnum');if(f)f.focus()};
/* =========== v7: navigace, příprava zápasu, férová obrana, docházka, info pro rodiče, souhrn sezóny, přesun hráče =========== */
/* ----- nastavení tohoto telefonu (vzhled, obrazovka) ----- */
const PKEY='sk-prefs';
const PREF=(()=>{try{return JSON.parse(localStorage.getItem(PKEY)||'{}')||{}}catch(e){return{}}})();
const prefSet=(k,v)=>{PREF[k]=v;try{localStorage.setItem(PKEY,JSON.stringify(PREF))}catch(e){}};
function applyTheme(){const r=document.documentElement;if(!r||!r.dataset)return;const t=PREF.theme||'';if(t)r.dataset.theme=t;else delete r.dataset.theme}
function appCard(){return `<div class="card form"><div class="label">Aplikace v tomto telefonu</div>
  <label for="pf-theme">Vzhled<select id="pf-theme" class="sel">${[['','podle telefonu'],['light','světlý'],['dark','tmavý'],['sun','na slunce (vysoký kontrast)']].map(([v,l])=>`<option value="${v}" ${(PREF.theme||'')===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label class="radio" for="pf-wake"><input type="checkbox" id="pf-wake" ${PREF.wake!==false?'checked':''}> Během zápasu nenechat obrazovku zhasnout</label>
  <label class="radio" for="pf-buzz"><input type="checkbox" id="pf-buzz" ${PREF.buzz!==false?'checked':''}> Krátce zavibrovat po každém zápisu</label>
  <p class="next" style="margin:0">Tlačítko ☀ nahoře rychle zapne a vypne režim na slunce.${navigator.wakeLock?'':' Tento prohlížeč neumí držet obrazovku rozsvícenou.'}</p></div>`}
let WL=null,WLP=false;
async function wakeSync(){const nav=navigator.wakeLock;if(!nav||WLP)return;
  const want=ROLE==='scorer'&&PREF.wake!==false&&started()&&!S.final&&document.visibilityState!=='hidden';
  if(want&&!WL){WLP=true;try{WL=await nav.request('screen');WL.addEventListener('release',()=>{WL=null})}catch(e){WL=null}WLP=false}
  else if(!want&&WL){const w=WL;WL=null;try{await w.release()}catch(e){}}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wakeSync()});

/* ----- záložky: menu po oddílech ----- */
const TABS={game:'Zápis',sheet:'Tabulka',def:'Lineup a obrana',score:'Rodiče a dugout',games:'Rozpis a výsledky',team:'Soupiska',stats:'Statistiky',opp:'Soupeři',set:'Pravidla zápasu',admin:'Účet a zálohy',prep:'Příprava zápasu',player:'Hráč'};
const MENU=[['Zápas',['game','sheet','def','score']],['Sezóna',['games','team','stats','opp']],['Nastavení',['admin']]];
/* ----- stav připojení v hlavičce a upozornění na zápis z jiného telefonu ----- */
const T0=Date.now();
const netState=()=>typeof FBX==='undefined'||!FBX||!WEB.role?'':!WEB.online&&Date.now()-T0>4000?'off':SYNC.st==='error'?'err':'';
const netBadge=()=>`<span id="netb" class="netb ${netState()}" role="status">${netState()==='off'?'📡 offline':netState()==='err'?'⚠ neuloženo':''}</span>`;
function netUpd(){const el=document.getElementById('netb');if(el)el.outerHTML=netBadge()}
setTimeout(netUpd,4500);
function otherCard(){const o=typeof FS!=='undefined'&&FS.other;if(!o||o.gid!==S.gameId||S.final||Date.now()-o.ts>10*60000||ui.otherOk===o.ts)return'';const m=Math.max(0,Math.round((Date.now()-o.ts)/60000));
  return `<div class="card other"><b>Tento zápas právě zapisuje i jiný telefon</b> <span class="next">(${m?'před '+m+' min':'teď'})</span><p class="next" style="margin:4px 0 0">Zapisujte jen na jednom telefonu, jinak se zápisy navzájem přepíšou. Na tomto telefonu je teď poslední verze z druhého telefonu.</p><button class="ghost" data-act="otherok" style="align-self:flex-start;margin-top:6px">Rozumím</button></div>`}
ACT.otherok=()=>{if(FS.other)ui.otherOk=FS.other.ts;render()};
function navHtml(){const cur=TABS[ui.tab]||TABS.game;
  return netBadge()+teamSwitch()+`<button class="sun-btn ${PREF.theme==='sun'?'on':''}" data-act="sun" aria-label="Režim na slunce" aria-pressed="${PREF.theme==='sun'}" title="Režim na slunce">☀</button><div class="menu"><button class="menu-btn" data-act="menu" aria-haspopup="true" aria-expanded="${ui.menu?'true':'false'}"><span class="burger" aria-hidden="true"></span>${cur}<span class="caret" aria-hidden="true">${ui.menu?'▴':'▾'}</span></button>${ui.menu?`<div class="menu-list" role="menu">${MENU.map(([h,ks])=>`<div class="menu-h">${h}</div>${ks.map(k=>`<button role="menuitem" class="${ui.tab===k?'on':''}" data-act="tab" data-v="${k}">${TABS[k]}</button>`).join('')}`).join('')}</div>`:''}</div>`}
const VIEWS={game:()=>gameView(),sheet:()=>sheetView(),def:()=>defSubNav()+(ui.defSub==='def'?defView():ui.defSub==='set'?teamSetup()+attendCard()+setView():lineupCard()),score:()=>scoreView(),games:()=>scheduleCard()+historyCard(),team:()=>teamView(),
  stats:()=>statsView(),opp:()=>oppCard(),set:()=>{ui.tab='def';ui.defSub='set';return VIEWS.def()},admin:()=>adminView(),prep:()=>prepView()};
if(PREF.tab&&KEEP_TABS.includes(PREF.tab))ui.tab=PREF.tab; /* po otevření pokračovat tam, kde se skončilo */
const adminView=()=>accessCard()+(WEB.role==='admin'?teamsCard()+adminCard()+coachesCard():'')+syncCard()+appCard()+settingsExtra()+teamTransferCard()+onlineBackupCard()+resetCard()+`<p class="next ver">Baseball Scorekeeper · ${verTxt()} · ${esc(gDate({meta:{date:APP_DATE}}))}</p>`;
/* ----- vymazání statistik: historie zápasů + rozehraný zápas (soupisky, rozpis, soupeři a pravidla zůstanou) ----- */
const resetTids=()=>ui.rsAll&&WEB.role==='admin'?TEAMS.list.map(t=>t.id).filter(canWrite):[TEAMS.cur];
function resetCard(){const tids=resetTids(),n=tids.reduce((a,t)=>a+loadHFor(t).length,0),cur=TEAMS.list.find(t=>t.id===TEAMS.cur)||{id:TEAMS.cur};
  return `<div class="card form"><div class="label">Vymazat statistiky</div>
  <p class="next" style="margin:0">Smaže historii odehraných zápasů i rozehraný zápas. Tím se vynulují statistiky hráčů, úspěchy, hvězdy, pozice v obraně a výsledky na odkazu pro rodiče. Soupisky, fotky, rozpis, soupeři a pravidla zůstanou. Vymazání se projeví na všech telefonech a nejde vrátit, proto si nejdřív ulož zálohu.</p>
  ${WEB.role==='admin'&&TEAMS.list.length>1?`<div class="row filt"><button class="ghost ${ui.rsAll?'':'on-btn'}" data-act="rsone">Jen ${esc(teamName(cur))}</button><button class="ghost ${ui.rsAll?'on-btn':''}" data-act="rsall">Všechny týmy</button></div>`:''}
  <div class="row"><button class="ghost" data-act="bkup">💾 Nejdřív zálohovat</button>${ui.rsAsk?`<button class="solid danger-solid" data-act="rsyes">Opravdu smazat (${n} ${gamesWord(n)})</button><button class="ghost" data-act="rsno">Zpět</button>`:`<button class="ghost danger" data-act="rsask">Vymazat statistiky…</button>`}</div>
  ${ui.rsMsg?`<div class="next">${esc(ui.rsMsg)}</div>`:''}</div>`}
function resetStats(){const tids=resetTids(),now=Date.now();let n=0;
  tids.forEach(tid=>{const H=loadHFor(tid);n+=H.length;store.set(keyFor(HKEY,tid),[]);
    const st=tid===TEAMS.cur?S:store.get(keyFor(KEY,tid),null);
    if(st&&st.teams){const nx=fresh();nx.settings=st.settings;nx.teams=st.teams.map(x=>({name:x.name,lineup:x.lineup.slice()}));nx.ours=st.ours;nx.example=false;if(st.vsTid)nx.vsTid=st.vsTid;if(st.oppId)nx.oppId=st.oppId;
      if(tid===TEAMS.cur){S=nx;hist=[];save()}else store.set(keyFor(KEY,tid),nx)}
    if(typeof FS!=='undefined'){FS.meta['reset|'+tid]=now;metaSave();FS.dirty.add('reset|'+tid);FS.dirty.add('games|'+tid);flushSoon()}});
  ui.rsAsk=false;ui.rsMsg='Smazáno: '+n+' '+gamesWord(n)+(tids.length>1?' ve '+tids.length+' týmech':'')+'. Statistiky začínají znovu od nuly.';render()}
Object.assign(ACT,{rsask:()=>{ui.rsAsk=true;ui.rsMsg='';render()},rsno:()=>{ui.rsAsk=false;render()},rsyes:()=>resetStats(),rsall:()=>{ui.rsAll=true;ui.rsAsk=false;render()},rsone:()=>{ui.rsAll=false;ui.rsAsk=false;render()}});

/* ----- chytrý start: další zápas z rozpisu ----- */
const nextSch=()=>loadSch().filter(x=>!x.played).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')))[0]||null;
const schLine=x=>`${esc(gDate({meta:{date:x.date}}))}${x.time?' · '+esc(x.time):''}${x.field?' · '+esc(x.field):''} · ${x.home?'doma':'venku'}${kindTxt(x)?' · '+esc(kindTxt(x)):''}`;
function nextCard(){const x=nextSch();
  return `<div class="card form nextg"><div class="label">${x?'Další zápas':'Nový zápas'}</div>${x?`<b class="ng-opp">${esc(R.name||S.teams[ours()].name)} – ${esc(x.opp)}</b><span class="next">${schLine(x)}</span>`:'<p class="next" style="margin:0">V rozpisu nic není. Připrav zápas rovnou, nebo ho nejdřív přidej do rozpisu v menu Rozpis a výsledky.</p>'}
  <div class="row"><button class="solid" data-act="prep" data-v="${x?esc(x.id):''}">▶ ${x?'Začít zápas':'Připravit zápas'}</button>${x?'':'<button class="ghost" data-act="tab" data-v="games">Rozpis</button>'}</div></div>`}

/* ----- průvodce „Připravit zápas“: soupeř → kdo přišel → pořadí a obrana → začít ----- */
function wizInit(schId){const x=schId?loadSch().find(y=>y.id===schId&&!y.played):null,ps=sortedRoster().map(p=>p.num);
  ui.wiz={set:JSON.parse(JSON.stringify(S.settings)),step:x?1:0,sch:x?x.id:'',x:x?{...x}:{opp:'',oppId:'',vsTid:'',home:true,date:todayISO(),time:'',field:'',type:GTYPES[0],comp:COMPS[0]},att:ps,order:null,att2:null,order2:null,def:true,stats:true,msg:''};
  ui.menu=false;ui.tab='prep';render();window.scrollTo&&window.scrollTo(0,0)}
/* soupeř ve scrimmage: můj druhý tým (nebo uložená soupiska soupeře) */
function wzThem(w){const x=w.x,vs=x.vsTid&&TEAMS.list.some(t=>t.id===x.vsTid&&t.id!==TEAMS.cur)?x.vsTid:null;if(vs)return{name:teamName(TEAMS.list.find(t=>t.id===vs)),players:sortPl(rosterOfTeam(vs).players),vs};
  const o=oppById(x.oppId);return o?{name:o.name,players:sortPl(o.players)}:null}
const wzSteps=w=>['opp','rules','att','order',...(w.x.type==='Scrimmage'&&((wzThem(w)||{}).players||[]).length?['them']:[]),'go'];
const WZ_L={opp:'Soupeř',rules:'Pravidla',att:'Kdo přišel',order:'Pořadí',them:'Sestava soupeře',go:'Začít'};
function wizOrder(){const w=ui.wiz,a=w.att;w.order=(w.order||sortedRoster().map(p=>p.num)).filter(n=>a.includes(n));sortedRoster().forEach(p=>{if(a.includes(p.num)&&!w.order.includes(p.num))w.order.push(p.num)});return w.order}
function wizOrder2(){const w=ui.wiz,T=wzThem(w);if(!T)return[];const all=T.players.map(p=>p.num);if(!w.att2)w.att2=all.slice();
  w.order2=(w.order2||all.slice()).filter(n=>w.att2.includes(n));all.forEach(n=>{if(w.att2.includes(n)&&!w.order2.includes(n))w.order2.push(n)});return w.order2}
const ordList=(O,nameOf,sfx)=>`<ol class="ordl">${O.map((n,i)=>`<li><span class="o">${i+1}.</span><b>${esc(nameOf(n))}</b><span class="rbtns">${i>0?`<button class="pbtn" data-act="wzup${sfx}" data-v="${i}" aria-label="Posunout výš">▲</button>`:''}${i<O.length-1?`<button class="pbtn" data-act="wzdn${sfx}" data-v="${i}" aria-label="Posunout níž">▼</button>`:''}</span></li>`).join('')}</ol>`;
const attList2=(ps,on,pre)=>`<div class="attl">${ps.map(p=>`<label class="radio att" for="${pre}${esc(p.num)}"><input type="checkbox" id="${pre}${esc(p.num)}" ${on.includes(p.num)?'checked':''}> <b>${esc(numTxt(p.num))}</b> ${esc(dn(p))}</label>`).join('')}</div>`;
function prepView(){const w=ui.wiz;if(!w)return nextCard();const x=w.x,ps=sortedRoster(),steps=wzSteps(w);if(w.step>=steps.length)w.step=steps.length-1;const st=steps[w.step],me=R.name||S.teams[ours()].name;
  let h=`<div class="card form wiz"><div class="label">Příprava zápasu · ${w.step+1}/${steps.length} · ${WZ_L[st]}</div><div class="wiz-steps">${steps.map((s,i)=>`<span class="${i<=w.step?'on':''}"></span>`).join('')}</div>`;
  if(st==='opp'){const L=loadOpp().slice().sort((a,b)=>a.name.localeCompare(b.name,'cs')),sch=loadSch().filter(y=>!y.played).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))),others=TEAMS.list.filter(t=>t.id!==TEAMS.cur);
    h+=`${sch.length?`<label for="wz-sch">Z rozpisu<select id="wz-sch" class="sel"><option value="">bez rozpisu</option>${sch.map(y=>`<option value="${esc(y.id)}" ${w.sch===y.id?'selected':''}>${esc(gDate({meta:{date:y.date}}))} · ${esc(y.opp)}</option>`).join('')}</select></label>`:''}
    <div class="cols2">${metaSel('wz-type','Typ zápasu',GTYPES,x.type)}${metaSel('wz-comp','Soutěž',COMPS,x.comp)}
    ${others.length?`<label for="wz-vsTid">${x.type==='Scrimmage'?'Soupeř je můj tým':'…nebo můj tým'}<select id="wz-vsTid" class="sel"><option value="">ne, cizí tým</option>${others.map(t=>`<option value="${esc(t.id)}" ${x.vsTid===t.id?'selected':''}>${esc(teamName(t))}</option>`).join('')}</select></label>`:''}
    <label for="wz-opp">Soupeř<input type="text" id="wz-opp" value="${esc(x.opp)}" placeholder="název týmu" ${x.oppId||x.vsTid?'disabled':''}></label>
    ${L.length?`<label for="wz-oppId">…nebo uložený soupeř<select id="wz-oppId" class="sel"><option value="">–</option>${L.map(o=>`<option value="${esc(o.id)}" ${x.oppId===o.id?'selected':''}>${esc(o.name)} (${o.players.length})</option>`).join('')}</select></label>`:''}
    <label for="wz-home">Hrajeme<select id="wz-home" class="sel"><option value="1" ${x.home?'selected':''}>doma (pálíme druzí)</option><option value="0" ${x.home?'':'selected'}>venku (pálíme první)</option></select></label>
    <label for="wz-date">Datum<input type="date" id="wz-date" value="${esc(x.date||todayISO())}"></label><label for="wz-field">Hřiště<input type="text" id="wz-field" value="${esc(x.field||'')}" placeholder="kde se hraje"></label></div>
    <label class="radio" for="wz-stats"><input type="checkbox" id="wz-stats" ${w.stats?'checked':''}> Započítat zápas do statistik hráčů</label>
    ${x.type==='Scrimmage'?`<p class="next" style="margin:0">Scrimmage: když je soupeř tvůj druhý tým${L.length?' nebo uložený soupeř':''}, nastavíš v dalších krocích sestavu pro oba týmy. Zápas se pak uloží do historie a statistik obou týmů.</p>`:''}`}
  else if(st==='rules'){h+=`<div class="ng-opp">${esc(me)} – ${esc(x.opp||'soupeř')}</div>${rulesHtml(w.set,'wz-r-')}`}
  else if(st==='att'){h+=`<div class="ng-opp">${esc(me)} – ${esc(x.opp||'soupeř')}</div>`;
    h+=ps.length?`<div class="label">${esc(me)} · přítomno ${w.att.length} z ${ps.length}</div>${attList2(ps,w.att,'wa-')}
      <div class="row"><button class="ghost" data-act="wzall">Všichni</button><button class="ghost" data-act="wznone">Nikdo</button></div><p class="next" style="margin:0">V U7 hraje 5–9 dětí, víc jen po dohodě trenérů.</p>`
      :`<p class="msg" style="margin:0">Soupiska je prázdná. Přidej hráče v menu Soupiska, nebo pokračuj a čísla zadáš ručně v menu Lineup a obrana.</p>`}
  else if(st==='order'){const O=wizOrder();h+=`<div class="label">Pálkařské pořadí · ${esc(me)}</div>`;
    h+=O.length?ordList(O,n=>lbl(ours(),n),'')+`<div class="row"><button class="ghost" data-act="wzsort">Podle čísel</button><button class="ghost" data-act="wzrot">První na konec</button><button class="ghost" data-act="wzmix">Zamíchat</button></div>`:'<p class="next" style="margin:0">Bez soupisky. Pořadí zadáš v menu Lineup a obrana.</p>';
    h+=`<label class="radio" for="wz-def"><input type="checkbox" id="wz-def" ${w.def?'checked':''}> Férově rozdělit obranu na všechny směny${wzSteps(w).includes('them')?' (u obou týmů)':''}</label>`}
  else if(st==='them'){const T=wzThem(w),O=wizOrder2(),nameOf=n=>{const p=T.players.find(q=>q.num===n);return numTxt(n)+(p&&p.name?' '+p.name:'')};
    h+=`<div class="label">${esc(T.name)} · přítomno ${w.att2.length} z ${T.players.length}</div>${attList2(T.players,w.att2,'wb-')}
    <div class="row"><button class="ghost" data-act="wzall2">Všichni</button><button class="ghost" data-act="wznone2">Nikdo</button></div>
    ${O.length?`<div class="label">Pálkařské pořadí · ${esc(T.name)}</div>${ordList(O,nameOf,'2')}<div class="row"><button class="ghost" data-act="wzsort2">Podle čísel</button><button class="ghost" data-act="wzrot2">První na konec</button><button class="ghost" data-act="wzmix2">Zamíchat</button></div>`:''}`}
  else{const O=wizOrder(),O2=steps.includes('them')?wizOrder2():[],cur=started()&&!S.final;
    h+=`<div class="fin-score">${esc(x.home?(x.opp||'Soupeř'):me)} – ${esc(x.home?me:(x.opp||'Soupeř'))}</div>
    <span class="next">${schLine(x)}${w.stats?'':' · mimo statistiky'}</span>
    <div class="next">Pravidla: ${esc(pitchTxt(w.set))} · ${w.set.innings} ${w.set.innings<5?'směny':'směn'}${(w.set.runLimit??5)>0?' · max. '+(w.set.runLimit??5)+' '+((w.set.runLimit??5)>=2&&(w.set.runLimit??5)<=4?'body':'bodů')+' na polovinu':''}${w.set.timeLimit?' · '+w.set.timeLimit+' min':''}</div>
    <div class="next">${esc(me)}: ${O.length?O.map(n=>esc(short(n))).join(', '):'pořadí zadáš ručně'}${w.def&&O.length?' · obrana férově na '+w.set.innings+' '+(w.set.innings<5?'směny':'směn'):''}</div>
    ${O2.length?`<div class="next">${esc(x.opp)}: ${O2.map(n=>esc(short(n))).join(', ')}${w.def&&x.vsTid?' · obrana férově':''}</div>`:''}
    ${cur?'<div class="msg">Rozehraný zápas se nejdřív uloží do historie.</div>':''}`}
  if(w.msg)h+=`<div class="msg">${esc(w.msg)}</div>`;
  h+=`<div class="row">${st!=='go'?'<button class="solid" data-act="wznext">Dál</button>':'<button class="solid" data-act="wzgo">▶ Začít zápas</button>'}${w.step>0?'<button class="ghost" data-act="wzback">Zpět</button>':''}<button class="ghost" data-act="wzcancel">Zrušit</button></div></div>`;
  return h}
function wizChg(k,el){const w=ui.wiz;if(!w)return;const x=w.x,v=el.value;if(k.startsWith('r-')){const kk=k.slice(2);if(ruleSet(w.set,kk,kk==='advp'?!!el.checked:v))render();return}const reset=()=>{w.att2=null;w.order2=null};
  if(k==='sch'){const y=loadSch().find(z=>z.id===v);w.sch=y?y.id:'';if(y)w.x={...y};reset();return render()}
  if(k==='oppId'){const o=oppById(v);x.oppId=o?o.id:'';if(o){x.vsTid='';x.opp=o.name;const oc=oppComps(o);if(oc.length===1)x.comp=oc[0]}reset();return render()}
  if(k==='vsTid'){const t=TEAMS.list.find(z=>z.id===v&&z.id!==TEAMS.cur);x.vsTid=t?t.id:'';if(t){x.oppId='';x.opp=teamName(t)}reset();return render()}
  if(k==='type'){x.type=v;if(v==='Scrimmage'&&!x.vsTid&&!x.oppId){const t=TEAMS.list.find(z=>z.id!==TEAMS.cur);if(t){x.vsTid=t.id;x.opp=teamName(t);reset()}}return render()}
  if(k==='home')x.home=v==='1';else if(k==='def')w.def=el.checked;else if(k==='stats')w.stats=el.checked;else if(k in{opp:1,date:1,field:1,comp:1})x[k]=k==='date'?(v||todayISO()):v.trim()}
function wizStart(){const w=ui.wiz;if(!w)return;const x=w.x,O=wizOrder().slice(),O2=wzSteps(w).includes('them')?wizOrder2().slice():[];archiveGame();
  const o=ours(),me={name:R.name||S.teams[o].name,lineup:O.length?O:S.teams[o].lineup.slice()},vs=x.vsTid&&TEAMS.list.some(t=>t.id===x.vsTid&&t.id!==TEAMS.cur)?x.vsTid:null,so=!vs&&oppById(x.oppId),
    them={name:vs?teamName(TEAMS.list.find(t=>t.id===vs)):so?so.name:(x.opp||'Soupeř'),lineup:O2.length?O2:vs?sideLineup(vs):so?oppLineup(so):range(9).map(i=>'?'+i)};
  const keep={...S.settings,...w.set};S=fresh();S.settings=keep;S.teams=x.home?[them,me]:[me,them];S.ours=x.home?1:0;S.meta={date:x.date||todayISO(),field:x.field||'',type:x.type||'',comp:x.comp||''};
  S.example=false;S.prepped=true;S.att=w.att.slice();if(!w.stats)S.noStats=true;if(vs)S.vsTid=vs;else if(so)S.oppId=so.id;if(w.def&&O.length)fairDef(1);if(w.def&&vs&&O2.length)onSide('t',()=>fairDef(1));
  if(w.sch){const l=loadSch(),y=l.find(z=>z.id===w.sch);if(y){y.played=true;y.gameId=S.gameId;saveSch(l);if(y.vsTid)twinPlayed(y)}}
  hist=[];ui.wiz=null;ui.tab='game';ui.defInn=null;commit()}
const wzMove=(O,i,d)=>{[O[i],O[i+d]]=[O[i+d],O[i]];render()},wzMix=O=>{for(let i=O.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[O[i],O[j]]=[O[j],O[i]]}render()};
Object.assign(ACT,{prep:v=>wizInit(v),wzcancel:()=>{ui.wiz=null;ui.tab='game';render()},wzback:()=>{ui.wiz.step--;ui.wiz.msg='';render()},
  wznext:()=>{const w=ui.wiz,st=wzSteps(w)[w.step];if(st==='opp'&&!(w.x.opp||'').trim()){w.msg='Doplň soupeře.';return render()}
    if(st==='att'&&sortedRoster().length&&!w.att.length){w.msg='Zaškrtni aspoň jednoho hráče.';return render()}
    if(st==='them'&&!wizOrder2().length){w.msg='Zaškrtni aspoň jednoho hráče soupeře.';return render()}w.msg='';w.step++;render();window.scrollTo&&window.scrollTo(0,0)},
  wzgo:()=>wizStart(),wzall:()=>{ui.wiz.att=sortedRoster().map(p=>p.num);render()},wznone:()=>{ui.wiz.att=[];render()},
  wzup:v=>wzMove(wizOrder(),+v,-1),wzdn:v=>wzMove(wizOrder(),+v,1),wzsort:()=>{ui.wiz.order=null;render()},
  wzrot:()=>{const O=wizOrder();if(O.length>1)O.push(O.shift());render()},wzmix:()=>wzMix(wizOrder()),
  wzall2:()=>{const T=wzThem(ui.wiz);ui.wiz.att2=T?T.players.map(p=>p.num):[];render()},wznone2:()=>{ui.wiz.att2=[];ui.wiz.order2=[];render()},
  wzup2:v=>wzMove(wizOrder2(),+v,-1),wzdn2:v=>wzMove(wizOrder2(),+v,1),wzsort2:()=>{ui.wiz.order2=null;render()},
  wzrot2:()=>{const O=wizOrder2();if(O.length>1)O.push(O.shift());render()},wzmix2:()=>wzMix(wizOrder2()),
  schstart:v=>wizInit(v),
  sun:()=>{if(PREF.theme==='sun')prefSet('theme',PREF.prevTheme||'');else{prefSet('prevTheme',PREF.theme||'');prefSet('theme','sun')}render()}});
CHG['pf-theme']=v=>{prefSet('theme',v);render()};CHG['pf-wake']=(v,el)=>{prefSet('wake',el.checked);wakeSync()};CHG['pf-buzz']=(v,el)=>{prefSet('buzz',el.checked);if(el.checked)buzz(35)};

/* ----- férová obrana: každý se vystřídá ve vnitřním i vnějším poli, bez opakování pozice ----- */
const FAIR_POS=['1','3','6','4','5','2','8','7','9'];
const isInf=p=>+p>=1&&+p<=6;
function seasonPos(skipId,G){const c={};(G||gamesChrono()).forEach(g=>{if(g.gameId===skipId||!g.def)return;Object.values(g.def).forEach(d=>Object.entries(d||{}).forEach(([n,p])=>{if(p){(c[n]=c[n]||{})[p]=(c[n][p]||0)+1}}))});return c}
function fairDef(from){const L=defL(),n=innCount(),K=DEFK();if(!L.length)return;const sea=seasonPos(S.gameId,K==='def2'?loadHFor(S.vsTid):null),FP=noCatch()?FAIR_POS.filter(p=>p!=='2'):FAIR_POS,slots=FP.slice(0,Math.min(L.length,FP.length)).concat(Array(Math.max(0,L.length-FP.length)).fill('10'));
  for(let i=from;i<=n;i++){const gm={},grp={};for(let k=1;k<i;k++){const d=(S[K]||{})[k]||{};Object.entries(d).forEach(([m,p])=>{if(!p||p==='B')return;(gm[m]=gm[m]||{})[p]=(gm[m][p]||0)+1;const g=grp[m]=grp[m]||{i:0,o:0};isInf(p)?g.i++:g.o++})}
    const prev=(S[K]||{})[i-1]||{};
    const cost=(m,p)=>{const g=grp[m]||{i:0,o:0},s=sea[m]||{};let c=((gm[m]||{})[p]||0)*12+(s[p]||0)+(prev[m]===p?40:0);
      const sIn=Object.keys(s).filter(isInf).reduce((a,q)=>a+s[q],0),sOut=Object.keys(s).filter(q=>!isInf(q)&&q!=='B').reduce((a,q)=>a+s[q],0);
      c+=isInf(p)?6*Math.max(0,g.i-g.o)+.5*Math.max(0,sIn-sOut):6*Math.max(0,g.o-g.i)+.5*Math.max(0,sOut-sIn);return c+Math.random()*.01};
    let best=null,bc=Infinity;
    for(let t=0;t<80;t++){const order=slots.slice();for(let a=order.length-1;a>0;a--){const b=Math.floor(Math.random()*(a+1));[order[a],order[b]]=[order[b],order[a]]}
      const free=new Set(L),as={};let tot=0;order.forEach(p=>{let bm=null,bv=Infinity;free.forEach(m=>{const v=cost(m,p);if(v<bv){bv=v;bm=m}});free.delete(bm);as[bm]=p;tot+=bv});
      if(tot<bc){bc=tot;best=as}}
    defOf(i);S[K][i]=best}}
function posSeasonCard(){const o=ours(),c={},inn={};gamesChrono().forEach(g=>{if(!g.def)return;Object.values(g.def).forEach(d=>Object.entries(d||{}).forEach(([n,p])=>{if(!p)return;(c[n]=c[n]||{})[p]=(c[n][p]||0)+1;inn[n]=(inn[n]||0)+1}))});
  const ns=Object.keys(c).filter(n=>!anon(n)).sort((a,b)=>byNum({num:a,name:rname(a)},{num:b,name:rname(b)}));if(!ns.length)return'';const P=['1','2','3','4','5','6','7','8','9','10','B'];
  return `<div class="card"><div class="label">Pozice v obraně · celá sezóna (směny)</div><div class="ls-wrap"><table class="pt pos"><thead><tr><th>Hráč</th><th>Směn</th>${P.map(p=>`<th title="${esc(posTxt(p))}">${posShort(p)}</th>`).join('')}<th>Vnitř.</th><th>Vnější</th></tr></thead><tbody>
  ${ns.map(n=>{const x=c[n],i=Object.keys(x).filter(isInf).reduce((a,q)=>a+x[q],0),out=Object.keys(x).filter(q=>!isInf(q)&&q!=='B').reduce((a,q)=>a+x[q],0);
    return `<tr><td class="nm">${plLink(n,lbl(o,n))}</td><td>${inn[n]}</td>${P.map(p=>`<td>${x[p]||''}</td>`).join('')}<td>${i}</td><td class="${inn[n]>=4&&(!i||!out)?'low':''}">${out}</td></tr>`}).join('')}</tbody></table></div>
  <p class="next" style="margin:6px 0 0">1 nadhazovač, 2 catcher, 3–6 metaři (1B, 2B, 3B) a spojka (SS), 7–9 zadáci, Z+ další zadák, L lavička. Červeně: hráč zatím hrál jen vnitřní, nebo jen vnější pole.</p></div>`}
Object.assign(ACT,{deffair:()=>{snap();fairDef(ui.defInn||1);commit()}});


/* ----- přesun hráče mezi mými týmy (správce) ----- */
function moveRow(p){const others=TEAMS.list.filter(t=>t.id!==TEAMS.cur);
  return `<div class="addrow assign"><select id="rmv-t" class="sel" aria-label="Cílový tým">${others.map(t=>`<option value="${esc(t.id)}">${esc(teamName(t))}</option>`).join('')}</select><button class="solid" data-act="rmvgo">Přesunout</button><button class="ghost" data-act="rmvcopy" title="Hráč zůstane i tady">Přidat i tam</button><button class="ghost" data-act="rmvno">Zrušit</button></div>`}
function movePlayer(copy){const num=ui.rmove,p=R.players.find(x=>x.num===num),sel=document.getElementById('rmv-t'),t=TEAMS.list.find(x=>x.id===(sel&&sel.value)&&x.id!==TEAMS.cur);if(!p||!t)return;
  const k=keyFor(RKEY,t.id),T=store.get(k,null)||{name:t.name||'',players:[]};if(!Array.isArray(T.players))T.players=[];
  const clash=noNum(num)?T.players.find(x=>noNum(x.num)&&(x.name||'').toLowerCase()===(p.name||'').toLowerCase()):T.players.find(x=>x.num===num);
  if(clash){ui.rmsg=noNum(num)?p.name+' už v týmu '+teamName(t)+' je.':'V týmu '+teamName(t)+' už má #'+num+' '+(clash.name||'jiný hráč')+'. Nejdřív jednomu z nich změň číslo.';return render()}
  T.players.push({...p});store.set(k,T);
  if(!copy){R.players=R.players.filter(x=>x.num!==num);saveR();const o=ours(),L=S.teams[o].lineup,i=L.indexOf(num);
    if(i>=0&&L.length>1&&!S.pas.some(r=>r.t===o&&r.num===num)){L.splice(i,1);if(S.bat[o]>i)S.bat[o]--;S.bat[o]%=L.length;save()}}
  ui.rmove=null;ui.rmsg=(dn(p)||numTxt(num))+(copy?' je teď i v týmu ':' přesunut do týmu ')+teamName(t)+'.'+(copy?'':' Odehrané zápasy a statistiky zůstávají tady.');render()}
Object.assign(ACT,{rmove:v=>{ui.rmove=v;ui.assign=null;ui.rmsg='';render()},rmvno:()=>{ui.rmove=null;render()},rmvgo:()=>movePlayer(false),rmvcopy:()=>movePlayer(true)});

/* ----- rozpis a výsledky pro rodiče (public/<tid>/info, bez jmen dětí) ----- */
function infoData(tid){const sch=tid===TEAMS.cur?loadSch():(store.get(keyFor(SKEY,tid),[])||[]),H=loadHFor(tid),today=todayISO();
  return{v:1,next:sch.filter(x=>!x.played&&String(x.date)>=today).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,3).map(x=>({d:x.date,t:x.time||'',f:x.field||'',o:x.opp,h:!!x.home,k:kindTxt(x)})),
    res:H.filter(g=>g.final).slice(0,40).map(g=>{const o=g.ours??1;return{d:g.meta&&g.meta.date||'',o:g.teams[1-o].name,us:gTot(g,o),them:gTot(g,1-o),h:o===1,k:kindTxt(g.meta)}})}}
async function pushInfo(tid){if(!canWrite(tid))return;const j=J(infoData(tid));FS.info=FS.info||{};if(FS.info[tid]===j)return;await FBX.db.ref('public/'+tid+'/info').set({ts:Date.now(),json:j});FS.info[tid]=j}
function infoHtml(I){if(!I)return'';let h='';const dd=d=>esc(gDate({meta:{date:d}}));
  if(I.next&&I.next.length)h+=`<div class="card"><div class="label">Další zápasy</div><div class="hist">${I.next.map(x=>`<div class="hrow"><span class="res rR">${x.h?'D':'H'}</span><div class="hmain"><b>${esc(x.o)}</b><span class="next">${dd(x.d)}${x.t?' · '+esc(x.t):''}${x.f?' · '+esc(x.f):''} · ${x.h?'doma':'venku'}</span></div></div>`).join('')}</div></div>`;
  if(I.res&&I.res.length){const w=I.res.filter(r=>r.us>r.them).length,l=I.res.filter(r=>r.us<r.them).length;
    h+=`<div class="card"><div class="label">Výsledky sezóny · ${w} V · ${I.res.length-w-l} R · ${l} P</div><div class="hist">${I.res.map(r=>{const k=r.us>r.them?'V':r.us<r.them?'P':'R';return `<div class="hrow"><span class="res r${k}">${k}</span><div class="hmain"><b>${r.us} : ${r.them} · ${esc(r.o)}</b><span class="next">${dd(r.d)}${r.k?' · '+esc(r.k):''}</span></div></div>`}).join('')}</div></div>`}
  return h}

/* ----- statistiky a souhrn sezóny v PDF ----- */
const statsView=()=>seasonView()+awardsCard()+posSeasonCard()+`<div class="card row" style="align-items:center"><button class="solid" data-act="spdf" ${ui.spdfBusy?'disabled':''}>📄 Souhrn sezóny jako PDF</button>${ui.spdfMsg?`<span class="next">${esc(ui.spdfMsg)}</span>`:'<span class="next">Výsledky, statistiky, úspěchy a obrana. Řídí se filtrem nahoře.</span>'}</div>`;
/* ----- PDF: společné kreslení stránek A4 (souhrn sezóny, karta hráče) ----- */
function pdfKit(){const W=1654,H=2339,M=100,C={INK:'#1c2836',MUT:'#5d6b66',LINE:'#cdd8cb',SOFT:'#eef4ee',GREEN:'#2c6a43'},D='"Barlow Condensed","Arial Narrow",sans-serif',B='"Atkinson Hyperlegible",Arial,sans-serif';
  const k={W,H,M,C,D,B,pages:[],y:M,g:null};
  k.page=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;k.g=c.getContext('2d');k.g.fillStyle='#fff';k.g.fillRect(0,0,W,H);k.g.textBaseline='middle';k.y=M;k.pages.push(c)};
  k.txt=(s,font,col,x,yy,w,al)=>{const g=k.g;g.font=font;g.fillStyle=col;g.textAlign=al||'left';g.fillText(String(s),x,yy,w)};
  k.head=s=>{if(k.y+170>H-M)k.page();k.y+=30;k.txt(s,`700 46px ${D}`,C.GREEN,M,k.y+20);k.y+=60};
  k.table=(cols,rows)=>{const tw=W-2*M,sum=cols.reduce((a,c)=>a+c[1],0),xs=[];let x=M;cols.forEach(c=>{xs.push(x);x+=c[1]/sum*tw});const rh=46,cw=i=>cols[i][1]/sum*tw;
    const cell=(v,i,font,col)=>k.txt(v,font,col,i?xs[i]+cw(i)/2:xs[i]+10,k.y+rh/2,cw(i)-12,i?'center':'left');
    const hdr=()=>{k.g.fillStyle=C.SOFT;k.g.fillRect(M,k.y,tw,rh);cols.forEach((c,i)=>cell(c[0],i,`700 24px ${B}`,C.MUT));k.y+=rh};
    hdr();rows.forEach(r=>{if(k.y+rh>H-M){k.page();hdr()}r.forEach((v,i)=>cell(v,i,`${i?400:700} 25px ${B}`,C.INK));
      k.g.strokeStyle=C.LINE;k.g.lineWidth=2;k.g.beginPath();k.g.moveTo(M,k.y+rh);k.g.lineTo(M+tw,k.y+rh);k.g.stroke();k.y+=rh})};
  k.lines=L=>L.forEach(s=>{if(k.y+40>H-M)k.page();k.txt(s,`400 26px ${B}`,C.INK,M+10,k.y+18,W-2*M-20);k.y+=40});
  k.page();return k}
async function pdfSave(pagesFn,name,msgKey,busyKey,land){ui[busyKey]=true;ui[msgKey]='Připravuji PDF…';render();
  try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;if(!window.jspdf)throw{code:'nolib'};if(!DL)throw{code:'nodl'};
    const doc=new window.jspdf.jsPDF({orientation:land?'landscape':'portrait',unit:'mm',format:'a4'});const P=pagesFn();if(!P.length)throw{code:'empty'};P.forEach((c,i)=>{if(i)doc.addPage();doc.addImage(c.toDataURL('image/jpeg',0.9),'JPEG',0,0,land?297:210,land?210:297)});
    await DL.save({filename:(name+'-'+todayISO()).replace(/[^\p{L}\p{N}-]+/gu,'-')+'.pdf',data:doc.output('blob')});ui[msgKey]='PDF uloženo.'}
  catch(e){ui[msgKey]=e&&e.code==='nolib'?'Knihovnu pro PDF se nepodařilo načíst. Zkontroluj připojení.':e&&e.code==='declined'?'Ukládání zrušeno.':e&&e.code==='nodl'?'Ukládání souborů tady není dostupné.':e&&e.code==='empty'?'Zatím není co uložit.':'PDF se nepodařilo vytvořit.'}
  ui[busyKey]=false;render()}
const gamesWord=n=>n===1?'zápas':n>=2&&n<=4?'zápasy':'zápasů';
function seasonPages(){const k=pdfKit(),{M,C,D,B}=k;
  const {games,rows}=seasonData(),o=ours(),team=allTeams()?'Všechny týmy':(R.name||S.teams[o].name),fl=[fTypeTxt(),ui.fComp].filter(Boolean).join(' · ');
  const G=games.slice().sort((a,b)=>String(a.meta&&a.meta.date).localeCompare(String(b.meta&&b.meta.date))),res=G.map(x=>{const go=x.ours??1,a=gTot(x,go),b=gTot(x,1-go);return{x,go,a,b,k:a>b?'V':a<b?'P':'R'}});
  k.txt(team,`700 76px ${D}`,C.INK,M,k.y+40);k.y+=100;k.txt('Souhrn sezóny'+(fl?' · '+fl:'')+' · vytvořeno '+new Date().toLocaleDateString('cs-CZ'),`400 30px ${B}`,C.MUT,M,k.y);k.y+=50;
  const w=res.filter(r=>r.k==='V').length,l=res.filter(r=>r.k==='P').length;
  k.txt(`${G.length} ${gamesWord(G.length)} · ${w} výher · ${G.length-w-l} remíz · ${l} proher · body ${res.reduce((s,r)=>s+r.a,0)} : ${res.reduce((s,r)=>s+r.b,0)}`,`700 32px ${B}`,C.INK,M,k.y);k.y+=30;
  if(res.length){k.head('Zápasy');k.table([['Datum',2],['Soupeř',4],['',1],['Skóre',1.6],['',1],['Typ',3]],res.map(r=>[gDate(r.x)||'–',r.x.teams[1-r.go].name,r.go?'doma':'venku',r.a+' : '+r.b,r.k,kindTxt(r.x.meta)||'–']))}
  if(rows.length){k.head('Statistiky hráčů');k.table([['Hráč',4],['Záp.',1],['Pálil',1],['Odpaly',1.2],['Dlouhé',1.2],['Na metě',1.3],['Body',1],['K',.8],['Úspěš.',1.3]],rows.map(r=>[r.label,r.g,r.pa,r.h,r.xb,r.ob,r.r,r.k,r.pa?avg(r.ob,r.pa):'–']))}
  const ach=achievements().filter(a=>G.some(x=>x.gameId===a.gameId));if(ach.length){k.head('Úspěchy · poprvé v sezóně');const by={};ach.forEach(a=>(by[a.num]=by[a.num]||[]).push(a.label+(a.date?' ('+gDate({meta:{date:a.date}})+')':'')));k.lines(Object.keys(by).map(n=>lbl(o,n)+': '+by[n].join(', ')))}
  const st={};G.forEach(x=>(x.stars||[]).forEach(n=>{st[n]=(st[n]||0)+1}));if(Object.keys(st).length){k.head('Hvězdy zápasů');k.lines([Object.keys(st).sort((a,b)=>st[b]-st[a]).map(n=>lbl(o,n)+' '+'★'.repeat(st[n])).join(' · ')])}
  if(!allTeams()){const c={};G.forEach(x=>{if(x.def)Object.values(x.def).forEach(d=>Object.entries(d||{}).forEach(([n,p])=>{if(p){(c[n]=c[n]||{})[p]=(c[n][p]||0)+1}}))});const ns=Object.keys(c).filter(n=>!anon(n));
    if(ns.length){const P=['1','2','3','4','5','6','7','8','9','10','B'];k.head('Pozice v obraně (směny)');k.table([['Hráč',4],...P.map(p=>[posShort(p),.7])],ns.sort((a,b)=>byNum({num:a,name:rname(a)},{num:b,name:rname(b)})).map(n=>[lbl(o,n),...P.map(p=>c[n][p]||'')]))}}
  return k.pages}
ACT.spdf=()=>pdfSave(seasonPages,'sezona-'+(allTeams()?'vsechny-tymy':(R.name||S.teams[ours()].name)),'spdfMsg','spdfBusy');

/* =========== osobní stránka hráče =========== */
const BATS={P:'zprava',L:'zleva',O:'switch hitter'},THROWS={P:'pravou',L:'levou'};
const handTxt=p=>[p.bats?(p.bats==='O'?'switch hitter':'pálí '+BATS[p.bats]):'',p.throws?'hází '+THROWS[p.throws]:''].filter(Boolean).join(' · ');
const plFind=num=>R.players.find(p=>p.num===num)||null;
const plLink=(num,txt)=>plFind(num)?`<button class="plink" data-act="pl" data-v="${esc(num)}">${esc(txt)}</button>`:esc(txt);
const sameName=(a,b)=>!!a&&!!b&&a.trim().toLowerCase()===b.trim().toLowerCase();
/* zápasy hráče: tento tým, nebo všechny moje týmy (v jiném týmu ho poznáme podle jména) */
function plGames(p){const out=[];(allTeams()?TEAMS.list.map(t=>t.id):[TEAMS.cur]).forEach(tid=>{const cur=tid===TEAMS.cur,ps=rosterOfTeam(tid).players||[];
    const q=cur?p:ps.find(x=>x.num===p.num&&sameName(x.name,p.name))||ps.find(x=>sameName(x.name,p.name));if(!q)return;
    const H=cur?loadH():loadHFor(tid),st=cur?S:store.get(keyFor(KEY,tid),null),gs=H.slice();if(st&&st.pas&&st.pas.length&&!H.some(g=>g.gameId===st.gameId))gs.push(st);
    gs.forEach(g=>{if(!inFilter(g))return;const o=g.ours??1,n=q.num,pas=(g.pas||[]).filter(r=>r.t===o&&r.num===n),def={};
      if(g.def)Object.values(g.def).forEach(d=>{const x=d&&d[n];if(x)def[x]=(def[x]||0)+1});
      if(pas.length||Object.keys(def).length)out.push({g,tid,cur,n,o,pas,def,star:(g.stars||[]).includes(n),live:g===S})})});
  return out.sort((a,b)=>(String(a.g.meta&&a.g.meta.date)+a.g.gameId).localeCompare(String(b.g.meta&&b.g.meta.date)+b.g.gameId))}
function plSum(G){const s={g:G.length,pa:0,h:0,xb:0,ob:0,r:0,k:0,stars:0,def:{}};G.forEach(x=>{if(x.star)s.stars++;Object.entries(x.def).forEach(([p,c])=>{s.def[p]=(s.def[p]||0)+c});
  x.pas.forEach(r=>{s.pa++;if(isHit(r.code))s.h++;if(HITS.slice(1).includes(r.code))s.xb++;if(isHit(r.code)||r.code==='FC'||isErr(r.code))s.ob++;if(r.scored)s.r++;if(r.code==='K')s.k++})});return s}
const onBase=r=>isHit(r.code)||r.code==='FC'||isErr(r.code);
function plChart(G){const pts=G.filter(x=>x.pas.length).map(x=>({v:x.pas.filter(onBase).length/x.pas.length,d:gDate(x.g)}));if(pts.length<2)return'';
  const W=320,H=130,L=44,Rr=10,T=10,Bm=26,xw=(W-L-Rr)/(pts.length-1),X=i=>L+i*xw,Y=v=>T+(1-v)*(H-T-Bm);
  return `<figure class="plc"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Úspěšnost na pálce v jednotlivých zápasech">${[0,.5,1].map(v=>`<line class="plc-grid" x1="${L}" x2="${W-Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="plc-t" x="${L-6}" y="${Y(v)+4}" text-anchor="end">${v.toFixed(3).replace(/^0/,'')}</text>`).join('')}
    <polyline class="plc-line" points="${pts.map((p,i)=>X(i)+','+Y(p.v)).join(' ')}"/>${pts.map((p,i)=>`<circle class="plc-dot" cx="${X(i)}" cy="${Y(p.v)}" r="${i===pts.length-1?5:3.5}"><title>${esc(p.d)}: ${p.v.toFixed(3)}</title></circle>`).join('')}
    <text class="plc-t" x="${L}" y="${H-6}">${esc(pts[0].d)}</text><text class="plc-t" x="${W-Rr}" y="${H-6}" text-anchor="end">${esc(pts[pts.length-1].d)}</text></svg>
    <figcaption class="next">Úspěšnost zápas po zápase: jak často se po svém odpalu dostal na metu.</figcaption></figure>`}
const DIA_POS={1:[120,138,1],2:[120,206,1],3:[172,120,1],4:[150,88,0],5:[68,120,1],6:[90,88,0],7:[40,58,0],8:[120,44,0],9:[200,58,0]},DIA_L={1:'nadhazovač',2:'catcher',3:'1B',4:'2B',5:'3B',6:'SS',7:'levý',8:'střední',9:'pravý'};
function plDiamond(def){const max=Math.max(1,...Object.values(def));
  return `<svg viewBox="0 0 240 240" class="pld" role="img" aria-label="Odehrané směny na pozicích"><polygon class="pld-in" points="120,190 172,138 120,86 68,138"/>
  ${Object.entries(DIA_POS).map(([p,[x,y,below]])=>{const c=def[p]||0,a=c?.3+.7*c/max:0;return `<g><title>${esc(POS[p])}: ${c} ${c===1?'směna':c>=2&&c<=4?'směny':'směn'}</title><circle cx="${x}" cy="${y}" r="14" class="pld-c ${c?'on':''}" style="fill-opacity:${c?a.toFixed(2):1}"/><text x="${x}" y="${y+5}" text-anchor="middle" class="pld-n ${a>.6?'inv':''}">${c||''}</text><text x="${x}" y="${below?y+27:y-19}" text-anchor="middle" class="pld-l">${DIA_L[p]}</text></g>`}).join('')}</svg>`}
function playerView(){const p=plFind(ui.player);if(!p){ui.tab=ui.plBack||'team';return VIEWS[ui.tab]()}
  const ps=sortedRoster(),i=ps.findIndex(x=>x.num===p.num),prev=ps[(i-1+ps.length)%ps.length],next=ps[(i+1)%ps.length],G=plGames(p),s=plSum(G),o=ours();
  const inf=Object.keys(s.def).filter(isInf).reduce((a,q)=>a+s.def[q],0),out=Object.keys(s.def).filter(q=>!isInf(q)&&q!=='B').reduce((a,q)=>a+s.def[q],0);
  const ach=achievements().filter(a=>a.num===p.num),team=R.name||S.teams[o].name;
  let h=`<div class="plnav"><button class="ghost" data-act="plback">‹ Zpět</button>${ps.length>1?`<span class="plnav-r"><button class="ghost" data-act="pl" data-v="${esc(prev.num)}" aria-label="Předchozí hráč">‹</button><button class="ghost" data-act="pl" data-v="${esc(next.num)}" aria-label="Další hráč">›</button></span>`:''}</div>
  <div class="card plhead">${p.photo?`<div class="plphoto"><img src="${esc(p.photo)}" alt="${esc(dn(p)||'Hráč')}"><span class="plbadge">${noNum(p.num)?'–':esc(p.num)}</span></div>`:`<div class="plnum ${noNum(p.num)?'none':''}">${noNum(p.num)?'–':esc(p.num)}</div>`}<div class="plwho"><h2>${esc(dn(p)||'Hráč')}</h2>${p.nick&&String(p.nick).trim()?`<span class="next">${esc(p.name)}</span>`:''}<span class="next">${esc(team)}${p.since?' · hraje od '+esc(p.since):''}${handTxt(p)?' · '+handTxt(p):''}${p.pos?' · '+esc(POS[p.pos]||''):''}</span></div></div>`;
  h+=`<div class="card form"><div class="label">Údaje o hráči</div>
   <div class="cols2"><label for="pl-name">Jméno<input type="text" id="pl-name" value="${esc(p.name||'')}"></label>
     <label for="pl-nick">Přezdívka<input type="text" id="pl-nick" maxlength="20" value="${esc(p.nick||'')}" placeholder="nepovinné"></label>
   <label for="pl-bats">Pálí<select id="pl-bats" class="sel"><option value="">–</option>${Object.entries(BATS).map(([k,v])=>`<option value="${k}" ${p.bats===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label for="pl-throws">Hází<select id="pl-throws" class="sel"><option value="">–</option>${Object.entries(THROWS).map(([k,v])=>`<option value="${k}" ${p.throws===k?'selected':''}>${v}</option>`).join('')}</select></label>
   <label for="pl-pos">Oblíbená pozice<select id="pl-pos" class="sel"><option value="">–</option>${range(9).map(n=>`<option value="${n}" ${String(p.pos)===String(n)?'selected':''}>${n} · ${POS[n]}</option>`).join('')}</select></label>
   <label for="pl-since">Hraje od (sezóna)<input type="text" id="pl-since" inputmode="numeric" maxlength="9" placeholder="např. 2025" value="${esc(p.since||'')}"></label></div>
   ${ui.plNum?`<div class="addrow"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" id="pl-num" placeholder="Nové číslo dresu" aria-label="Nové číslo dresu"><button class="solid" data-act="plnum">Uložit číslo</button><button class="ghost" data-act="plnumno">Zrušit</button></div>`
     :`<button class="ghost" data-act="plnumopen" style="align-self:flex-start">${noNum(p.num)?'Přidělit číslo dresu':'Změnit číslo dresu'}</button>`}
   <div class="row plph"><label class="ghost filebtn" for="pl-photo">${p.photo?'Změnit fotku':'📷 Přidat fotku'}<input type="file" id="pl-photo" accept="image/*" class="vh"></label>${p.photo?(ui.phDel?`<button class="mini-btn out" data-act="phdelyes">Opravdu odebrat</button><button class="mini-btn" data-act="phdelno">Ne</button>`:`<button class="ghost danger" data-act="phdel">Odebrat fotku</button>`):''}</div>
   ${ui.phMsg?`<div class="next">${esc(ui.phMsg)}</div>`:''}
   ${ui.rmsg&&ui.plMsgOn?`<div class="next">${esc(ui.rmsg)}</div>`:''}
   <p class="next" style="margin:0">Fotka se zmenší a uloží se soupiskou, takže ji uvidí trenéři a zapisovatelé, rodiče na svém odkazu ne. Fotky dětí přidávej jen se souhlasem rodičů. Datum narození ani kontakty záměrně neukládáme. Změna čísla se propíše i do odehraných zápasů.</p></div>`;
  h+=`<div class="card"><div class="label">Sezóna v číslech${[fTypeTxt(),ui.fComp].filter(Boolean).length?' · '+esc([fTypeTxt(),ui.fComp].filter(Boolean).join(' · ')):''}${allTeams()?' · všechny týmy':''}</div>
   ${TEAMS.list.length>1?`<div class="row filt"><button class="ghost ${allTeams()?'':'on-btn'}" data-act="stteam">Jen tento tým</button><button class="ghost ${allTeams()?'on-btn':''}" data-act="stall">Všechny týmy</button></div>`:''}
   <div class="cols2 filt">${fTypeSel()}${metaSel('fc','Soutěž',COMPS,ui.fComp).replace('<option value="">–</option>','<option value="">všechny</option>')}</div>
   ${G.length?`<div class="plstats">${[['Zápasy',s.g],['Pálil',s.pa],['Odpaly',s.h],['Dlouhé',s.xb],['Na metě',s.ob],['Body',s.r],['K',s.k],['Úspěšnost',s.pa?avg(s.ob,s.pa):'–']].map(([l,v])=>`<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>${plChart(G)}`:'<p class="next" style="margin:6px 0 0">Zatím žádný zápas.</p>'}</div>`;
  if(G.length)h+=`<div class="card"><div class="label">Zápas po zápase</div><div class="hist">${G.slice().reverse().map(x=>{const g=x.g,a=gTot(g,x.o),b=gTot(g,1-x.o),res=a>b?'V':a<b?'P':'R';
    return `<div class="hrow"><span class="res r${res}">${res}</span><div class="hmain"><b>${esc(g.teams[1-x.o].name)} · ${a} : ${b}</b><span class="next">${esc(gDate(g))}${x.cur?'':' · '+esc(teamName(TEAMS.list.find(t=>t.id===x.tid)||{id:x.tid}))}${x.star?' · ⭐':''}</span><span class="plpa">${x.pas.length?x.pas.map(r=>esc(r.code)+(r.scored?' •':'')).join(' · '):'jen v obraně'}</span></div>
    <div class="hbtns">${x.cur?`<button class="mini-btn" data-act="${x.live?'tab':'hopen'}" data-v="${x.live?'sheet':esc(g.gameId)}">Zápis</button>`:''}</div></div>`}).join('')}</div><p class="next" style="margin:6px 0 0">• = doběhl domů. Zápis otevře celý zápas.</p></div>`;
  if(Object.keys(s.def).length)h+=`<div class="card"><div class="label">Obrana · ${inf+out+(s.def['B']||0)} směn</div><div class="pldwrap">${plDiamond(s.def)}<div class="plddet"><div><b>${inf}</b> vnitřní pole</div><div><b>${out}</b> vnější pole</div>${s.def['10']?`<div><b>${s.def['10']}</b> další zadák</div>`:''}${s.def['B']?`<div><b>${s.def['B']}</b> lavička</div>`:''}
    ${range(9).filter(n=>!s.def[n]).length&&inf+out>=4?`<div class="next">Zatím nehrál: ${range(9).filter(n=>!s.def[n]).map(n=>POS[n]).join(', ')}</div>`:''}</div></div></div>`;
  if(ach.length||s.stars)h+=`<div class="card"><div class="label">Úspěchy</div><div class="ach">${ach.map(a=>`<span class="achip">🎉 ${esc(a.label)}${a.date?' · '+esc(gDate({meta:{date:a.date}})):''}</span>`).join('')}${s.stars?`<span class="achip star">⭐ hvězda zápasu ${s.stars}×</span>`:''}</div></div>`;
  h+=`<div class="card form"><div class="label">Poznámky trenéra</div><textarea id="pl-notes" class="bktext plnotes" placeholder="Např. pracuje na postoji u tee, příště zkusit na 1. metě.">${esc(p.notes||'')}</textarea>
   <p class="next" style="margin:0">Vidí jen trenéři a zapisovatelé. Rodiče je neuvidí a nejsou ani v PDF kartě.</p></div>
   <div class="card row" style="align-items:center"><button class="solid" data-act="plpdf" ${ui.plBusy?'disabled':''}>📄 Karta hráče jako PDF</button><span class="next">${esc(ui.plPdfMsg||'Jedna stránka se sezónou a úspěchy, třeba pro rodiče.')}</span></div>`;
  return h}
function playerPages(){const p=plFind(ui.player),k=pdfKit(),{W,M,C,D,B}=k,G=plGames(p),s=plSum(G),team=R.name||S.teams[ours()].name,fl=[fTypeTxt(),ui.fComp].filter(Boolean).join(' · ');
  const g=k.g,img=ui.plImg;if(img){g.drawImage(img,M,k.y,190,190);g.fillStyle=C.GREEN;g.fillRect(M+120,k.y+130,70,60);k.txt(noNum(p.num)?'–':p.num,`700 46px ${D}`,'#fff',M+155,k.y+161,64,'center')}
  else{g.fillStyle=C.GREEN;g.fillRect(M,k.y,190,190);k.txt(noNum(p.num)?'–':p.num,`700 120px ${D}`,'#fff',M+95,k.y+100,180,'center')}
  k.txt(dn(p)||'Hráč',`700 80px ${D}`,C.INK,M+230,k.y+60,W-2*M-230);k.txt(team+(handTxt(p)?' · '+handTxt(p):'')+(p.pos?' · oblíbená pozice: '+POS[p.pos]:'')+(p.since?' · hraje od '+p.since:''),`400 30px ${B}`,C.MUT,M+230,k.y+125,W-2*M-230);
  k.txt('Karta hráče · sezóna'+(fl?' · '+fl:'')+(allTeams()?' · všechny týmy':'')+' · '+new Date().toLocaleDateString('cs-CZ'),`400 26px ${B}`,C.MUT,M+230,k.y+170,W-2*M-230);k.y+=230;
  k.head('Sezóna v číslech');k.table([['',.01],['Zápasy',1],['Pálil',1],['Odpaly',1],['Dlouhé',1],['Na metě',1],['Body',1],['K',1],['Úspěšnost',1.3]],[['',s.g,s.pa,s.h,s.xb,s.ob,s.r,s.k,s.pa?avg(s.ob,s.pa):'–']]);
  if(G.length){k.head('Zápas po zápase');k.table([['Datum',2],['Soupeř',3.4],['Skóre',1.4],['Pálení',5]],G.map(x=>[gDate(x.g)||'–',x.g.teams[1-x.o].name,gTot(x.g,x.o)+' : '+gTot(x.g,1-x.o),x.pas.length?x.pas.map(r=>r.code+(r.scored?' •':'')).join(' · '):'jen v obraně']))}
  if(Object.keys(s.def).length){const P=['1','2','3','4','5','6','7','8','9','10','B'];k.head('Obrana (směny na pozicích)');k.table(P.map(p=>[posShort(p),1]),[P.map(p=>s.def[p]||'')])}
  const ach=achievements().filter(a=>a.num===p.num);if(ach.length||s.stars){k.head('Úspěchy');k.lines([...ach.map(a=>'🎉 '+a.label+(a.date?' · '+gDate({meta:{date:a.date}}):'')),...(s.stars?['⭐ hvězda zápasu '+s.stars+'×']:[])])}
  return k.pages}
const plUpd=fn=>{const p=plFind(ui.player);if(!p)return;fn(p);saveR()};
Object.assign(ACT,{pl:v=>{if(ui.tab!=='player')ui.plBack=ui.tab;ui.player=v;ui.plNum=false;ui.plMsgOn=false;ui.plPdfMsg='';ui.phMsg='';ui.phDel=false;ui.menu=false;ui.tab='player';render();window.scrollTo&&window.scrollTo(0,0)},
  plback:()=>{ui.tab=ui.plBack&&ui.plBack!=='player'?ui.plBack:'team';render()},
  plnumopen:()=>{ui.plNum=true;ui.plMsgOn=false;render();focusEl('pl-num')},plnumno:()=>{ui.plNum=false;render()},
  plnum:()=>{const f=document.getElementById('pl-num'),raw=f&&f.value,old=ui.player;assignNumber(old,raw);const nn=jersey(raw);if(nn&&plFind(nn)&&!plFind(old)){ui.player=nn;ui.plNum=false}ui.plMsgOn=true;render()},
  plpdf:async()=>{const p=plFind(ui.player);if(!p)return;ui.plImg=p.photo?await loadImg(p.photo).catch(()=>null):null;pdfSave(playerPages,'karta-'+(p.name||'hrac')+(noNum(p.num)?'':'-'+p.num),'plPdfMsg','plBusy')}});
CHG['pl-name']=v=>{const n=v.trim();if(n)plUpd(p=>{p.name=n})};
  CHG['pl-nick']=v=>{const n=v.trim().slice(0,20);plUpd(p=>{if(n)p.nick=n;else delete p.nick});render()};
CHG['pl-bats']=v=>{plUpd(p=>{if(v)p.bats=v;else delete p.bats});render()};
CHG['pl-throws']=v=>{plUpd(p=>{if(v)p.throws=v;else delete p.throws});render()};
CHG['pl-pos']=v=>{plUpd(p=>{if(v)p.pos=v;else delete p.pos});render()};
CHG['pl-since']=v=>{plUpd(p=>{const x=v.trim();if(x)p.since=x;else delete p.since})};
CHG['pl-notes']=v=>{plUpd(p=>{const x=v.trim();if(x)p.notes=v;else delete p.notes})};
TABS.player='Hráč';VIEWS.player=()=>playerView();
/* ----- fotka hráče: zmenšená na čtverec 256 px (JPEG), uložená u hráče v soupisce ----- */
const loadImg=src=>new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=src});
async function photoFrom(file){const url=URL.createObjectURL(file);try{const im=await loadImg(url),n=Math.min(im.naturalWidth,im.naturalHeight);if(!n)throw 0;
    const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.drawImage(im,(im.naturalWidth-n)/2,(im.naturalHeight-n)/3,n,n,0,0,256,256);
    let q=.82,d=c.toDataURL('image/jpeg',q);while(d.length>45000&&q>.4){q-=.12;d=c.toDataURL('image/jpeg',q)}return d}finally{URL.revokeObjectURL(url)}}
CHG['pl-photo']=async(v,el)=>{const f=el.files&&el.files[0];if(!f)return;if(!/^image\//.test(f.type)){ui.phMsg='Tohle není obrázek.';return render()}
  ui.phMsg='Zpracovávám fotku…';render();try{const d=await photoFrom(f);plUpd(p=>{p.photo=d});ui.phMsg='Fotka uložena.'}catch(e){ui.phMsg='Fotku se nepodařilo načíst. Zkus jiný obrázek (JPG nebo PNG).'}render()};
Object.assign(ACT,{phdel:()=>{ui.phDel=true;render()},phdelno:()=>{ui.phDel=false;render()},phdelyes:()=>{plUpd(p=>{delete p.photo});ui.phDel=false;ui.phMsg='Fotka odebrána.';render()}});
/* =========== ocenění sezóny a diplomy =========== */
const AWARDS=[['h','Král odpalů',v=>v+' '+(v===1?'odpal':v<5?'odpaly':'odpalů')],['r','Nejrychlejší nohy',v=>v+' '+(v===1?'doběhnutý bod':v<5?'doběhnuté body':'doběhnutých bodů')],
  ['xb','Dalekonosná pálka',v=>v+' '+(v===1?'dlouhý odpal':v<5?'dlouhé odpaly':'dlouhých odpalů')],['avg','Nejjistější pálkař',v=>'úspěšnost '+v.toFixed(3)],
  ['fo','Zlatá rukavice',v=>v+' '+(v===1?'chycený aut':v<5?'chycené auty':'chycených autů')+' ze vzduchu'],['st','Hvězda sezóny',v=>v+'× hvězda zápasu'],
  ['pos','Univerzál',v=>v+' '+(v<5?'různé pozice':'různých pozic')+' v obraně'],['inn','Neúnavný obránce',v=>v+' '+(v===1?'směna':v<5?'směny':'směn')+' v obraně'],
  ['g','Věrný hráč',v=>v+' '+gamesWord(v)]];
function awardsData(){const G=gamesChrono().filter(inFilter),m={};const M=n=>m[n]=m[n]||{h:0,r:0,xb:0,ob:0,pa:0,fo:0,st:0,inn:0,g:0,pos:new Set()};
  G.forEach(g=>{const o=g.ours??1,seen=new Set();(g.pas||[]).filter(r=>r.t===o&&!anon(r.num)).forEach(r=>{const x=M(r.num);seen.add(r.num);x.pa++;if(isHit(r.code))x.h++;if(HITS.slice(1).includes(r.code))x.xb++;if(r.scored)x.r++;if(onBase(r))x.ob++});
    Object.entries(flyouts(g).by).forEach(([n,c])=>{M(n).fo+=c});(g.stars||[]).forEach(n=>{M(n).st++});
    if(g.def)Object.values(g.def).forEach(d=>Object.entries(d||{}).forEach(([n,p])=>{if(p&&p!=='B'){const x=M(n);x.inn++;x.pos.add(p);seen.add(n)}}));seen.forEach(n=>{M(n).g++})});
  const ps=sortedRoster().filter(p=>m[p.num]),val=(n,k)=>{const x=m[n];return k==='avg'?(x.pa>=3?x.ob/x.pa:0):k==='pos'?x.pos.size:x[k]};
  const cand=[];AWARDS.forEach(([k],ai)=>{const vs=ps.map(p=>val(p.num,k)).filter(v=>v>0);ps.forEach(p=>{const v=val(p.num,k);if(v>0)cand.push({n:p.num,k,ai,v,rank:vs.filter(x=>x>v).length})})});
  cand.sort((a,b)=>a.rank-b.rank||a.ai-b.ai||b.v-a.v);const got={},used={};
  for(const pass of [0,1])cand.forEach(c=>{if(got[c.n]||(pass===0&&used[c.k]))return;got[c.n]=c;used[c.k]=1});
  return ps.map(p=>{const c=got[p.num],a=c&&AWARDS.find(x=>x[0]===c.k);return{p,title:a?a[1]:'Za skvělou sezónu',txt:a?a[2](c.v):m[p.num].g+' '+gamesWord(m[p.num].g),best:c&&c.rank===0}})}
function awardsCard(){const A=awardsData();if(!A.length)return'';
  return `<div class="card"><div class="label">Ocenění sezóny · pro každé dítě</div><div class="awl">${A.map(a=>`<div class="awr"><span class="awt">🏆 ${esc(a.title)}</span><b>${plLink(a.p.num,lbl(ours(),a.p.num))}</b><span class="next">${esc(a.txt)}</span></div>`).join('')}</div>
  <div class="row" style="margin-top:8px;align-items:center"><button class="solid" data-act="dippdf" ${ui.dipBusy?'disabled':''}>📄 Diplomy pro všechny (PDF)</button><span class="next">${esc(ui.dipMsg||'Každé dítě dostane vlastní ocenění podle toho, v čem bylo v sezóně nejlepší.')}</span></div></div>`}
function diplomaPages(){const A=awardsData(),team=R.name||S.teams[ours()].name,season=String(new Date().getFullYear()),pages=[],W=2339,H=1654;
  const D='"Barlow Condensed","Arial Narrow",sans-serif',B='"Atkinson Hyperlegible",Arial,sans-serif',GREEN='#2c6a43',INK='#1c2836',MUT='#5d6b66',GOLD='#b98a00';
  A.forEach(a=>{const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);
    g.strokeStyle=GREEN;g.lineWidth=18;g.strokeRect(60,60,W-120,H-120);g.lineWidth=4;g.strokeRect(100,100,W-200,H-200);
    const t=(s,font,col,y)=>{g.font=font;g.fillStyle=col;g.textAlign='center';g.textBaseline='middle';g.fillText(String(s),W/2,y,W-400)};
    t('DIPLOM',`700 150px ${D}`,GREEN,280);t(team+' · sezóna '+season,`400 46px ${B}`,MUT,390);
    const img=ui.dipImgs&&ui.dipImgs[a.p.num];let y=560;
    if(img){const s=300;g.save();g.beginPath();g.arc(W/2,y+s/2,s/2,0,Math.PI*2);g.clip();g.drawImage(img,W/2-s/2,y,s,s);g.restore();g.strokeStyle=GREEN;g.lineWidth=8;g.beginPath();g.arc(W/2,y+s/2,s/2,0,Math.PI*2);g.stroke();y+=s+40}
    t(dn(a.p)||'Hráč',`700 ${img?110:140}px ${D}`,INK,y+60);y+=img?150:200;
    t('🏆 '+a.title,`700 ${img?90:110}px ${D}`,GOLD,y+40);y+=img?110:140;t(a.txt,`400 50px ${B}`,INK,y+20);
    g.strokeStyle=MUT;g.lineWidth=3;g.beginPath();g.moveTo(W-760,H-250);g.lineTo(W-260,H-250);g.stroke();
    g.font=`400 36px ${B}`;g.fillStyle=MUT;g.textAlign='center';g.fillText('trenéři',W-510,H-210);g.textAlign='left';g.fillText(new Date().toLocaleDateString('cs-CZ'),260,H-210);
    pages.push(c)});return pages}
ACT.dippdf=async()=>{const A=awardsData();ui.dipImgs={};await Promise.all(A.filter(a=>a.p.photo).map(a=>loadImg(a.p.photo).then(i=>{ui.dipImgs[a.p.num]=i}).catch(()=>{})));
  pdfSave(diplomaPages,'diplomy-'+(R.name||'tym'),'dipMsg','dipBusy',true)};

/* =========== přejmenování týmu i v historii =========== */
function renameInHistory(old,neu){if(!neu)return 0;let n=0;const H=loadH();H.forEach(g=>{const o=g.ours??1;if(g.teams&&g.teams[o]&&g.teams[o].name!==neu&&(old==null||g.teams[o].name===old)){g.teams[o].name=neu;n++}});if(n)saveH(H);
  TEAMS.list.filter(t=>t.id!==TEAMS.cur).forEach(t=>{const h=loadHFor(t.id);let ch=false;h.forEach(g=>{if(g.vsTid===TEAMS.cur){const s=1-(g.ours??1);if(g.teams[s].name!==neu&&(old==null||g.teams[s].name===old)){g.teams[s].name=neu;ch=true}}});if(ch&&(typeof canWrite!=='function'||canWrite(t.id)))store.set(keyFor(HKEY,t.id),h);
    const k=keyFor(SKEY,t.id),l=store.get(k,[])||[];let cs=false;l.forEach(x=>{if(x.vsTid===TEAMS.cur&&x.opp!==neu&&(old==null||x.opp===old)){x.opp=neu;cs=true}});if(cs&&(typeof canWrite!=='function'||canWrite(t.id)))store.set(k,l)});return n}
const oldNames=()=>{const neu=R.name||S.teams[ours()].name;return loadH().filter(g=>g.teams&&g.teams[g.ours??1]&&g.teams[g.ours??1].name!==neu).length};
ACT.renhist=()=>{const n=renameInHistory(null,R.name||S.teams[ours()].name);ui.rmsg='Název sjednocen u '+n+' '+(n===1?'zápasu':'zápasů')+' v historii.';render()};

/* =========== automatické zálohy online (jednou týdně, posledních 8) =========== */
const weekId=ms=>{const t=new Date(ms);t.setHours(0,0,0,0);t.setDate(t.getDate()+3-(t.getDay()+6)%7);const w1=new Date(t.getFullYear(),0,4);return t.getFullYear()+'-W'+String(1+Math.round(((t-w1)/864e5-3+(w1.getDay()+6)%7)/7)).padStart(2,'0')};
function teamSnapshot(tid){const cur=tid===TEAMS.cur;return{app:'tball-scorekeeper',kind:'teambackup',v:1,tid,name:teamName(TEAMS.list.find(t=>t.id===tid)||{id:tid}),when:new Date().toISOString(),
  S:cur?S:store.get(keyFor(KEY,tid),null),R:cur?R:store.get(keyFor(RKEY,tid),null),H:loadHFor(tid),Sch:store.get(keyFor(SKEY,tid),[])||[]}}
async function backupTeam(tid,manual){if(!FBX||!WEB.online||!canWrite(tid))return false;const snap=teamSnapshot(tid);
  if(!manual&&!(snap.H.length||(snap.R&&(snap.R.players||[]).length)))return false;
  const bid=manual?'m'+Date.now().toString(36):weekId(Date.now()),ts=Date.now(),db=FBX.db,base='backups/'+tid;
  await db.ref(base+'/data/'+bid).set({ts,json:J(snap)});await db.ref(base+'/index/'+bid).set({ts,games:snap.H.length,players:(snap.R&&snap.R.players||[]).length,manual:!!manual});
  const idx=(await db.ref(base+'/index').once('value')).val()||{},ids=Object.keys(idx).sort((a,b)=>idx[b].ts-idx[a].ts);
  for(const id of ids.slice(8)){await db.ref(base+'/data/'+id).remove();await db.ref(base+'/index/'+id).remove()}return true}
async function autoBackup(tid){FS.bk=FS.bk||{};const wk=weekId(Date.now());if(FS.bk[tid]===wk||FS.bk[tid]==='run'||!FBX||!canWrite(tid))return;FS.bk[tid]='run';
  try{const idx=(await FBX.db.ref('backups/'+tid+'/index').once('value')).val()||{};FS.bk[tid]=idx[wk]||await backupTeam(tid,false)?wk:0}catch(e){FS.bk[tid]=0}}
const bkTids=()=>TEAMS.list.map(t=>t.id).filter(canWrite);
async function loadBackups(){ui.obk={busy:true};render();const out=[];
  try{for(const tid of bkTids()){const idx=(await FBX.db.ref('backups/'+tid+'/index').once('value')).val()||{};Object.keys(idx).forEach(id=>out.push({tid,id,...idx[id]}))}
    out.sort((a,b)=>b.ts-a.ts);ui.obk={list:out}}catch(e){ui.obk={err:'Zálohy se nepodařilo načíst. Jsou pravidla ve Firebase aktuální?'}}render()}
async function restoreBackup(tid,id){ui.obk.busy=true;render();
  try{const v=(await FBX.db.ref('backups/'+tid+'/data/'+id).once('value')).val(),b=v&&JSON.parse(v.json);if(!b||b.kind!=='teambackup')throw 0;
    if(tid===TEAMS.cur){if(b.S&&b.S.teams){S=b.S;save()}if(b.R&&Array.isArray(b.R.players)){R=b.R;saveR()}hist=[]}
    else{if(b.S&&b.S.teams)store.set(keyFor(KEY,tid),b.S);if(b.R&&Array.isArray(b.R.players))store.set(keyFor(RKEY,tid),b.R)}
    store.set(keyFor(HKEY,tid),Array.isArray(b.H)?b.H:[]);store.set(keyFor(SKEY,tid),Array.isArray(b.Sch)?b.Sch:[]);flushSoon();
    ui.obk={...ui.obk,busy:false,ask:null,msg:'Obnoveno: '+b.name+' ze zálohy '+new Date(v.ts).toLocaleString('cs-CZ')+'.'}}
  catch(e){ui.obk={...ui.obk,busy:false,ask:null,msg:'Obnovení se nepovedlo.'}}render()}
function onlineBackupCard(){if(typeof FBX==='undefined'||!WEB.role)return'';const o=ui.obk||{},tn=tid=>teamName(TEAMS.list.find(t=>t.id===tid)||{id:tid});
  return `<div class="card form"><div class="label">Zálohy online</div>
  <p class="next" style="margin:0">Každý týden se sama uloží záloha soupisky, rozpisu, rozehraného zápasu i historie. Drží se posledních 8. Když se něco smaže omylem, jde se k ní vrátit.</p>
  <div class="row"><button class="ghost" data-act="obklist" ${o.busy?'disabled':''}>Zobrazit zálohy</button><button class="ghost" data-act="obknow" ${o.busy?'disabled':''}>Zálohovat teď</button></div>
  ${o.err?`<div class="msg">${esc(o.err)}</div>`:''}${o.msg?`<div class="next">${esc(o.msg)}</div>`:''}
  ${o.list?(o.list.length?`<div class="hist">${o.list.map(x=>`<div class="hrow"><span class="res rR">${x.manual?'R':'T'}</span><div class="hmain"><b>${esc(new Date(x.ts).toLocaleString('cs-CZ'))}</b><span class="next">${esc(tn(x.tid))} · ${x.players} hráčů · ${x.games} ${gamesWord(x.games)}${x.manual?' · ruční':''}</span></div>
    <div class="hbtns">${o.ask===x.tid+'|'+x.id?`<button class="mini-btn out" data-act="obkyes" data-v="${esc(x.tid+'|'+x.id)}">Opravdu obnovit</button><button class="mini-btn" data-act="obkno">Ne</button>`:`<button class="mini-btn" data-act="obkask" data-v="${esc(x.tid+'|'+x.id)}">Obnovit</button>`}</div></div>`).join('')}</div>
    <p class="next" style="margin:0">Obnovení přepíše soupisku, rozpis, rozehraný zápas i historii daného týmu stavem ze zálohy, na všech telefonech.</p>`:'<p class="next" style="margin:0">Zatím žádná záloha.</p>'):''}</div>`}
Object.assign(ACT,{obklist:()=>loadBackups(),obknow:async()=>{ui.obk={...(ui.obk||{}),busy:true};render();let n=0;for(const tid of bkTids()){try{if(await backupTeam(tid,true))n++}catch(e){}}await loadBackups();ui.obk.msg=n?'Záloha uložena ('+n+' '+(n===1?'tým':'týmy')+').':'Zálohu se nepodařilo uložit. Jsi online?';render()},
  obkask:v=>{ui.obk.ask=v;render()},obkno:()=>{ui.obk.ask=null;render()},obkyes:v=>{const [tid,id]=v.split('|');restoreBackup(tid,id)}});
/* =========== po odpalu: kam doběhli běžci (předvyplněno: každý o tolik met jako pálkař) =========== */
function advOpen(n){const sel={};[0,1,2].forEach(b=>{if(S.bases[b]!=null)sel['r'+b]=b+n>=3?'H':String(b+n)});sel.b=n>=4?'H':String(n-1);ui.adv={n,sel};ui.panel=null;render()}
function advPanel(){const a=ui.adv,t=bt(),bat=S.teams[t].lineup[S.bat[t]],sel=a.sel,lab={0:'1.',1:'2.',2:'3.',H:'Domů',O:'Aut'};
  const used={};Object.values(sel).forEach(v=>{if(v!=='H'&&v!=='O')used[v]=(used[v]||0)+1});const clash=Object.values(used).some(c=>c>1);
  const runs=Object.values(sel).filter(v=>v==='H').length,outs=Object.values(sel).filter(v=>v==='O').length;
  const row=(key,who,from,opts,minB)=>`<div class="advrow"><div class="advwho"><b>${esc(who)}</b><small>${from}</small></div><div class="seg" style="grid-template-columns:repeat(${opts.length},minmax(0,1fr))">${opts.map(o=>{const dis=o!=='H'&&o!=='O'&&+o<minB;return `<button class="${sel[key]===o?'on':''} ${o==='O'?'out':''}" data-act="advsel" data-v="${key}|${o}" ${dis?'disabled':''}>${lab[o]}</button>`}).join('')}</div></div>`;
  let h=`<div class="card form adv"><div class="label">${esc(diaLbl({t,num:bat}))} odpálil ${HITS[a.n-1]} · kam doběhli běžci?</div><p class="next" style="margin:0">Předvyplněno, že každý postoupil o ${a.n===1?'metu':a.n<4?a.n+' mety':'všechny mety'}. Ťukni, kde kdo skutečně skončil.</p>`;
  [2,1,0].forEach(b=>{const id=S.bases[b];if(id==null)return;h+=row('r'+b,diaLbl(S.pas[id]),'byl na '+(b+1)+'. metě',['1','2','H','O'],b)});
  h+=row('b',diaLbl({t,num:bat}),'pálkař',['0','1','2','H','O'].filter(o=>o==='H'||o==='O'||+o<maxB()),0);
  h+=`<div class="next">Body: +${runs} · Auty: ${outs}</div>${clash?'<div class="msg">Na jedné metě může stát jen jeden hráč.</div>':''}
  <div class="row"><button class="solid" data-act="advgo" ${clash?'disabled':''}>Hotovo</button><button class="ghost" data-act="advno">↶ Zpět</button></div></div>`;return h}
Object.assign(ACT,{advsel:v=>{const [k,o]=v.split('|');if(!ui.adv||!(k in ui.adv.sel))return;ui.adv.sel[k]=o;render()},advno:()=>{ui.adv=null;render()},
  advgo:()=>{const a=ui.adv;if(!a)return;ui.adv=null;act('hitx',{n:a.n,plan:{...a.sel}})}});
const focusEl=id=>{const f=document.getElementById(id);if(f)f.focus()};
const ENTER={subnum:e=>doSub(e.target.value),rennum:e=>doRen(e.target.value),add0:()=>addPlayer(0),add1:()=>addPlayer(1),rnum:()=>focusEl('rname'),rname:()=>addRoster(),
  'lg-code':()=>doLogin(),'lg-new2':()=>doSetup(),'op-new':()=>ACT.opadd(),'op-num':()=>focusEl('op-pname'),'op-pname':()=>ACT.oppadd(),rassnum:()=>ACT.rassgo(),'pl-num':()=>ACT.plnum()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.menu){ui.menu=false;return render()}if(e.key!=='Enter')return;if(RO()&&!roOk(e.target.id||''))return;const f=ENTER[e.target.id];if(f){e.preventDefault();f(e)}});
render();
/* Lineup a obrana: podzáložky a přepínač náš tým / soupeř */
Object.assign(ACT,{dsub:v=>{ui.defSub=v;ui.confirm=false;render();window.scrollTo&&window.scrollTo(0,0)},luside:v=>{ui.luSide=v;ui.sub=null;ui.ren=null;render()}});
/* Lineup a obrana: přejetí prstem doleva / doprava přepne Lineup · Obrana · Nastavení */
(()=>{let x0=null,y0=0,t0=0;
  document.addEventListener('touchstart',e=>{if(ui.tab!=='def'||e.touches.length!==1||e.target.closest('input,select,textarea,.sheet-wrap,.ls-wrap,.plist,.olist,.menu-list')){x0=null;return}x0=e.touches[0].clientX;y0=e.touches[0].clientY;t0=Date.now()},{passive:true});
  document.addEventListener('touchend',e=>{if(x0==null||ui.tab!=='def')return;const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;
    if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.8||Date.now()-t0>700)return;const ks=DSUB.map(x=>x[0]),i=ks.indexOf(ui.defSub||'lu'),j=i+(dx<0?1:-1);if(j<0||j>=ks.length)return;ACT.dsub(ks[j])},{passive:true})})();
/* pálkařské pořadí: prohození sousedů (i-1, i) včetně střídání na místě; přesun = postupné prohazování */
function lineSwap(t,i){const L=S.teams[t].lineup;[L[i-1],L[i]]=[L[i],L[i-1]];(S.subs||[]).forEach(x=>{if(x.t===t){if(x.slot===i)x.slot=i-1;else if(x.slot===i-1)x.slot=i}})}
function lineMove(t,from,to){if(from===to)return;snap();if(from<to)for(let i=from+1;i<=to;i++)lineSwap(t,i);else for(let i=from;i>to;i--)lineSwap(t,i);S.example=false;commit()}
/* přetažení jména v pořadí (prst i myš) */
(()=>{let D=null;
  document.addEventListener('pointerdown',e=>{const h=e.target.closest&&e.target.closest('.orow .onm,.orow .grip');if(!h)return;const row=h.closest('.orow'),list=row.parentNode;
    if(RO()&&!RO_ACT.has('pup'))return;const rows=[...list.children];D={row,list,t:+list.dataset.t,from:+row.dataset.i,y0:e.clientY,on:false,rows,mids:rows.map(r=>{const b=r.getBoundingClientRect();return b.top+b.height/2}),h:row.getBoundingClientRect().height+6,to:+row.dataset.i};
    try{h.setPointerCapture(e.pointerId)}catch(err){}});
  document.addEventListener('pointermove',e=>{if(!D)return;const dy=e.clientY-D.y0;if(!D.on){if(Math.abs(dy)<8)return;D.on=true;D.row.classList.add('dragging')}
    e.preventDefault();D.row.style.transform='translateY('+dy+'px)';const y=D.mids[D.from]+dy;let to=D.from;
    D.mids.forEach((m,k)=>{if(k<D.from&&y<m)to=Math.min(to,k);if(k>D.from&&y>m)to=Math.max(to,k)});D.to=to;
    D.rows.forEach((r,k)=>{if(r===D.row)return;r.style.transform=k>D.from&&k<=to?'translateY(-'+D.h+'px)':k<D.from&&k>=to?'translateY('+D.h+'px)':''})},{passive:false});
  const end=()=>{if(!D)return;const d=D;D=null;d.rows.forEach(r=>{r.style.transform=''});d.row.classList.remove('dragging');if(d.on&&d.to!==d.from)lineMove(d.t,d.from,d.to)};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end)})();
Object.assign(ACT,{dpos:v=>{ui.dpos=v&&ui.dpos!==v?v:null;render()},dput:v=>defPut(v)});
