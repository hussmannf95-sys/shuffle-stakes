/*
 * SHUFFLE STAKES — Bug-Fix Patch v5
 */

/* ── FIX 1a: orPlaceBet ── */
async function orPlaceBet(qid){
  if(!S.user){toast('Please log in first','error');return;}
  const pick=_orSel[qid];
  if(!pick){toast('Select an option first','error');return;}
  const q=OUTRIGHT_QUESTIONS.find(q=>q.id===qid);
  if(!q) return;
  const opts=orOptionsForType(q.type);
  const pickOdds=opts.find(o=>o.key===pick)?.odds;
  if(!pickOdds){toast('Option not found','error');return;}
  const amount=_orAmt[qid]||5;
  const existing=S.myOrPicks[qid];
  const refund=(existing&&!existing.settled)?existing.amount:0;
  const netCost=amount-refund;
  if(S.coins<netCost){toast('Not enough coins!','error');return;}
  const userKey=sk(S.user);
  const txResult=await db.ref(`${PATH.users}/${userKey}/coins`).transaction(c=>{
    if(c==null) return undefined;
    if(c<netCost) return undefined;
    return c-netCost;
  });
  if(!txResult.committed){toast('Transaction failed \u2014 try again','error');return;}
  S.coins=txResult.snapshot.val()??S.coins;
  const _ce1=document.getElementById('hdrCoins');
  if(_ce1){_ce1.textContent=S.coins;_ce1.classList.add('animate');setTimeout(()=>_ce1.classList.remove('animate'),800);}
  const pickData={pick,odds:pickOdds,amount,
    placedAt:firebase.database.ServerValue.TIMESTAMP,
    settled:false,won:false};
  await db.ref(`shufflecup2026_betting/outright_picks/${userKey}/${qid}`).set(pickData);
  /* FIX v5: lokal sofort setzen damit My Bets es zeigt */
  if(!S.myOrPicks) S.myOrPicks={};
  S.myOrPicks[qid]={...pickData,placedAt:Date.now()};
  toast(`Q${q.n} saved: ${trunc(pick,14)} @ ${pickOdds}x \u2713`,'success');
}

/* ── FIX 1b: confirmBet ── */
async function confirmBet(){
  const{matchId,side,o1,o2}=S.bm;
  const amt=parseInt(document.getElementById('amtSlider')?.value)||5;
  if(!matchId||!side){toast('Please select a side','error');return;}
  if(S.coins<amt){toast('Not enough coins!','error');return;}
  const o=side==='player1'?o1:o2;
  const userKey=sk(S.user);
  const txResult2=await db.ref(`${PATH.users}/${userKey}/coins`).transaction(c=>{
    if(c==null) return undefined;
    if(c<amt) return undefined;
    return c-amt;
  });
  if(!txResult2.committed){toast('Coin transaction failed \u2014 try again','error');return;}
  S.coins=txResult2.snapshot.val()??S.coins;
  const _ce2=document.getElementById('hdrCoins');
  if(_ce2){_ce2.textContent=S.coins;_ce2.classList.add('animate');setTimeout(()=>_ce2.classList.remove('animate'),800);}
  await db.ref(`${PATH.bets}/${matchId}`).push({
    user:S.user,side,amount:amt,odds:o,
    placedAt:firebase.database.ServerValue.TIMESTAMP,
    settled:false,won:false
  });
  closeBet();
  const p=parsePairing(matchId,S.pairings[matchId]);
  const sn=side==='player1'?p?.player1:p?.player2;
  toast(`${amt}\uD83E\uDE99 on ${trunc(sn,12)} @ ${o}x \u2713`,'success');
}

/* ── FIX 2: renderMyBets ── */
function renderMyBets(){
  const el=document.getElementById('myBetsList');
  if(!el) return;
  const flat=[];
  for(const[mid,bets] of Object.entries(S.myBets||{}))
    for(const[bid,b] of Object.entries(bets)) flat.push({mid,bid,...b,isOutright:false});
  for(const[qid,pick] of Object.entries(S.myOrPicks||{})){
    if(!pick||!pick.pick) continue;
    const q=OUTRIGHT_QUESTIONS.find(x=>x.id===qid);
    flat.push({mid:qid,bid:qid,user:S.user,side:pick.pick,amount:pick.amount||0,
      odds:pick.odds||1,placedAt:pick.placedAt||0,settled:pick.settled||false,
      won:pick.won===true,refunded:false,isOutright:true,
      outrightLabel:q?`\uD83C\uDFAF Q${q.n}: ${q.title}`:`\uD83C\uDFAF ${qid}`});
  }
  if(!flat.length){el.innerHTML='<div class="empty"><div class="icon">\uD83C\uDFB0</div><p>You haven\'t placed any bets yet.</p></div>';return;}
  flat.sort((a,b)=>(b.placedAt||0)-(a.placedAt||0));
  let html='';
  let pending=0,won=0,lost=0,winCoins=0;
  for(const b of flat){
    const pairing=b.isOutright?null:parsePairing(b.mid,S.pairings[b.mid]);
    const sideName=b.isOutright?b.side:(pairing?(b.side==='player1'?pairing.player1:pairing.player2):b.side);
    const matchLabel=b.isOutright?b.outrightLabel:b.mid;
    const isPending=!b.settled;
    let cls,tag,tagCls,detail;
    if(b.refunded){cls='refunded';tag='Refunded';tagCls='t-refund';detail=`${b.amount}\uD83E\uDE99 returned`;}
    else if(isPending){cls='pending';tag='Pending';tagCls='t-pending';
      const pot=Math.round(b.amount*b.odds);detail=`${b.amount}\uD83E\uDE99 \xd7 ${b.odds}x \u2192 pot. ${pot}\uD83E\uDE99`;pending++;}
    else if(b.won===true){cls='won';tag=`+${Math.round(b.amount*b.odds)}\uD83E\uDE99 won`;tagCls='t-won';
      detail=`${b.amount}\uD83E\uDE99 \xd7 ${b.odds}x`;won++;winCoins+=Math.round(b.amount*b.odds);}
    else{cls='lost';tag='Lost';tagCls='t-lost';detail=`${b.amount}\uD83E\uDE99 lost`;lost++;}
    const cancelBtn=(!b.isOutright&&!b.settled&&!b.refunded&&!S.results[b.mid])
      ?`<button class="btn-cancel-bet" onclick="cancelBet('${b.mid}','${b.bid}')">\u2715 Cancel</button>`:'';
    html+=`<div class="bet-item ${cls}">
      <div class="bi-head">
        <span class="bi-match">${esc(matchLabel)}</span>
        <span class="bi-tag ${tagCls}">${tag}</span>
      </div>
      <div class="bi-body">
        <span class="bi-on">\uD83D\uDCCC ${esc(trunc(sideName,24))}</span>
        <span class="bi-amt">${esc(detail)}</span>
      </div>
      ${cancelBtn?`<div style="text-align:right;margin-top:.35rem">${cancelBtn}</div>`:''}
    </div>`;
  }
  const summary=`<div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
    <div class="stat-chip"><strong>${pending}</strong> pending</div>
    <div class="stat-chip"><strong>${won}</strong> won</div>
    <div class="stat-chip"><strong>${lost}</strong> lost</div>
    ${won?`<div class="stat-chip" style="color:var(--success)"><strong>+${winCoins}</strong>\uD83E\uDE99 earnings</div>`:''}
  </div>`;
  el.innerHTML=summary+html;
}

/* ── FIX 2b: Outright-Picks aus Firebase laden (v5 NEU) ──
   Sobald S.user gesetzt ist, hängt ein Firebase-Listener
   der S.myOrPicks live befüllt und My Bets neu rendert.    */
let _orListenerSet=false;
function _setupOrPicksListener(){
  if(_orListenerSet||!window.S?.user||!window.db) return;
  _orListenerSet=true;
  const userKey=sk(S.user);
  db.ref(`shufflecup2026_betting/outright_picks/${userKey}`).on('value',snap=>{
    S.myOrPicks=snap.val()||{};
    /* Falls My-Bets-Tab gerade sichtbar ist: sofort neu rendern */
    const el=document.getElementById('myBetsList');
    if(el&&el.offsetParent!==null) renderMyBets();
  });
}

/* ── FIX 2c: My-Bets-Tab abfangen (v5 NEU) ──
   Falls die Original-Funktion in einer Closure liegt und
   unsere renderMyBets() nicht aufruft, erzwingen wir es hier. */
let _prevBetsHTML='__init__';
function _watchMyBets(){
  const el=document.getElementById('myBetsList');
  if(!el||el.offsetParent===null) return; /* Tab nicht sichtbar */
  if(el.innerHTML===_prevBetsHTML) return;
  _prevBetsHTML=el.innerHTML;
  /* Wenn Original "keine Wetten" zeigt, wir aber Picks haben → fix */
  if(el.innerHTML.includes("haven't placed")&&Object.keys(S?.myOrPicks||{}).length>0){
    renderMyBets();
  }
}

/* Poll: Login abwarten, dann Listener setzen */
const _loginPoll=setInterval(()=>{
  if(window.S?.user){
    _setupOrPicksListener();
    clearInterval(_loginPoll);
  }
},500);

/* Poll: My Bets Tab überwachen */
setInterval(_watchMyBets,300);


/* ── FIX 3: Manueller Login ── */
function _doGuestLogin(){
  const inp=document.getElementById('guestNameInp');
  const name=(inp?.value||'').trim();
  if(!name){toast('Please enter your name','error');return;}
  login(name);
}

function _setupGuestLogin(){
  const loginBtn=document.getElementById('loginBtn');
  if(!loginBtn) return;
  if(!document.getElementById('guestRow')){
    const row=document.createElement('div');
    row.id='guestRow';
    row.style.cssText='display:none;margin-top:.6rem;width:100%;max-width:400px';
    row.innerHTML=`<div class="guest-row">
      <input type="text" class="guest-input" id="guestNameInp"
        placeholder="Your full name\u2026"
        autocomplete="off" autocorrect="off" autocapitalize="words"
        onkeydown="if(event.key==='Enter') _doGuestLogin();">
      <button class="guest-btn" onclick="_doGuestLogin()">Go \u2192</button>
    </div>`;
    loginBtn.insertAdjacentElement('afterend',row);
  }
  loginBtn.onclick=()=>{
    const row=document.getElementById('guestRow');
    if(!row) return;
    const hidden=row.style.display==='none';
    row.style.display=hidden?'block':'none';
    if(hidden) setTimeout(()=>document.getElementById('guestNameInp')?.focus(),50);
  };
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>setTimeout(_setupGuestLogin,0));
}else{
  setTimeout(_setupGuestLogin,0);
}
