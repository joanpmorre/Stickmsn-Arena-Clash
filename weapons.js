/* Weapon selector: cosmetic weapon props follow the chosen character weapon. */
(() => {
 const weapons = [
  {id:'sword', name:'⚔ Sword'}, {id:'katana', name:'🗡 Katana'},
  {id:'bow', name:'🏹 Bow'}, {id:'axe', name:'🪓 Battle Axe'},
  {id:'staff', name:'✨ Energy Staff'}, {id:'none', name:'✊ Unarmed'}
 ];
 let weapon = 'sword';
 try { weapon = localStorage.getItem('sacWeapon') || 'sword'; } catch(e) {}
 const options = document.querySelector('.options');
 if (!options) return;
 const heading = [...options.querySelectorAll('h3')].find(h => /OUTFIT/i.test(h.textContent));
 if (!heading) return;
 const section = document.createElement('div');
 section.innerHTML = '<h3>WEAPON</h3><div class="weapon-options" id="weaponOptions"></div>';
 heading.parentNode.insertBefore(section, heading.nextSibling);
 const list = section.querySelector('#weaponOptions');
 weapons.forEach(w => { const b=document.createElement('button'); b.textContent=w.name; b.dataset.weapon=w.id; b.onclick=()=>{weapon=w.id; try{localStorage.setItem('sacWeapon',weapon)}catch(e){}; refresh();}; list.appendChild(b); });
 function attach(el){ if(!el) return; const handArm=el.querySelector('.a2') || el.querySelector('.a1'); if(!handArm) return; let prop=handArm.querySelector(':scope > .weapon-prop'); if(!prop){prop=document.createElement('span');prop.className='weapon-prop';handArm.appendChild(prop)} prop.dataset.weapon=weapon; prop.style.display=weapon==='none'?'none':''; }
 function refresh(){ list.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.weapon===weapon)); document.querySelectorAll('.fighter').forEach(attach); }
 function weaponId(){ try { return localStorage.getItem('sacWeapon') || 'sword'; } catch(e) { return 'sword'; } }
 // Selected weapons now affect combat damage as well as appearance.
 const baseDealDamage = window.dealDamage;
 if (typeof baseDealDamage === 'function' && !window.__weaponDamageHooked) {
   window.__weaponDamageHooked = true;
   window.dealDamage = function(a,t,type,ranged){
     const w = weaponId();
     const bonus = ({sword:1.08,katana:1.16,bow:1.04,axe:1.22,staff:1.12,none:0.88})[w] || 1;
     const oldMult = a.mult;
     a.mult = (oldMult || 1) * bonus;
     try { return baseDealDamage(a,t,type,ranged); }
     finally { a.mult = oldMult; }
   };
 }
 const oldStart=window.startGame;
 if(typeof oldStart==='function') window.startGame=function(...args){const r=oldStart.apply(this,args); setTimeout(refresh,0); return r;};
 const observer=new MutationObserver(()=>refresh()); observer.observe(document.body,{childList:true,subtree:true});
 refresh();
})();



/* HEALTH BAR + COLLECTIBLE MEDKITS UPGRADE */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .hud .hp { height: 15px; width: min(280px,27vw); border: 1px solid #52677e; background: #080f1c; box-shadow: inset 0 2px 5px #000b; position:relative; }
    .hud .hp span { border-radius: 10px; background: linear-gradient(180deg,#b7ffcf 0%,#30ef87 45%,#0b9f58 100%); box-shadow: 0 0 10px #20f58b88; position:relative; transition: width .22s ease, background .2s; }
    .hud .hp span::after { content:""; position:absolute; inset:2px 3px auto; height:3px; border-radius:8px; background:#ffffff66; }
    .hud .hp span.low-health { background:linear-gradient(180deg,#ff9d9d,#ff354d 55%,#a90828); box-shadow:0 0 12px #ff244f; animation: hpPulse .55s infinite alternate; }
    .hud .hp span.mid-health { background:linear-gradient(180deg,#fff0a1,#ffc52e 55%,#b86a05); box-shadow:0 0 8px #ffbe2e88; }
    @keyframes hpPulse { to { filter:brightness(1.35); } }
    .medkit { position:absolute; z-index:16; width:38px;height:38px; display:grid;place-items:center; border:2px solid #c7ffe0;border-radius:10px; background:linear-gradient(145deg,#20ed91,#087b58); color:white; font:bold 25px Arial; text-shadow:0 2px 4px #075b3b; box-shadow:0 0 12px #36ffad, inset 0 0 7px #ffffff66; cursor:pointer; animation: medkitFloat .8s ease-in-out infinite alternate; }
    .medkit::after { content:'+'; }
    @keyframes medkitFloat { to { transform:translateY(-8px) rotate(5deg); } }
    .medkit-note { position:absolute; z-index:17; left:50%; top:32%; transform:translateX(-50%); padding:8px 13px; border:1px solid #43ffae; border-radius:8px; background:#04251beF; color:#8dffca; font:bold 14px Arial; box-shadow:0 0 18px #20f58b66; pointer-events:none; }
    @media(max-width:700px){ .hud .hp{height:12px;width:28vw}.medkit{width:32px;height:32px;font-size:22px} }
  `;
  document.head.appendChild(style);
  const playerBar = document.querySelector('#php');
  const enemyBar = document.querySelector('#ehp');
  const originalUpdateHP = window.updateHP;
  function styleBar(el, value) {
    if (!el) return;
    const n = Math.max(0, Math.min(100, Number(value) || 0));
    el.style.width = n + '%';
    el.classList.toggle('low-health', n <= 25);
    el.classList.toggle('mid-health', n > 25 && n <= 55);
    el.title = Math.round(n) + '% health';
  }
  // Wrap the existing update routine so all combat modes keep their current logic.
  if (typeof originalUpdateHP === 'function') {
    window.updateHP = function() {
      originalUpdateHP();
      styleBar(playerBar, php);
      styleBar(enemyBar, ehp);
    };
  }
  let lastMedkit = 0;
  function announceHeal(amount) {
    const note = document.createElement('div'); note.className='medkit-note';
    note.textContent = '✚ +' + amount + ' HEALTH';
    document.querySelector('#arena')?.appendChild(note);
    setTimeout(() => note.remove(), 1100);
  }
  function spawnMedkit(x) {
    const arena = document.querySelector('#arena');
    if (!arena || document.querySelectorAll('.medkit').length >= 2) return;
    const kit = document.createElement('button'); kit.type='button'; kit.className='medkit';
    kit.setAttribute('aria-label','Collect health pack to restore 25 health');
    kit.title='Health pack: restore 25 HP';
    const pos = Math.max(8, Math.min(88, Number(x) || 50)); kit.style.left=pos+'%'; kit.style.bottom='29%';
    kit.dataset.x=String(pos);
    kit.addEventListener('click', () => collect(kit));
    arena.appendChild(kit);
    setTimeout(() => { if (kit.isConnected) kit.remove(); }, 12000);
  }
  function collect(kit) {
    if (!kit || !kit.isConnected || versus || !active || paused) return;
    const before = Number(php) || 0;
    const after = Math.min(100, before + 25);
    if (after <= before) {
      announceHeal(0); kit.remove(); return;
    }
    php = after;
    if (typeof updateHP === 'function') updateHP();
    announceHeal(after-before);
    if (typeof floatText === 'function') floatText('+'+(after-before)+' HP', Number(playerX || 12)+3, 38);
    kit.remove();
  }
  // Enemies can drop a medkit; an additional pack appears periodically during battle.
  const oldKill = kill;
  if (typeof oldKill === 'function') window.kill = function(target) {
    const x = target && typeof target.x === 'number' ? target.x : (Number(playerX)||12)+12;
    const isEnemy = target && target !== P1 && target !== P2 && target.el !== document.querySelector('#player');
    const result = oldKill.apply(this, arguments);
    if (isEnemy && Math.random() < 0.42) spawnMedkit(x);
    return result;
  };
  setInterval(() => {
    if (!active || paused || versus || document.querySelector('#game')?.classList.contains('hidden')) return;
    const now=Date.now();
    if (now-lastMedkit < 11000) return;
    lastMedkit=now;
    if (Number(php) < 85) spawnMedkit(Math.max(12,Math.min(82,(Number(playerX)||12)+ (Math.random()<.5 ? 18 : 35))));
  }, 1000);
  // Touching a pack with your fighter collects it automatically.
  setInterval(() => {
    if (!active || paused || versus) return;
    const px=Number(playerX)||12;
    document.querySelectorAll('.medkit').forEach(k => { if (Math.abs(px-Number(k.dataset.x)) < 7) collect(k); });
  }, 160);
  // Slightly more recovery between waves, without exceeding full health.
  const oldCheckWave = checkWave;
  if (typeof oldCheckWave === 'function') window.checkWave = function() {
    const before=Number(php)||0;
    const result=oldCheckWave.apply(this,arguments);
    if (Number(php) > before) php=Math.min(100,Number(php)+5);
    if (typeof updateHP==='function') updateHP();
    return result;
  };
  if (typeof updateHP==='function') updateHP();
})();
