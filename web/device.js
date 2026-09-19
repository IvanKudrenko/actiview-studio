(() => {
  'use strict';
  const adapter = {
    async command(command, state) {
      try { await fetch('/device-api/command', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command, state:{gps:state.gps, phone:state.phone}})}); }
      catch (error) { console.warn('ActiView command failed', error); }
    }
  };
  const runtime = new ActiViewRuntime(document.querySelector('#device'), {mode:'simulate', adapter});
  async function start() {
    const project = await fetch('project/project.json', {cache:'no-store'}).then(response => response.json());
    runtime.load(project); fit(project.display);
    await poll(); setInterval(poll, 1000);
  }
  async function poll() {
    try {
      const response = await fetch('/device-api/state', {cache:'no-store'}); if (!response.ok) throw new Error(String(response.status));
      const raw = await response.json(); runtime.setState(normalize(raw));
    } catch (_) { runtime.setState({phone:{connection:'Disconnected'}, gps:{status:'No fix'}}); }
  }
  function normalize(raw) {
    const gps=raw.gps||{}, phone=raw.phone||raw.status||{}, weather=raw.weather||{}, music=raw.music||{};
    return {gps:{...gps,status:gps.lat!=null?'3D fix':'No fix'},speedKmh:Math.round(Number(gps.speed_mps||raw.speed_mps||0)*3.6),phone:{...phone,name:phone.phone_name||phone.name||'Phone',connection:raw.connection?.connected||raw.connected?'Connected':'Disconnected'},weather:{temperature:weather.temperature??weather.temp,description:weather.description||weather.condition||'No data'},music:{track:music.track||music.title||'No song',artist:music.artist||'--',playing:!!music.playing},trip:raw.trip||{},call:raw.call_state||raw.call||{},time:phone.time_text||new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};
  }
  function fit(display){const scale=Math.min(innerWidth/display.width,innerHeight/display.height);document.querySelector('#device').style.transform=`scale(${scale})`;}
  window.addEventListener('resize',()=>runtime.project&&fit(runtime.project.display));
  start().catch(error=>{document.body.textContent=`ActiView runtime failed: ${error.message}`;document.body.style.color='white';});
})();

