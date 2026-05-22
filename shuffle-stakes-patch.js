/*
 * SHUFFLE STAKES — Bug-Fix Patch
 * ===============================
 * Fixes 3 bugs. Paste this ENTIRE block at the very end of the <script> in index.html,
 * just before </script>. It overrides the buggy functions with corrected versions.
 *
 * BUG 1 – Coins not updating after a bet
 * BUG 2 – My Bets shows outright picks as "lost" (or not at all)
 * BUG 3 – Manual name entry does nothing (window.prompt blocked on mobile)
 */

/* ──────────────────────────────────────────────────────────
   FIX 1 + FIX 2 part a: orPlaceBet — reliable transaction
   ────────────────────────────────────────────────────────── */
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

  // FIX 1: Use TransactionResult instead of unreliable `ok` flag
  const txResult=await db.ref(`${PATH.users}/${userKey}/coins`).transaction(c=>{
    if(c==null) return undefined; // not yet cached — Firebase will retry with real value
    if(c<netCost) return undefined; // insufficient coins → abort
    return c-netCost;
  });
  if(!txResult.committed){toast('Transaction failed — try again','error');return;}

  // Immediately update local state + header display (don't wait for listener)
  S.coins=txResult.snapshot.val()??S.coins;
  const coinEl=document.getElementById('hdrCoins');
  if(coinEl){
    coinEl.textContent=S.coins;
    coinEl.classList.add('animate');
    setTimeout(()=>coinEl.classList.remove('animate'),800);
  }

  await db.ref(`shufflecup2026_betting/outright_picks/${userKey}/${qid}`).set({
    pick,odds:pickOdds,amount,
    placedAt:firebase.database.ServerValue.TIMESTAMP,
    settled:false,won:false // store false instead of null — Firebase removes null!
  });
  toast(`Q${q.n} saved: ${trunc(pick,14)} @ ${pickOdds}x ✓`,'success');
}

/* ──────────────────────────────────────────────────────────
   FIX 1 part b: confirmBet — same reliable transaction fix
   ────────────────────────────────────────────────────────── */
async function confirmBet(){
  const{matchId,side,o1,o2}=S.bm;
  const amt=parseInt(document.getElementById('amtSlider')?.value)||5;
  if(!matchId||!side){toast('Please select a side','error');return;}
  if(S.coins<amt){toast('Not enough coins!','error');return;}
  const o=side==='player1'?o1:o2;
  const userKey=sk(S.user);

  // FIX 1: reliable transaction
  const txResult=await db.ref(`${PATH.users}/${userKey}/coins`).transaction(c=>{
    if(c==null) return undefined;
    if(c<amt) return undefined;
    return c-amt;
  });
  if(!txResult.committed){toast('Coin transaction failed — try again','error');return;}

  S.coins=txResult.snapshot.val()??S.coins;
  const coinEl=document.getElementById('hdrCoins');
  if(coinEl){
    coinEl.textContent=S.coins;
    coinEl.classList.add('animate');
    setTimeout(()=>coinEl.classList.remove('animate'),800);
  }

  await db.ref(`${PATH.bets}/${matchId}`).push({
    user:S.user,side,amount:amt,odds:o,
    placedAt:firebase.database.ServerValue.TIMESTAMP,
    settled:false,won:false // store false instead of null
  });
  closeBet();
  const p=parsePairing(matchId,S.pairings[matchId]);
  const sn=side==='player1'?p?.player1:p?.player2;
  toast(`${amt}🪙 on ${trunc(sn,12)} @ ${o}x ✓`,'success');
}

/* ──────────────────────────────────────────────────────────
   FIX 2: renderMyBets — include outright picks in the list
   ────────────────────────────────────────────────────────── */
function renderMyBets(){
  const el=document.getElementById('myBetsList');
  const flat=[];

  // Regular match bets
  for(const[mid,bets] of Object.entries(S.myBets))
    for(const[bid,b] of Object.entries(bets))
      flat.push({mid,bid,...b,isOutright:false});

  // FIX 2: Outright picks — these were invisible before!
  for(const[qid,pick] of Object.entries(S.myOrPicks)){
    if(!pick||!pick.pick) continue;
    const q=OUTRIGHT_QUESTIONS.find(x=>x.id===qid);
    flat.push({
      mid:qid, bid:qid, user:S.user,
      side:pick.pick, amount:pick.amount||0, odds:pick.odds||1,
      placedAt:pick.placedAt||0,
      settled:pick.settled||false,
      // FIX 2: won:false (not null) is stored now; pending = !settled
      won:pick.won===true?true:false,
      refunded:false, isOutright:true,
      outrightLabel:q?`🎯 Q${q.n}: ${q.title}`:`🎯 ${qid}`
    });
  }

  if(!flat.length){
    el.innerHTML='<div class="empty"><div class="icon">🎰</div><p>You haven\'t placed any bets yet.</p></div>';
    return;
  }
  flat.sort((a,b)=>(b.placedAt||0)-(a.placedAt||0));

  let html='';
  let pending=0,won=0,lost=0,winCoins=0;
  for(const b of flat){
    // For outright bets: pending = not settled; won/lost based on settled+won flags
    const isPending = !b.settled;
    const isWon     = b.settled && b.won===true;
    const isLost    = b.settled && b.won!==true && !b.refunded;

    const pairing = b.isOutright ? null : parsePairing(b.mid,S.pairings[b.mid]);
    const sideName = b.isOutright
      ? b.side
      : (pairing ? (b.side==='player1'?pairing.player1:pairing.player2) : b.side);
    const matchLabel = b.isOutright ? b.outrightLabel : b.mid;

    let cls,tag,tagCls,detail;
    if(b.refunded){
      cls='refunded';tag='Refunded';tagCls='t-refund';detail=`${b.amount}🪙 returned`;
    } else if(isPending){
      cls='pending';tag='Pending';tagCls='t-pending';
      const pot=Math.round(b.amount*b.odds);
      detail=`${b.amount}🪙 × ${b.odds}x → pot. ${pot}🪙`;
      pending++;
    } else if(isWon){
      cls='won';tag=`+${Math.round(b.amount*b.odds)}🪙 won`;tagCls='t-won';
      detail=`${b.amount}🪙 × ${b.odds}x`;won++;winCoins+=Math.round(b.amount*b.odds);
    } else {
      cls='lost';tag='Lost';tagCls='t-lost';detail=`${b.amount}🪙 lost`;lost++;
    }

    // Cancel only available for regular (non-outright) pending bets
    const cancelBtn=(!b.isOutright&&!b.settled&&!b.refunded&&!S.results[b.mid])
      ?`<button class="btn-cancel-bet" onclick="cancelBet('${b.mid}','${b.bid}')">✕ Cancel</button>`:'';

    html+=`<div class="bet-item ${cls}">
      <div class="bi-head">
        <span class="bi-match">${esc(matchLabel)}</span>
        <span class="bi-tag ${tagCls}">${tag}</span>
      </div>
      <div class="bi-body">
        <span class="bi-on">📌 ${esc(trunc(sideName,24))}</span>
        <span class="bi-amt">${esc(detail)}</span>
      </div>
      ${cancelBtn?`<div style="text-align:right;margin-top:.35rem">${cancelBtn}</div>`:''}
    </div>`;
  }

  const summary=`<div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
    <div class="stat-chip"><strong>${pending}</strong> pending</div>
    <div class="stat-chip"><strong>${won}</strong> won</div>
    <div class="stat-chip"><strong>${lost}</strong> lost</div>
    ${won?`<div class="stat-chip" style="color:var(--success)"><strong>+${winCoins}</strong>🪙 earnings</div>`:''}
  </div>`;
  el.innerHTML=summary+html;
}

/* ──────────────────────────────────────────────────────────
   FIX 3: Manual name entry — replace window.prompt with
   inline form (prompt is blocked on many mobile browsers)
   ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{

  // Inject inline guest input row right after the loginBtn
  const loginBtn=document.getElementById('loginBtn');
  if(loginBtn && !document.getElementById('guestRow')){
    const row=document.createElement('div');
    row.id='guestRow';
    row.style.cssText='display:none;margin-top:.6rem;width:100%;max-width:400px';
    row.innerHTML=`<div class="guest-row">
      <input type="text" class="guest-input" id="guestNameInp"
        placeholder="Your full name…"
        autocomplete="off" autocorrect="off" autocapitalize="words"
        style="flex:1;font-size:16px">
      <button class="guest-btn" id="guestGoBtn">Go →</button>
    </div>`;
    loginBtn.insertAdjacentElement('afterend',row);
  }

  // FIX 3: loginBtn shows/hides the inline input instead of calling prompt()
  document.getElementById('loginBtn').onclick=()=>{
    const row=document.getElementById('guestRow');
    if(!row) return;
    const isHidden=row.style.display==='none';
    row.style.display=isHidden?'block':'none';
    if(isHidden) setTimeout(()=>document.getElementById('guestNameInp')?.focus(),50);
  };

  const _doGuest=()=>{
    const name=(document.getElementById('guestNameInp')?.value||'').trim();
    if(!name){toast('Please enter your name','error');return;}
    login(name);
  };

  document.getElementById('guestGoBtn')?.addEventListener('click',_doGuest);
  document.getElementById('guestNameInp')?.addEventListener('keydown',e=>{
    if(e.key==='Enter') _doGuest();
  });

}, {once:true}); // once:true so this doesn't conflict with the original DOMContentLoaded
