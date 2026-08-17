"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/utils/utils"
import type { RelevanceGrade } from "@/types/evaluation"

export const RELEVANCE_GRADES=[
  {grade:0 as const,label:"Not relevant"},
  {grade:1 as const,label:"Relevant"},
  {grade:2 as const,label:"Highly relevant"},
]

export function RelevanceGradeControl({value,onChange,disabled=false}:{value?:RelevanceGrade;onChange:(grade:RelevanceGrade)=>void;disabled?:boolean}){
  return <div role="radiogroup" aria-label="Relevance grade" className="flex flex-wrap gap-2">{RELEVANCE_GRADES.map(item=><Button key={item.grade} type="button" role="radio" aria-checked={value===item.grade} disabled={disabled} variant={value===item.grade?"default":"outline"} size="sm" onClick={()=>onChange(item.grade)} className={cn("justify-start",value===item.grade&&"ring-2 ring-blue-300")}>{item.grade} — {item.label}</Button>)}</div>
}

export function gradeLabel(grade:RelevanceGrade){return RELEVANCE_GRADES.find(item=>item.grade===grade)!.label}
