import { FIT_JS, XTERM_CSS, XTERM_JS } from './xtermBundle.generated';

/** The page the xterm.js WebView renderer loads: bytes in through `__w(base64)`, events out as JSON. */
export function xtermHtml(options: { fontSize: number; background: string; foreground: string }) {
  const { fontSize, background, foreground } = options;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${XTERM_CSS}
html,body,#t{margin:0;height:100%;background:${background};overflow:hidden}</style></head>
<body><div id="t"></div>
<script>${XTERM_JS}</script><script>${FIT_JS}</script>
<script>
var post=function(o){window.ReactNativeWebView.postMessage(JSON.stringify(o));};
var term=new Terminal({fontSize:${fontSize},fontFamily:'Menlo,monospace',scrollback:5000,
  theme:{background:'${background}',foreground:'${foreground}'}});
var fit=new FitAddon.FitAddon();term.loadAddon(fit);
term.open(document.getElementById('t'));fit.fit();
var parsed=0;
term.onData(function(d){post({t:'input',d:d});});
term.onResize(function(s){post({t:'resize',cols:s.cols,rows:s.rows});});
window.addEventListener('resize',function(){fit.fit();});
window.__w=function(b64){var bin=atob(b64),u=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  term.write(u,function(){parsed+=u.length;});};
window.__t=function(s){term.write(s);};
setInterval(function(){post({t:'parsed',n:parsed});},250);
post({t:'ready',cols:term.cols,rows:term.rows});
</script></body></html>`;
}
