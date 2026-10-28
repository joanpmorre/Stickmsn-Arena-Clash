(() => {
 const select = document.getElementById('controlMode');
 if (!select) return;
 let saved = 'auto';
 try { saved = localStorage.getItem('sac-control-mode') || 'auto'; } catch(e) {}
 select.value = saved;
 function applyMode() {
   const mode = select.value;
   document.body.classList.remove('mode-computer','mode-mobile');
   if (mode === 'computer') document.body.classList.add('mode-computer');
   if (mode === 'mobile') document.body.classList.add('mode-mobile');
   try { localStorage.setItem('sac-control-mode', mode); } catch(e) {}
   const help = document.getElementById('controlModeHelp');
   if (help) help.textContent = mode === 'computer' ? 'Keyboard controls enabled.' : mode === 'mobile' ? 'Touch joystick and action buttons enabled.' : 'Controls are selected automatically based on screen size.';
 }
 select.addEventListener('change', applyMode);
 applyMode();
})();
