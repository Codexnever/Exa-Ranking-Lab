import {writeFileSync} from "node:fs"

const demo={
  version:1,
  warning:"Synthetic import bundle only. It does not write to Appwrite or overwrite user data.",
  dataset:{id:"demo-evaluation-v1",name:"Exa Ranking Lab v1 Demo",status:"frozen",labels:[0,1,2]},
  queries:[
    {id:"demo-query-vector",text:"best vector database for filtered search"},
    {id:"demo-query-pricing",text:"latest API pricing"},
  ],
  runs:[
    {id:"demo-run-before",snapshotIds:["demo-snapshot-vector-a","demo-snapshot-pricing-a"]},
    {id:"demo-run-after",snapshotIds:["demo-snapshot-vector-b","demo-snapshot-pricing-b"]},
  ],
  comparison:{beforeRunId:"demo-run-before",afterRunId:"demo-run-after"},
  stageTrace:{id:"demo-trace-vector",stages:["candidate","rerank","final"]},
  strategies:[
    {id:"demo-dense",name:"Dense Baseline",source:"imported",latencyType:"end_to_end"},
    {id:"demo-hybrid-rerank",name:"Hybrid + Reranker",source:"imported",latencyType:"end_to_end"},
  ],
}
function validate(value){
  if(value.dataset.status!=="frozen"||value.queries.length<2||value.runs.length<2||value.strategies.length<2)throw new Error("Demo manifest is incomplete")
  const ids=[value.dataset.id,...value.queries.map(x=>x.id),...value.runs.map(x=>x.id),value.stageTrace.id,...value.strategies.map(x=>x.id)]
  if(ids.some(id=>!id.startsWith("demo-"))||new Set(ids).size!==ids.length)throw new Error("Demo IDs must be unique and synthetic")
}
validate(demo)
const outputIndex=process.argv.indexOf("--write")
if(outputIndex>=0){const path=process.argv[outputIndex+1];if(!path)throw new Error("--write requires an output path");writeFileSync(path,`${JSON.stringify(demo,null,2)}\n`,{flag:"wx"});console.log(`Wrote synthetic demo bundle to ${path}`)}
else console.log("Synthetic demo bundle validated. Pass --write <new-file.json> to export it; no external data was changed.")
