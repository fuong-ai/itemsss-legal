// itemsss legal pages: check that the public web pages say exactly what the app says.
// Self-contained (no dependencies). Used in the public itemsss-legal repo and by
// the private app repo's page builder.
//
//   node check.mjs <path to the app's information_screen.dart> [pages folder]
//
// Every title, "Last updated" date, heading, paragraph and bullet of the app's
// Privacy Policy, Data Usage & Retention and Terms of Use must appear, in order,
// in privacy/index.html or terms/index.html. Exit code 1 on any difference.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// --- Parse the Dart source (only the information pages) ---------------------
function dartStrings(src){
 // Tokens: identifiers and string literals (adjacent literals are joined).
 const tokens=[];let i=0;
 while(i<src.length){
  const c=src[i];
  if(c==='/'&&src[i+1]==='/'){while(i<src.length&&src[i]!=='\n')i++;continue;}
  if(c==='\''||c==='"'){
   const q=c;let s='';i++;
   while(i<src.length&&src[i]!==q){
    if(src[i]==='\\'){const n=src[i+1];s+=n==='n'?'\n':n;i+=2;continue;}
    s+=src[i++];
   }
   i++;
   const last=tokens[tokens.length-1];
   if(last&&last.t==='s'&&last.adjacent)last.v+=s;else tokens.push({t:'s',v:s,adjacent:true});
   continue;
  }
  if(/[A-Za-z_]/.test(c)){let s='';while(i<src.length&&/[\w]/.test(src[i]))s+=src[i++];tokens.push({t:'id',v:s});continue;}
  if(!/\s/.test(c)){const last=tokens[tokens.length-1];if(last&&last.t==='s')last.adjacent=false;tokens.push({t:'p',v:c});}
  i++;
 }
 return tokens;
}

export function parseInformationPages(dart){
 const pages={};
 const re=/AccountInformationPage\.(\w+)\s*=>\s*const\s+_InformationContent\(/g;
 const starts=[...dart.matchAll(re)].map(m=>({key:m[1],at:m.index}));
 for(let k=0;k<starts.length;k++){
  const region=dart.slice(starts[k].at,k+1<starts.length?starts[k+1].at:undefined);
  const t=dartStrings(region);
  const page={title:null,lastUpdated:'October 2026',blocks:[]};
  let cur=null,list=null;
  for(let j=0;j<t.length;j++){
   const x=t[j];
   if(x.t==='id'&&x.v==='title'&&t[j+1]?.v===':'&&t[j+2]?.t==='s'&&!page.title){page.title=t[j+2].v;j+=2;continue;}
   if(x.t==='id'&&x.v==='lastUpdated'&&t[j+2]?.t==='s'){page.lastUpdated=t[j+2].v;j+=2;continue;}
   if(x.t==='id'&&x.v==='_ParagraphBlock'){cur={type:'p',text:null};page.blocks.push(cur);list=null;continue;}
   if(x.t==='id'&&x.v==='_SectionBlock'){cur={type:'section',title:null,paragraphs:[],bullets:[]};page.blocks.push(cur);list=null;continue;}
   if(x.t==='id'&&(x.v==='paragraphs'||x.v==='bullets')&&cur?.type==='section'){list=cur[x.v];continue;}
   if(x.t==='s'&&cur){
    if(cur.type==='p'&&cur.text===null)cur.text=x.v;
    else if(cur.type==='section'&&cur.title===null)cur.title=x.v;
    else if(list)list.push(x.v);
   }
  }
  pages[starts[k].key]=page;
 }
 return pages;
}

// Which app pages go on which web page, in this order.
export const WEB_PAGES={
 'privacy/index.html':['privacyPolicy','dataUsageRetention'],
 'terms/index.html':['termsOfUse'],
};

export function expectedTexts(page){
 const out=[page.title,`Last updated: ${page.lastUpdated}`];
 for(const b of page.blocks){
  if(b.type==='p')out.push(b.text);
  else out.push(b.title,...b.paragraphs,...b.bullets);
 }
 return out;
}

const decode=s=>s.replace(/&#39;/g,'\'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const visibleText=html=>decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,'\n'))
 .split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);

export function check(dartPath,pagesDir){
 const pages=parseInformationPages(readFileSync(dartPath,'utf8'));
 let problems=0,checked=0;
 for(const [file,keys] of Object.entries(WEB_PAGES)){
  const lines=visibleText(readFileSync(join(pagesDir,file),'utf8'));
  let at=0;
  for(const key of keys){
   if(!pages[key]){console.log(`MISSING_APP_PAGE ${key}`);problems++;continue;}
   for(const text of expectedTexts(pages[key])){
    const want=text.replace(/\s+/g,' ').trim();checked++;
    const found=lines.indexOf(want,at);
    if(found<0){console.log(`NOT_ON_WEB ${file}: ${want.slice(0,90)}`);problems++;}
    else at=found+1;
   }
  }
 }
 console.log(problems?`LEGAL_PAGES_MATCH=FAIL (${problems} of ${checked})`:`LEGAL_PAGES_MATCH=PASS (${checked} texts)`);
 return problems===0;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [dart,dir='.']=process.argv.slice(2);
 if(!dart){console.log('usage: node check.mjs <information_screen.dart> [pages folder]');process.exit(2);}
 process.exit(check(dart,dir)?0:1);
}
