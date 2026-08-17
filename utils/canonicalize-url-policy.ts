export const CANONICALIZATION_VERSION = "1" as const
export const TRACKING_PARAMETERS_V1 = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","gclid","fbclid","msclkid"])
/** Browser- and server-safe canonical URL identity policy v1. */
export function canonicalizeDocumentUrl(rawUrl:string):string{
  if(typeof rawUrl!=="string"||rawUrl.trim()==="")throw new TypeError("Document URL must be a non-empty string")
  let url:URL;try{url=new URL(rawUrl)}catch{throw new TypeError(`Invalid document URL: ${rawUrl}`)}
  if(url.protocol!=="http:"&&url.protocol!=="https:")throw new TypeError(`Document URL must use HTTP or HTTPS: ${rawUrl}`)
  const wasDefaultPort=(url.protocol==="http:"&&url.port==="80")||(url.protocol==="https:"&&url.port==="443");if(wasDefaultPort)url.port=""
  url.protocol="https:";url.hostname=url.hostname.toLowerCase();url.hash="";if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,"")||"/"
  const retained=[...url.searchParams.entries()].filter(([key])=>!TRACKING_PARAMETERS_V1.has(key.toLowerCase())).sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv))
  url.search="";for(const[key,value]of retained)url.searchParams.append(key,value)
  return url.toString()
}
