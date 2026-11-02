#!/bin/bash
# usage: q.sh file.sql  -> prints rows as compact JSON lines
cd /c/Users/nicol/fill-and-sell
npx supabase db query --linked --read-only -f "$1" 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=s.indexOf("{");try{const j=JSON.parse(s.slice(i));for(const r of j.rows)console.log(JSON.stringify(r));}catch(e){console.log(s)}})'
