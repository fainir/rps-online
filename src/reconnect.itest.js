const WebSocket = require('ws');
const URL = process.argv[2] || 'ws://localhost:3000/ws';
function mk(){const ws=new WebSocket(URL);const c={ws,msgs:[],team:null,code:null,token:null,view:null};
ws.on('message',r=>{const m=JSON.parse(r);c.msgs.push(m.type);
if(m.type==='created'){c.code=m.code;c.team=m.you;c.token=m.token;}
if(m.type==='joined'){c.code=m.code;c.team=m.you;c.token=m.token;}
if(m.type==='state'){c.team=m.you;c.view=m.view;}if(m.type==='error')c.error=m.error;});
c.send=o=>ws.send(JSON.stringify(o));return c;}
const until=(f,t=3000)=>new Promise((res,rej)=>{const s=Date.now();(function l(){if(f())return res();if(Date.now()-s>t)return rej(new Error('timeout'));setTimeout(l,20);})();});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let fails=0;const ok=(c,m)=>{if(!c){fails++;console.error('FAIL:',m);}else console.log('ok -',m);};
const A=mk(),B=mk();await until(()=>A.ws.readyState===1&&B.ws.readyState===1);
A.send({type:'create',team:'red',name:'A'});await until(()=>!!A.code);
B.send({type:'join',code:A.code,name:'B'});await until(()=>B.team==='blue');
A.send({type:'ready'});B.send({type:'ready'});await until(()=>A.view&&A.view.phase==='playing');
// NEW tab reconnects with A's token while A's old socket is STILL connected (refresh race)
const A2=mk();await until(()=>A2.ws.readyState===1);
A2.send({type:'join',code:A.code,name:'A',token:A.token});
await until(()=>A2.team||A2.error,3000).catch(()=>{});
ok(A2.team==='red'&&!A2.error,'token reclaims red even while old socket still connected (refresh race)');
await until(()=>A2.view&&A2.view.phase==='playing',2000).catch(()=>{});
ok(A2.view&&A2.view.phase==='playing','reconnected client gets the live game state');
A.ws.close();A2.ws.close();B.ws.close();
console.log('\n'+(fails===0?'ALL PASS':fails+' FAILED'));process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
