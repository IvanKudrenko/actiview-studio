(() => {
  'use strict';
  const adapter = {
    async command(command, state) {
      try { await fetch('/device-api/command', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command, state:{gps:state.gps, phone:state.phone, dialNumber:state.dialNumber, call:state.call}})}); }
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
    const gps=raw.gps||{}, phone=raw.phone||raw.status||{}, weather=raw.weather||{}, music=raw.music||raw.song||{}, connection=raw.connection||{};
    const connected=Boolean(connection.connected??raw.connected), tempF=weather.temperature_f??weather.temperature??weather.temp;
    return {
      gps:{...gps,status:gps.lat!=null?'3D FIX':'No fix'}, speedKmh:Math.round(Number(gps.speed_mps||raw.speed_mps||0)*3.6),
      connection:{...connection,connected,transport:String(connection.transport||'none').toUpperCase(),message:connection.message||(connected?'Connected':'Disconnected')},
      phone:{...phone,phone_name:phone.phone_name||phone.name||'iPhone',name:phone.phone_name||phone.name||'iPhone',connection:connected?'Connected':'Disconnected'},
      weather:{...weather,temperature_f:tempF,temperature:tempF==null?'--':Math.round((Number(tempF)-32)*5/9),summary:weather.summary||weather.description||weather.condition||'No weather',description:weather.summary||weather.description||weather.condition||'No weather'},
      music:{...music,title:music.title||music.track||'No song',track:music.title||music.track||'No song',artist:music.artist||'--',source:music.source||music.album||'--',playing:!!music.playing},
      breadcrumbs:raw.breadcrumbs||[],route:raw.active_route||raw.route||{},active_trip:raw.active_trip||null,trip:raw.trip||{},contacts:raw.contacts||[],waypointsText:raw.waypointsText||'',
      call:raw.call_state||raw.call||{},time:phone.time_text||new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
    };
  }
  function fit(display){const scale=Math.min(innerWidth/display.width,innerHeight/display.height);document.querySelector('#device').style.transform=`scale(${scale})`;}
  window.addEventListener('resize',()=>runtime.project&&fit(runtime.project.display));
  start().catch(error=>{document.body.textContent=`ActiView runtime failed: ${error.message}`;document.body.style.color='white';});
})();
