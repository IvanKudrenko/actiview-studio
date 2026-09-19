(() => {
  'use strict';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const RUNTIME_VERSION = '1.1.0';
  const DB_NAME = 'actiview-studio';
  const DB_STORE = 'projects';
  const DB_KEY = 'current';

  class Platform {
    constructor() { this.localBackend = false; }

    async initialize() {
      try {
        const response = await fetch('api/health', {cache:'no-store'});
        const health = response.ok ? await response.json() : null;
        this.localBackend = health?.studioVersion === RUNTIME_VERSION;
      } catch (_) { this.localBackend = false; }
      return this.localBackend;
    }

    async loadProject() {
      const bundledProject = await this.loadBundledProject();
      if (this.localBackend) {
        const response = await fetch('api/project', {cache:'no-store'});
        if (!response.ok) throw new Error(await response.text());
        return {project:await response.json(), bundledProject, source:'local project'};
      }
      const saved = await this.readSaved();
      if (saved) return {project:saved, bundledProject, source:'this browser', updateAvailable:saved.sourceRevision !== bundledProject.sourceRevision};
      return {project:bundledProject, bundledProject, source:'bundled project'};
    }

    async loadBundledProject() {
      const response = await fetch('project/project.json', {cache:'no-store'});
      if (!response.ok) throw new Error('The bundled ActiView project could not be loaded.');
      return response.json();
    }

    async saveProject(project) {
      if (this.localBackend) {
        const response = await fetch('api/project', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(project)});
        if (!response.ok) throw new Error(await response.text());
        return 'Saved to the local project file.';
      }
      await this.writeSaved(project);
      return 'Saved in this browser only. Download a project to move it to another device.';
    }

    async exportProject(project) {
      if (this.localBackend) {
        const response = await fetch('api/export', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(project)});
        if (!response.ok) throw new Error(await response.text());
        return response.blob();
      }
      const entries = new Map();
      entries.set('project/project.json', encoder.encode(canonicalJSON(project)));
      const listing = await fetch('package-files.json', {cache:'no-store'}).then(checkResponse).then(response => response.json());
      for (const item of listing) {
        const response = await fetch(item.source, {cache:'no-store'});
        if (!response.ok) throw new Error(`Required export file is unavailable: ${item.source}`);
        entries.set(item.target, new Uint8Array(await response.arrayBuffer()));
      }
      const checksums = {};
      for (const [name, bytes] of [...entries].sort(([a],[b]) => a.localeCompare(b))) checksums[name] = await sha256(bytes);
      const manifest = {
        checksums,
        createdBy:'ActiView Studio',
        entrypoint:'launch_device.sh',
        format:'actiview-export',
        formatVersion:1,
        requiredFiles:[...entries.keys()].sort(),
        runtimeVersion:RUNTIME_VERSION,
        target:{backend:'activeview.v1', display:project.display, platform:'raspberry-pi'}
      };
      entries.set('manifest.json', encoder.encode(canonicalJSON(manifest)));
      return new Blob([createZip(entries)], {type:'application/zip'});
    }

    async importProject(file) {
      if (!file.name.toLowerCase().endsWith('.zip')) return JSON.parse(await file.text());
      if (this.localBackend) {
        const data = new FormData(); data.append('file', file);
        const response = await fetch('api/import', {method:'POST', body:data});
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }
      const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
      if (!entries.has('manifest.json') || !entries.has('project/project.json')) throw new Error('Archive is missing manifest.json or project/project.json.');
      const manifest = JSON.parse(decoder.decode(entries.get('manifest.json')));
      if (manifest.format !== 'actiview-export' || manifest.formatVersion !== 1) throw new Error('Unsupported ActiView export format.');
      for (const [name, expected] of Object.entries(manifest.checksums || {})) {
        const bytes = entries.get(name);
        if (!bytes) throw new Error(`Archive is missing ${name}.`);
        if (await sha256(bytes) !== expected) throw new Error(`Checksum failed for ${name}.`);
      }
      return JSON.parse(decoder.decode(entries.get('project/project.json')));
    }

    readSaved() { return idbRequest('readonly', store => store.get(DB_KEY)); }
    writeSaved(project) { return idbRequest('readwrite', store => store.put(JSON.parse(JSON.stringify(project)), DB_KEY)); }
  }

  function idbRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('This browser does not support IndexedDB.'));
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(DB_STORE)) open.result.createObjectStore(DB_STORE); };
      open.onerror = () => reject(open.error || new Error('Browser storage could not be opened.'));
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction(DB_STORE, mode); const request = operation(tx.objectStore(DB_STORE));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Browser storage operation failed.'));
        tx.oncomplete = () => db.close();
      };
    });
  }

  function canonicalJSON(value) {
    return JSON.stringify(sortValue(value), null, 2) + '\n';
  }
  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
    return value;
  }
  function checkResponse(response) { if (!response.ok) throw new Error(`Unable to load ${response.url}`); return response; }
  async function sha256(bytes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map(value => value.toString(16).padStart(2,'0')).join('');
  }

  function createZip(entries) {
    const localParts = [], centralParts = []; let offset = 0; const sorted = [...entries].sort(([a],[b]) => a.localeCompare(b));
    for (const [name, dataValue] of sorted) {
      const nameBytes=encoder.encode(name), data=dataValue instanceof Uint8Array?dataValue:new Uint8Array(dataValue), crc=crc32(data);
      const local=new Uint8Array(30+nameBytes.length); const l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x0800,true);l.setUint16(8,0,true);l.setUint16(10,0,true);l.setUint16(12,23585,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,nameBytes.length,true);local.set(nameBytes,30);
      localParts.push(local,data);
      const central=new Uint8Array(46+nameBytes.length);const c=new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,23585,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,nameBytes.length,true);c.setUint32(38,(name.endsWith('.sh')||name.endsWith('.py')?0o100755:0o100644)<<16,true);c.setUint32(42,offset,true);central.set(nameBytes,46);centralParts.push(central);
      offset += local.length + data.length;
    }
    const centralSize=centralParts.reduce((sum,part)=>sum+part.length,0), end=new Uint8Array(22), e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,sorted.length,true);e.setUint16(10,sorted.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return concat([...localParts,...centralParts,end]);
  }

  async function readZip(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
    if(end<0)throw new Error('Invalid ZIP archive.');const count=view.getUint16(end+10,true),entries=new Map();let cursor=view.getUint32(end+16,true);
    for(let i=0;i<count;i++){
      if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('Invalid ZIP directory.');
      const method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),localOffset=view.getUint32(cursor+42,true);
      const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLength)); if(name.startsWith('/')||name.split('/').includes('..'))throw new Error('Unsafe archive path.');
      if(view.getUint32(localOffset,true)!==0x04034b50)throw new Error('Invalid ZIP entry.');const localName=view.getUint16(localOffset+26,true),localExtra=view.getUint16(localOffset+28,true),start=localOffset+30+localName+localExtra,raw=bytes.slice(start,start+compressed);
      let data;if(method===0)data=raw;else if(method===8)data=await inflateRaw(raw);else throw new Error(`Unsupported ZIP compression method: ${method}`);
      if(data.length!==size)throw new Error(`Invalid size for ${name}.`);entries.set(name,data);cursor+=46+nameLength+extraLength+commentLength;
    }
    return entries;
  }
  async function inflateRaw(bytes) {
    if (!window.DecompressionStream) throw new Error('This browser cannot open compressed ZIP files. Use a current Safari, Chrome, or Firefox.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function concat(parts){const size=parts.reduce((sum,p)=>sum+p.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
  const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0;}

  window.ActiViewPlatform = new Platform();
  window.ActiViewZip = {createZip, readZip, canonicalJSON, sha256};
})();
