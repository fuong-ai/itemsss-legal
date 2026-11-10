// itemsss legal pages: check that the public web pages say exactly what the app says.
// Self-contained (no dependencies). Used in the public itemsss-legal repo and by
// the private app repo's page builder.
//
//   node check.mjs <path to the app's information_screen.dart> [pages folder]
//
// Every title, "Last updated" date, heading, paragraph and bullet of the app's
// Privacy Policy, Data Usage & Retention and Terms of Use must appear, in order,
// in privacy/index.html or terms/index.html; the Support page text (below) must
// appear in support/index.html. Exit code 1 on any difference.
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

// Support page (no matching app screen). Single source of its text; approved by
// Miki 10/11/2026. [[...]] marks an app button/screen label: the private builder
// checks each one exists in the app code, so the steps never name a wrong button.
export const SUPPORT_EMAIL='support@itemsss.app';
export const SUPPORT_PAGE={
 title:'Support',
 blocks:[
  {type:'p',text:`Need help with itemsss? Email us at ${SUPPORT_EMAIL}. We aim to reply within a few days.`},
  {type:'section',title:'Delete your account',ordered:[
   'Open itemsss and go to [[Account]] → [[Delete Account]].',
   'If you have Pro with auto-renewal on, first cancel it in Settings > [your name] > Subscriptions on your iPhone. Deleting your account does not cancel an App Store subscription.',
   'Tap [[Confirm]]. Your account, items and photos are deleted right away and cannot be recovered.',
  ],paragraphs:[`Can't open the app? Email ${SUPPORT_EMAIL} from the email address of your account and we'll delete your account and data within 30 days.`]},
  {type:'section',title:'Restore a purchase',paragraphs:['Go to [[Account]] → [[Billing Information]] → [[Restore]].']},
 ],
};
export const plainSupport=t=>t.replace(/\[\[|\]\]/g,'');
export function supportLabels(){
 const all=JSON.stringify(SUPPORT_PAGE);
 return [...new Set([...all.matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>m[1]))];
}
export function supportTexts(){
 const out=[SUPPORT_PAGE.title];
 for(const b of SUPPORT_PAGE.blocks){
  if(b.type==='p')out.push(plainSupport(b.text));
  else out.push(b.title,...(b.ordered??[]).map(plainSupport),...(b.paragraphs??[]).map(plainSupport));
 }
 return out;
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
const visibleText=html=>decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<\/?(a|strong|em|b|i|span)\b[^>]*>/g,'').replace(/<[^>]+>/g,'\n'))
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
 {
  const lines=visibleText(readFileSync(join(pagesDir,'support/index.html'),'utf8'));
  let at=0;
  for(const text of supportTexts()){
   const want=text.replace(/\s+/g,' ').trim();checked++;
   const found=lines.indexOf(want,at);
   if(found<0){console.log(`NOT_ON_WEB support/index.html: ${want.slice(0,90)}`);problems++;}else at=found+1;
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
